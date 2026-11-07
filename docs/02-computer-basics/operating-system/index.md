# 操作系统

操作系统 = **管理硬件资源 + 给程序提供抽象和服务**的系统软件；保护与安全贯穿其中。这里按**原理**组织。

例子以 **Linux/Unix** 为主（`fork`、`epoll`、`cgroup`、`SELinux` 等）；保护环、虚拟内存、调度、IPC、文件系统这些概念在 Windows/macOS 上同样成立，只是接口和名字不同。

## 篇目

| # | 主题 | 核心 |
|---|------|------|
| 1 | [概述与系统调用](01-概述与系统调用.md) | 内核态/用户态、系统调用、中断、虚拟化、启动 |
| 2 | [进程与线程](02-进程与线程.md) | 状态、上下文切换、协程、fork/exec/wait、Linux task |
| 3 | [CPU 调度](03-CPU调度.md) | 调度算法、CFS/EEVDF、优先级反转、实时调度 |
| 4 | [同步与死锁](04-同步与死锁.md) | 信号量、原子指令、经典模型、死锁、活锁、futex |
| 5 | [进程间通信](05-进程间通信.md) | 管道、消息队列、共享内存、信号、socket、SCM_RIGHTS |
| 6 | [内存管理](06-内存管理.md) | 虚拟内存、分页/分段、TLB、置换、OOM/cgroup、NUMA/大页 |
| 7 | [文件系统](07-文件系统.md) | inode、fd、硬链接/软链接、页缓存、VFS、日志/COW |
| 8 | [设备与磁盘](08-设备与磁盘.md) | IO 分层、缓冲、磁盘调度、SSD、RAID |
| 9 | [IO 系统](09-IO系统.md) | IO 模型、epoll、零拷贝、io_uring、Reactor |
| 10 | [保护与安全](10-保护与安全.md) | 五道信任边界、DAC/MAC/capabilities、容器 root、TOCTOU、启动完整性 |

## 关键点

- 进程 vs 线程、上下文切换开销、**fork 为什么返回两次**
- 进程间通信方式、为什么共享内存最快、fd 传递
- **虚拟内存、分页/分段、页面置换（LRU）**、缺页类型
- 死锁四条件、银行家算法、活锁与饥饿
- 用户态/内核态、系统调用开销、虚拟化
- **epoll vs select/poll**、LT/ET、IO 多路复用、Reactor/Proactor
- CFS/EEVDF 与 MLFQ 的区别；SSD 的 FTL/TRIM；io_uring
- 五道信任边界、DAC/MAC/capabilities、容器 root、TOCTOU、Secure Boot
