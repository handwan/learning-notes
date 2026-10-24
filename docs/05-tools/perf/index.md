# perf

Linux 内置的性能分析工具。核心用法：**采样找出 CPU 热点**。

## 最小用法

```bash
perf record -g ./prog     # 采样
perf report                # 看哪个函数最耗时
```

## 篇目

| 篇目 | 内容 |
|------|------|
| [perf 用法](perf.md) | 权限、编译准备、核心命令、事件、指标解读 |

## 快速上手

```bash
# 1. 放宽权限（一次即可）
sudo sysctl kernel.perf_event_paranoid=1

# 2. 编译带调试信息
g++ -g -O2 -fno-omit-frame-pointer main.cpp -o main

# 3. 采样 + 看热点
perf record -g ./main
perf report
```
