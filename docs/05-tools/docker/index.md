# Docker

容器工具。核心是「**镜像**（模板）→ **容器**（运行实例）」。

## 一句话

把应用和依赖打包成**镜像**，在任何装了 Docker 的机器上跑出**一模一样**的环境。

## 篇目

| 篇目 | 内容 |
|------|------|
| [基础](基础.md) | 概念与隔离、命令、Dockerfile、缓存、数据/网络、Compose、分发 |
| [构建与调试](构建与调试.md) | 多阶段构建、BuildKit 缓存/密钥、动态库、调试容器、解释型语言 |
| [运行与安全](运行与安全.md) | 资源限制、重启、日志、停止、运行时加固 |

## 快速上手

```bash
docker run -it --rm ubuntu:22.04 bash   # 拉镜像 + 进容器（退出即删）
docker ps                               # 看运行中的容器
docker build -t myapp .                 # 按 Dockerfile 构建镜像
docker run --rm myapp                   # 跑
```
