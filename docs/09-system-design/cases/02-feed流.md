# feed 流

feed 流是“关注的人发内容，我打开时看到时间线”的系统。难点不在存帖子，而在：

- 推还是拉
- 大 V 怎么处理
- 删除/权限怎么同步
- 分页稳定性
- fanout 延迟

## 1. 需求

### 功能

- 发帖
- 关注/取关
- 查看关注流（home feed）
- 查看个人页（user timeline）
- 删除/隐藏帖子
- 私密账号/拉黑

### 非功能

| 维度 | 目标 |
|---|---|
| 读延迟 | feed p95 < 200ms |
| 可用性 | 99.9% |
| 一致性 | 发帖最终出现在 follower feed；自己的帖子读己之写 |
| 规模 | 1000 万 DAU，100 万帖/天，1 亿 feed 读/天 |
| 分页 | cursor，稳定、不重复 |
| 删除 | 尽快不可见 |
| 成本 | fanout 可控 |

非目标：

- 第一版不做复杂推荐排序
- 不做全文搜索
- 不做跨地域强一致

## 2. 容量

假设：

```text
DAU = 10,000,000
posts/day = 1,000,000
feed reads/day = 100,000,000
avg followers = 200
peak factor = 3
```

粗算：

| 指标 | 结果 |
|---|---:|
| 平均发帖 QPS | 11.6 |
| 平均 feed 读 QPS | 1157.4 |
| 峰值 feed 读 QPS | 3472.2 |
| 平均 fanout 写/秒 | 约 2315 |
| 峰值 fanout 写/秒 | 约 6944 |
| 30 天 inbox 原始量 | 约 600 GB |
| 3 副本 + 开销 | 约 2.7 TB |

计算口径：30 天 inbox = 1M 帖/天 × 200 follower × 30 天 × 100 B/条 ≈ 600 GB；按 3 副本、索引/开销 1.5× 估算 ≈ 2.7 TB。

结论：

- 读远多于写，但 fanout 写会被 follower 数放大
- 大 V 的 fanout 不能按普通用户处理
- 第一版可以 hybrid，不必全推或全拉

这些是示例假设，不是实际业务数据。

## 3. 推 vs 拉 vs hybrid

| 方案 | 写 | 读 | 适合 | 问题 |
|---|---|---|---|---|
| 推（fanout-on-write） | 发帖写所有 follower inbox | 读自己的 inbox，快 | 普通用户、读多 | 大 V 写放大 |
| 拉（fanout-on-read） | 只存帖子 | 读时查关注列表并归并 | 大 V、写少 | 读放大、延迟 |
| Hybrid | 普通用户推，大 V 拉 | inbox + 归并 | 大多数社交产品 | 逻辑复杂 |

选择：

- 普通用户：fanout-on-write
- 大 V/celebrity：fanout-on-read
- 读时把 inbox 和大 V 最新帖子归并
- 阈值按 follower 数/写入成本调

没有“永远推”或“永远拉”；数据分布决定。

## 4. API

### 发帖

```http
POST /v1/posts
Authorization: Bearer ...
Idempotency-Key: ...

{"text":"...","visibility":"public"}
```

返回：

```json
{"post_id":"p_123","created_at":"..."}
```

### Feed

```http
GET /v1/feed?cursor=...&limit=20
```

返回：

```json
{
  "items":[{"post_id":"p_123","author_id":"u_1","created_at":"..."}],
  "next_cursor":"..."
}
```

### 个人页

```http
GET /v1/users/{id}/posts?cursor=...
```

### 关注

```http
POST /v1/users/{id}/follow
DELETE /v1/users/{id}/follow
```

API 细节参考[API 与契约](../architecture/03-API与契约.md)。

## 5. 数据模型

```text
posts(
  id, author_id, text, visibility,
  created_at, deleted_at
)

follows(
  follower_id, followee_id, created_at,
  primary key(follower_id, followee_id),
  index(followee_id, follower_id)
)

feed_inbox(
  user_id, post_id, author_id, created_at,
  primary key(user_id, post_id),
  index(user_id, created_at desc)
)
```

要点：

- `feed_inbox` 按 user 分区/分片
- 帖子删除用 tombstone 或读时过滤
- 关注关系双向索引：我关注谁、谁关注我
- 大 V 不写 inbox，读时单独拉

## 6. fanout

发帖后：

```text
PostCreated → queue → fanout worker
  → 查 follower 列表
  → 批量写 follower inbox
```

要点：

- 批量写，不要一条一条
- 幂等：`(user_id, post_id)` 唯一
- 失败重试/DLQ
- 大 V 跳过 fanout
- 非活跃用户可延迟/跳过（按产品）
- fanout lag 要监控

删除：

- 写 tombstone
- 读时过滤
- 或异步删除 inbox 条目
- 私密/拉黑变更要能立即影响读

## 7. 读路径

```text
GET /feed
  → 读自己的 inbox（分页）
  → 合并大 V 最新帖子
  → 过滤删除/权限/拉黑
  → 排序/分页
  → 返回 cursor
```

- cursor 用 `(created_at, post_id)`，不要 offset
- 合并多个来源时保持稳定排序
- 缓存 timeline 第一页/热用户
- 读己之写：自己的新帖先合并，不等 fanout

## 8. 排序

第一版按时间倒序：

- 简单、可解释、cursor 稳定
- 不依赖模型/特征

后续要推荐排序：

- 离线特征/在线打分
- 排序服务独立
- 保留 chronological fallback
- 排序变化要 A/B/回归

不要一开始把 feed 做成不可解释的黑盒。

## 9. 一致性

- 发帖 → 最终出现在 follower feed
- 自己的帖子 → 读己之写
- 删除/拉黑 → 尽快不可见
- 关注/取关 → 影响后续 feed
- fanout 重复 → 幂等
- fanout 丢失 → 对账/重建

“最终一致”要写清时间目标（如 fanout lag < 1min）。

## 10. 失败模式

| 失败 | 行为 |
|---|---|
| fanout 队列积压 | feed 延迟；监控 lag；扩容/降级 |
| fanout 重复 | 唯一键/去重 |
| fanout 丢失 | 对账/重建 inbox |
| 大 V 发帖 | 读时拉取，避免写放大 |
| 缓存挂 | 回源 inbox；限流 |
| 删除没同步 | 读时过滤 tombstone |
| 关注关系不一致 | 重建/修复 |
| 分页重复/遗漏 | 稳定 cursor |

## 11. 安全与权限

- 私密账号：只有 approved follower 可见
- 拉黑：双向不可见
- 删除：读路径过滤
- 帖子 visibility：public/followers/private
- 管理接口鉴权
- 防枚举/爬取（限流/签名）
- 日志不记录私密内容

权限过滤要在读路径/数据层，不要只靠前端。

## 12. SLO

- feed p95 < 200ms
- feed 可用性 99.9%
- fanout lag < 1min
- 删除可见延迟 < 1min
- 错误预算/告警/runbook

参考[可观测性与 SLO](../operations/01-可观测性与SLO.md)。

## 13. 演进

1. inbox 按 user 分片
2. fanout worker 水平扩展
3. 热用户 timeline 缓存
4. 大 V 独立拉取/缓存
5. 排序服务独立
6. 多地域 feed 缓存

触发条件：

- fanout lag 持续超 SLO
- inbox 存储/写入成为瓶颈
- 大 V 发帖拖慢普通用户
- 排序/特征复杂到影响主链路

## 14. ADR

### ADR-1：hybrid fanout

```text
Context：普通用户 follower 少，大 V follower 多
Decision：普通用户推，大 V 拉
Consequences：读时合并；逻辑复杂但写放大可控
Alternatives：全推（大 V 爆炸）/全拉（读放大）
Revisit：follower 分布/成本变化
```

### ADR-2：时间倒序

```text
Context：第一版需要可解释、稳定分页
Decision：chronological
Consequences：简单；后续推荐需独立服务
Alternatives：一开始上推荐排序
Revisit：产品需要排序优化且有评测
```

## 15. 检查清单

- 推/拉/hybrid 选了吗？
- follower 分布/大 V 阈值？
- fanout 幂等/重试/DLQ？
- inbox 分区/分页？
- 删除/拉黑/私密怎么过滤？
- 读己之写怎么保证？
- cursor 稳定吗？
- 缓存/热用户？
- fanout lag/SLO？
- 演进触发条件？

## 16. 要点回顾

1. feed 的难点是 fanout，不是存帖子
2. 普通用户推、大 V 拉，hybrid 更现实
3. follower 数放大写；读时合并放大读
4. inbox 按 user 分片，cursor 不用 offset
5. 删除/拉黑/私密要在读路径过滤
6. 自己的帖子要读己之写
7. fanout 幂等/重试/DLQ/对账
8. 第一版时间倒序，推荐排序独立演进
9. SLO 要覆盖 feed 延迟和 fanout lag
10. 没有一种 fanout 方案适合所有用户分布
