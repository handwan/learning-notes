# 计算机网络

从"数据怎么从一台机器到另一台"讲起：**分层 → 链路 → IP → TCP → 应用层 → 安全 → 排查**。

## 篇目

| # | 主题 | 核心 |
|---|------|------|
| 1 | [分层与概述](01-分层与概述.md) | OSI 七层 / TCP-IP 四层、封装 |
| 2 | [数据链路与以太网](02-数据链路与以太网.md) | MAC / 以太网帧 / 交换机 vs 路由器 / VLAN |
| 3 | [IP 与路由](03-IP与路由.md) | IP / 子网划分 / ARP / NAT / ICMP / 路由协议 / IPv6 |
| 4 | [TCP](04-TCP.md) | 握手挥手、可靠性、两个窗口、拥塞控制、Nagle |
| 5 | [UDP 与 QUIC](05-UDP与QUIC.md) | 无连接、QUIC 为什么快 |
| 6 | [HTTP 与 HTTPS](06-HTTP与HTTPS.md) | 方法/状态码、**Cookie/Session/Token**、**缓存**、HTTP/1.1-2-3、TLS |
| 7 | [DNS 与 CDN](07-DNS与CDN.md) | 解析过程、劫持/污染、CDN、负载均衡 |
| 8 | [排查工具](08-排查工具.md) | ping / traceroute / ss / tcpdump、分层排查 |
| 9 | [网络安全](09-网络安全.md) | 加密/签名、DDoS、XSS/CSRF/SQL 注入、防火墙 |

## 重点

- **TCP**：三次握手 / 四次挥手、TIME_WAIT / CLOSE_WAIT、**发送窗口 = min(接收, 拥塞)**
- **拥塞控制**：慢启动 → 拥塞避免 → 快速恢复
- **HTTP**：缓存（强 / 协商）、Cookie/Session/Token、1.1/2/3 演进
- **子网划分**、NAT、DNS 解析
- **常见攻击**：DDoS、SYN Flood、XSS、CSRF、SQL 注入
