# Linux

日常命令与 Shell、系统编程（POSIX API）、观测与调优。**每一篇自洽**：给最小必要原理 + 可照抄的命令/代码；需要的深入细节在各篇内展开。

## 篇目

### 命令与操作

| # | 文件 | 内容 |
|---|------|------|
| 1 | [文件与目录](01-文件与目录.md) | FHS 目录树、find、硬/软链接、tar/rsync、**校验和**、df/du、gpg |
| 2 | [文本处理与管道](02-文本处理与管道.md) | grep/sed/awk、重定向与管道、xargs、正则基础 |
| 3 | [权限与用户](03-权限与用户.md) | chmod/chown/umask、特殊权限、能力（capabilities）、sudo、SSH 密钥与端口转发 |
| 4 | [进程与作业控制](04-进程与作业控制.md) | ps/top、信号、**会话与守护进程**、前后台、nice/ionice/chrt、占端口/文件的排查 |
| 5 | [服务与定时任务](05-服务与定时任务.md) | systemd 与 unit（含 override）、journalctl、timer/cron、logrotate、时区 |
| 6 | [软件包与构建环境](06-软件包与构建环境.md) | apt/dpkg、源码编译、多版本、**动态库加载路径** |
| 7 | [磁盘与文件系统](07-磁盘与文件系统.md) | 挂载/fstab、inode 满、swap、iostat、SMART、LVM/RAID |
| 8 | [网络配置与排查](08-网络配置与排查.md) | ip/DNS/curl/dig、ss、tcpdump、ufw、代理、排查套路 |
| 9 | [Shell 与脚本](09-Shell与脚本.md) | 引号/变量/heredoc、流程控制、set -euo pipefail、脚本模板、tmux、找帮助与历史 |

### 系统编程

| # | 文件 | 内容 |
|---|------|------|
| 10 | [系统编程：文件、进程与信号](10-系统编程：文件、进程与信号.md) | fd/文件 IO、stat/目录/inotify、fork/exec/wait、信号、pthread、strace、core dump |
| 11 | [系统编程：IPC 与 mmap](11-系统编程：IPC与mmap.md) | 五种 IPC/IO 总览、pipe/FIFO、共享内存+信号量、Unix socket、mmap、epoll、timerfd |

### 观测与调优

| # | 文件 | 内容 |
|---|------|------|
| 12 | [系统观测与调优](12-系统观测与调优.md) | vmstat/iostat/sar、sysctl/ulimit、绑核/NUMA/大页、namespace/cgroup、perf、WSL、部署检查清单 |

## 关键点

- **排查套路**：网卡→IP→网关→DNS→端口（网络）；`vmstat` 看 r/b/wa/si/so → `iostat -x` → `iotop` 定位（资源）
- **先 TERM 后 KILL**；别忘了 `df -i`（inode 也会满）
- **部署常踩**：动态库找不到（`ldd`/`LD_LIBRARY_PATH`/`rpath`）、`/dev/shm` 太小、fd 上限、OOM（exit 137）
- **系统编程**：每个调用查返回值、处理短读短写/EINTR、`fork` 后要回收子进程（通常 `waitpid`，daemon 按 double fork / `SIGCHLD` 策略处理）、信号用 `sigaction`
- **本机 IPC 首选 Unix socket**；跨进程大块数据用共享内存 + 信号量
