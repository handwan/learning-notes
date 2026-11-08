# API 与契约

API 是模块/服务之间最显眼的边界。它不只是“一个 URL + JSON”，而是调用双方要长期遵守的契约：

- 请求/响应字段
- 错误模型
- 状态码
- 幂等/重试语义
- 分页/过滤
- 版本兼容
- 认证/租户
- 超时/限流

契约没写清，调用方只能靠猜；边界很快会漏。

## 1. 先选接口风格

| 风格 | 适合 | 代价 |
|---|---|---|
| REST/HTTP | 资源型 CRUD、公开 API、缓存 | 复杂查询/批量操作容易扭曲 |
| gRPC | 内部服务、强类型、低延迟、流式 | 浏览器支持、调试、代理 |
| GraphQL | 多客户端、灵活查询、聚合层 | N+1、查询复杂度、字段级权限 |
| WebSocket | 双向实时、长连接 | 有状态、重连、背压、扩缩容 |
| Webhook/事件 | 异步通知、解耦 | 最终一致、重试、签名、幂等 |

风格不是信仰：

- 内部强类型 RPC 可以用 gRPC/Protobuf
- 公开资源 API 用 REST 更直接
- 多客户端聚合可以 GraphQL，但要防复杂查询
- 实时聊天/协同用 WebSocket，不要硬套请求-响应

## 2. 资源和动作

REST 风格先建模资源：

```text
GET    /v1/orders/{order_id}
POST   /v1/orders
PATCH  /v1/orders/{order_id}
POST   /v1/orders/{order_id}/cancel
```

原则：

- 资源名用复数、稳定、可预测
- 查询用 GET + query，不要用 GET 做写操作
- 创建用 POST，成功返回 201 + Location
- 幂等更新可用 PUT，部分更新用 PATCH
- 动作型操作用子资源/动词，不要硬塞进 CRUD
- 不要在 URL 里放敏感信息

不要为了“纯 REST”把简单动作拆成五层资源。可读性和一致性优先。

## 3. 请求和响应契约

每个接口至少定义：

```text
method + path
auth/tenant
path/query/header/body
request schema
response schema
error codes
idempotency
timeout/rate limit
```

示例：

```http
POST /v1/payments
Authorization: Bearer ...
Idempotency-Key: 8f14e45f...
Content-Type: application/json

{"order_id":"A1001","amount":1999,"currency":"CNY"}
```

成功：

```json
{
  "payment_id": "pay_123",
  "status": "pending",
  "amount": 1999,
  "currency": "CNY"
}
```

错误：

```json
{
  "code": "invalid_amount",
  "message": "amount must be positive",
  "request_id": "req_abc123"
}
```

错误模型要稳定：

- 机器可读的 `code`
- 人类可读的 `message`
- `request_id` 方便排查
- 可选 `details`，不要返回堆栈/密钥

## 4. 状态码

常用：

| 状态码 | 含义 | 典型场景 | 注意 |
|---|---|---|---|
| 200 | OK | 查询/更新成功 | 不要用它包装所有业务错误 |
| 201 | Created | 创建成功 | 返回 Location |
| 202 | Accepted | 异步任务已接收 | 返回 operation_id 或查询方式 |
| 204 | No Content | 删除/更新成功且无响应体 | 不返回 body |
| 400 | Bad Request | 请求格式/参数错误 | 和 422 的边界提前定 |
| 401 | Unauthorized | 未认证/凭证无效 | 不是“无权限” |
| 403 | Forbidden | 已认证但无权限 | 不要暴露资源是否存在 |
| 404 | Not Found | 资源不存在 | 越权时可用 404 隐藏存在性 |
| 409 | Conflict | 重复/状态冲突/幂等键冲突 | 返回可恢复信息 |
| 412 | Precondition Failed | ETag/If-Match 失败 | 乐观锁冲突 |
| 422 | Unprocessable Content | 语义/业务校验失败 | 和 400 的规则提前定 |
| 429 | Too Many Requests | 限流/配额 | 返回 Retry-After |
| 500 | Internal Server Error | 未预期异常 | 不返回堆栈/密钥 |
| 503 | Service Unavailable | 过载/维护/依赖不可用 | 返回 Retry-After |

不要所有错误都返回 200，也不要把业务失败都塞进 500。

## 5. 分页、过滤、排序

分页：

- 小数据/后台：offset + limit
- 大数据/公开 API：cursor/keyset
- 固定排序，避免翻页重复/遗漏
- 限制 max page size
- 返回 `next_cursor`，不要返回无限总量

过滤/排序：

- 明确允许的字段
- 不要直接把 query 拼进 SQL
- 复杂查询考虑专用搜索接口/读模型

## 6. 版本与兼容

兼容变更：

- 新增可选字段
- 新增端点
- 新增错误码（客户端要能忽略未知）
- 放宽校验

破坏变更：

- 删除/重命名字段
- 改类型/语义
- 改默认值
- 改错误码含义
- 改变排序/分页语义

策略：

- 大版本用 URL/header 显式区分
- 旧版本给弃用期和迁移文档
- 监控旧版本调用量
- 契约测试覆盖消费者

不要靠“客户端会兼容”来赌。

## 7. 幂等、重试、并发

写接口要明确：

- 是否幂等
- 幂等键怎么传
- 相同键不同请求体怎么处理
- 重试窗口/保留期

示例：

```text
Idempotency-Key: 8f14e45f...
```

服务端保存：

```text
key + request hash + response + 过期时间
```

- 相同 key + 相同 body：返回原响应
- 相同 key + 不同 body：409/422
- 没有 key：调用方承担重复风险

并发更新用：

- `ETag` + `If-Match`
- 版本号/乐观锁
- 冲突返回 409/412

不要用“先查再写”解决并发，除非在同一个事务/锁里。

## 8. 长任务和异步

不要用一个 HTTP 连接等几分钟：

```text
POST /v1/reports
→ 202 {"operation_id":"op_123"}

GET /v1/operations/op_123
→ {"status":"running"|"succeeded"|"failed","result_url":...}
```

或：

- 完成后 webhook 通知
- 轮询 + 退避
- 超时/取消接口
- 幂等创建任务

Webhook 也是契约：

- 签名/HMAC
- 事件 ID + 幂等
- 重试/退避
- 顺序不保证
- 接收方快速 ACK，异步处理

## 9. 安全与租户

- 认证在网关/服务入口做，不信任客户端自报 tenant
- 授权按资源/字段/动作检查
- 租户 ID 从 token/上下文取，不从 body 取
- 限流按用户/租户/API key
- 不返回其他租户数据
- 错误信息不泄漏内部细节
- 日志脱敏，request_id 关联

API key 不是用户身份；服务间调用也要区分“调用者”和“最终用户”。

## 10. 契约测试

API 契约要进 CI：

- OpenAPI/Protobuf/GraphQL schema 校验
- provider 按 schema 返回
- consumer 按契约调用
- 兼容性检查（新增/删除/类型变更）
- mock server 做集成测试

消费者驱动契约测试适合多团队；单体内部至少要有 schema/接口测试。

## 11. 一个支付接口的契约

```text
POST /v1/payments
Auth: user/tenant
Idempotency-Key: required
Request: order_id, amount, currency
Response: payment_id, status
Errors: invalid_amount, order_not_found, conflict, rate_limited
Timeout: 5s
Rate limit: per tenant
```

行为：

- 相同 key 重试返回同一 payment
- 不同 body 用同一 key 返回 409
- 订单不存在返回 404/422（按契约）
- 支付处理中返回 202 + operation_id
- 限流返回 429 + Retry-After

这比“返回一个 JSON”多得多，但调用方才能可靠重试。

## 12. 检查清单

- 风格和客户端匹配吗？
- 请求/响应 schema 完整吗？
- 错误码稳定、可分类吗？
- 状态码语义正确吗？
- 分页稳定、有上限吗？
- 版本/兼容策略写了吗？
- 写接口幂等吗？重试安全吗？
- 并发更新怎么处理？
- 长任务有 202/operation 吗？
- 认证/租户/权限在服务端吗？
- 限流/超时/重试有边界吗？
- 契约测试进 CI 了吗？

## 13. 常见坑

1. **所有错误返回 200**
   客户端无法区分成功/失败。

2. **错误只返回字符串**
   没有 code，无法稳定处理。

3. **分页用 offset 翻深页**
   数据变动时重复/遗漏。

4. **没有幂等**
   超时重试创建重复订单/支付。

5. **版本靠“客户端会兼容”**
   删字段/改语义直接破坏消费者。

6. **GET 做写操作**
   缓存/重试/爬虫都会出问题。

7. **租户 ID 从 body 取**
   越权只差一个参数。

8. **长任务占着 HTTP 连接**
   超时、重试、资源都被拖住。

9. **Webhook 没有签名/幂等**
   伪造、重复、乱序都可能发生。

10. **契约没有测试**
   文档和实现分叉，上线才发现。

## 14. 要点回顾

1. API 是长期契约，不是单个 JSON 响应
2. 按客户端/场景选 REST/gRPC/GraphQL/WebSocket/事件
3. 资源和动作建模要一致，状态码语义要正确
4. 错误模型要有稳定 code、message、request_id
5. 分页/过滤/排序要稳定、有上限
6. 版本变更加字段通常兼容，删/改/语义变化是破坏
7. 写接口要幂等；并发更新用 ETag/版本号
8. 长任务用 202 + operation，不要占长连接
9. 认证/租户/权限在服务端；契约测试进 CI
