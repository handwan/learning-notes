# 可观测性与 SLO

可观测性不是“装个 Prometheus”，也不是“日志多打一点”。它要回答：

- 用户现在是否正常？
- 哪里慢了/错了？
- 错误影响多大？
- 什么时候该告警/回滚？
- 预算还剩多少？

## 1. 三个信号

| 信号 | 回答 | 成本 |
|---|---|---|
| Metrics | 趋势/告警/容量 | 低-中，受标签基数影响 |
| Logs | 具体事件/错误上下文 | 高，量大 |
| Traces | 请求跨服务路径/瓶颈 | 中-高，采样 |

三者互补：

```text
Metrics 发现异常 → Trace 定位链路 → Log 看细节
```

只有 metrics 不知道原因；只有 logs 很难聚合；只有 traces 会被采样漏掉。

## 2. 先看用户信号

常见指标：

- 延迟：p50/p95/p99
- 流量：QPS/并发
- 错误：5xx/超时/业务错误
- 饱和度：CPU/内存/连接池/队列

RED：

```text
Rate、Errors、Duration
```

USE：

```text
Utilization、Saturation、Errors
```

不要只监控 CPU。CPU 不高但队列满/连接池耗尽，用户一样超时。

## 3. SLI、SLO、SLA

| 概念 | 含义 |
|---|---|
| SLI | 指标：可用性、延迟、错误率、新鲜度 |
| SLO | 内部目标：99.9%、p95 < 300ms |
| SLA | 对外合同/赔偿承诺 |

SLI 要在用户边界测：

- 入口成功率
- 端到端延迟
- 业务成功率
- 数据新鲜度

不要只用“进程活着”当可用性。

SLO 原则：

- 不要定 100%
- 按用户/接口/租户分
- 有窗口（1h/1d/30d）
- 可测、可告警、可行动
- 和业务/成本平衡

## 4. Error budget

99.9% / 30 天：

```text
总分钟 = 30 × 24 × 60 = 43200
允许失败 = 43200 × 0.001 = 43.2 分钟
```

这是“100% 失败”折算的预算；实际错误率是部分失败。

预算用途：

- 太快烧完 → 停止发布/降级/回滚
- 还有预算 → 可以做风险实验
- 预算不是 KPI，不能拿来惩罚上报

## 5. Burn rate

Burn rate = 当前错误率 / 预算允许错误率。

```text
burn=1 → 30 天用完
burn=2 → 15 天
burn=10 → 3 天
```

告警常用多窗口：

- 短窗口高 burn：快速发现
- 长窗口低 burn：避免误报
- 例如 1h/5m 组合

不要一有错误就 page；按用户影响和 burn 分级。

## 6. 告警

好的告警：

- 对应用户症状
- 有阈值/持续时间
- 有 runbook
- 有 owner
- 可行动
- 分级别（page/ticket）

坏告警：

- CPU 高但用户没事
- 每个错误都 page
- 没有 runbook
- 长期不处理
- 告警风暴

告警不是监控的全部；dashboard 用于排查，不替代告警。

## 7. 日志和 trace

日志：

- 结构化（JSON/字段）
- request_id/trace_id
- 级别/采样
- 不记录密钥/PII
- 保留期/成本

Trace：

- 跨服务 span
- 采样（头部/尾部）
- 错误/慢请求优先
- 不要把 user_id 当高基数标签

Metrics 标签：

- 避免 user_id/request_id 这种高基数
- 租户/路由/状态码要控制基数
- 聚合/直方图/摘要

## 8. 运维闭环

- SLO 定义
- 监控/告警
- runbook
- on-call
- 故障演练
- 复盘/改进
- 错误预算策略

没有 runbook 的告警只是噪音；没有复盘的故障会重复。

## 9. 实验：error budget / burn

??? note "代码：预算和 burn rate"
    ```python
    def budget_minutes(target, days=30):
        return days * 24 * 60 * (1 - target)


    if __name__ == "__main__":
        for target in [0.999, 0.9995, 0.9999]:
            print(f"target={target:.4f} 30d budget={budget_minutes(target):.2f} min")
        print("burn rate -> time to exhaust 30d budget")
        for burn in [1, 2, 10, 14.4]:
            print(f"burn={burn:4.1f} -> {30 / burn:.2f} days")
    ```

输出：

```text
target=0.9990 30d budget=43.20 min
target=0.9995 30d budget=21.60 min
target=0.9999 30d budget=4.32 min
burn rate -> time to exhaust 30d budget
burn= 1.0 -> 30.00 days
burn= 2.0 -> 15.00 days
burn=10.0 -> 3.00 days
burn=14.4 -> 2.08 days
```

读法：

- 99.9% / 30 天：43.2 分钟预算
- 99.99%：4.32 分钟，要求高很多
- burn=2：15 天耗尽；burn=10：3 天
- 预算按“100% 失败”折算；实际错误率要换算
- 这是公式计算，不是线上 SLO 数据

## 10. 检查清单

- SLI 在用户边界测吗？
- SLO 有窗口/目标/owner 吗？
- 错误预算怎么用？
- burn rate 告警有短/长窗口吗？
- 告警有 runbook/分级吗？
- metrics 标签基数可控吗？
- 日志有 request_id、脱敏、保留期吗？
- trace 采样策略是什么？
- 故障演练/复盘做了吗？

## 11. 常见坑

1. **把 CPU 当用户健康**
   CPU 正常但队列/连接池可能已满。

2. **SLO 定 100%**
   不可达，也没有预算空间。

3. **只看平均延迟**
   p95/p99 才是体验。

4. **所有错误都 page**
   告警疲劳，真故障被淹没。

5. **没有 runbook**
   告警响了没人知道做什么。

6. **高基数标签**
   metrics 爆炸/成本失控。

7. **日志记录 PII/密钥**
   观测系统变成泄漏源。

8. **trace 全采样**
   成本高；按错误/慢请求采样。

9. **dashboard 当告警**
   没人一直盯 dashboard。

10. **没有复盘**
    同类故障反复发生。

## 12. 要点回顾

1. 可观测性 = metrics + logs + traces + 用户信号
2. SLI 在用户边界测；SLO 是内部目标；SLA 是对外承诺
3. 99.9% / 30 天约 43.2 分钟错误预算
4. burn rate 决定预算消耗速度；多窗口告警
5. 告警要对用户影响、可行动、有 runbook
6. metrics 标签控基数；日志脱敏；trace 采样
7. dashboard 用于排查，不替代告警
8. SLO 要和业务/成本平衡，不追求 100%
9. 故障演练/复盘让可观测性闭环
