# 系统编程：IPC 与 mmap

IPC 与 IO 模型总览、几种进程间通信方式（管道/共享内存/Unix socket）、内存映射，以及 epoll 的完整例子。

本篇只依赖 POSIX/Linux 接口，示例自成一体。

## 1. 总览：五种 IPC 与五种 IO 模型

**五种 IPC（怎么选）**：

| 方式 | 数据形态 | 特点 / 适用 |
|------|----------|------|
| 信号 | 无数据，只有通知 | 最轻；只能传编号（见 10 篇信号节） |
| 管道 / FIFO | 字节流（无边界） | `pipe` 限亲缘进程、FIFO 任意进程；单向 |
| 消息队列（POSIX mq） | 有消息边界、可带优先级 | 用得少（常被 socket / 自建队列替代） |
| 共享内存 | 无结构，最快 | 不复制数据；必须自己配信号量同步 |
| socket | 字节流 | 功能最全：本机用 Unix socket、跨机用 TCP |

**五种 IO 模型（谁在等）**：

| 模型 | 等待方式 | 一句话 |
|------|----------|--------|
| 阻塞 IO | read/write 里等 | 最简单；一连接一线程的写法 |
| 非阻塞 IO | 轮询 | 不阻塞但要反复问，浪费 CPU |
| IO 多路复用 | select/poll/epoll | 一个线程管一堆 fd——服务端主流 |
| 信号驱动 | SIGIO 通知 | 实践少用 |
| 异步 IO | 提交后拿结果 | Linux 原生 AIO 限制多，io_uring 是新答案 |

## 2. pipe 与 FIFO

```c
#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

int main(void) {
    int pfd[2];
    if (pipe(pfd) == -1) { perror("pipe"); return 1; }   // pfd[0] 读端，pfd[1] 写端

    pid_t pid = fork();
    if (pid == 0) {
        close(pfd[0]);                       // 子进程只写
        write(pfd[1], "hello pipe", 10);
        close(pfd[1]);                       // 关掉写端 → 父进程 read 会返回 0（EOF）
        _exit(0);
    }
    close(pfd[1]);                           // 父进程只读
    char buf[64];
    ssize_t n = read(pfd[0], buf, sizeof(buf) - 1);
    if (n > 0) { buf[n] = '\0'; printf("got: %s\n", buf); }
    close(pfd[0]);
    waitpid(pid, NULL, 0);
    return 0;
}
```

**语义要点**：

- **管道是字节流**（没有消息边界）——读到多少算多少，要"分包"就自己定协议（和 TCP 粘包同理）
- **写端全关后，读端 read 返回 0**（EOF）；读端全关后写会收到 `SIGPIPE`（默认终止进程，要处理就忽略它）
- **原子性**：一次写不超过 `PIPE_BUF`（Linux 4096 字节）是原子的；超过可能被拆
- 管道容量有限（64K 左右），满了会阻塞写
- 新代码用 `pipe2(pfd, O_CLOEXEC)`（Linux，编译需 `_GNU_SOURCE`），避免 fd 泄漏给子进程

**FIFO（命名管道）**：`mkfifo /tmp/myfifo` 之后，两个**无关进程**也能通过它通信（本质是有文件名、在文件系统里的管道）。

```bash
mkfifo /tmp/myfifo
cat /tmp/myfifo &            # 读端（阻塞等写）
echo hello > /tmp/myfifo     # 写端
```

## 3. 共享内存 + 信号量（POSIX）

**共享内存是最快的 IPC**（数据不复制，双方映射同一块物理内存）；但**需要自己同步**——配 POSIX 有名信号量：

```c
#include <fcntl.h>
#include <semaphore.h>
#include <stdio.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/wait.h>
#include <unistd.h>

int main(void) {
    const char* name = "/shm_demo";
    const size_t size = 4096;

    int fd = shm_open(name, O_CREAT | O_RDWR, 0644);     // 创建共享内存对象
    ftruncate(fd, (off_t)size);                          // 设定大小
    void* p = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    close(fd);

    sem_t* sem = sem_open("/sem_demo", O_CREAT, 0644, 0);   // 初值 0

    pid_t pid = fork();
    if (pid == 0) {
        strcpy((char*)p, "data from child");               // 直接写共享内存
        sem_post(sem);                                      // 通知父进程
        _exit(0);
    }

    sem_wait(sem);                                          // 等子进程写完
    printf("parent read: %s\n", (char*)p);

    waitpid(pid, NULL, 0);
    sem_close(sem);
    sem_unlink("/sem_demo");        // 清理（名字从系统移除）
    munmap(p, size);
    shm_unlink(name);
    return 0;
}
```

| 调用 | 作用 |
|------|------|
| `shm_open` | 创建/打开"共享内存对象"（在 /dev/shm 下） |
| `ftruncate` | 定大小（不设大小映射会段错误） |
| `mmap(..., MAP_SHARED, ...)` | 映射到进程地址空间（**MAP_SHARED 才是共享**） |
| `sem_open/sem_wait/sem_post` | 有名信号量：跨进程同步（初值 0 表示"先等"） |
| `sem_unlink`/`shm_unlink` | 删除名字（要在所有使用者用完前想清楚） |

`shm_open` / `ftruncate` / `mmap` / `sem_open` 都要检查返回值；`mmap` 失败返回 `MAP_FAILED`，不是 `NULL`。

**检查共享内存占用**：`ls -l /dev/shm`；**System V 版本**（`shmget/semget/msgget`）是老接口，新代码优先 POSIX。

## 4. Unix domain socket（本机 IPC 首选）

**AF_UNIX** 比 TCP loopback 更快（不走网络协议栈、不做校验和/路由），且用文件路径寻址（无端口冲突）：

```c
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

int main(void) {
    const char* path = "/tmp/demo.sock";
    unlink(path);                                     // 清理上次的残留

    int srv = socket(AF_UNIX, SOCK_STREAM, 0);
    struct sockaddr_un addr;
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, path, sizeof(addr.sun_path) - 1);

    bind(srv, (struct sockaddr*)&addr, sizeof(addr));
    listen(srv, 5);

    if (fork() == 0) {                                // 子进程当客户端
        usleep(100000);
        int c = socket(AF_UNIX, SOCK_STREAM, 0);
        connect(c, (struct sockaddr*)&addr, sizeof(addr));
        write(c, "ping", 4);
        close(c);
        _exit(0);
    }

    int cli = accept(srv, NULL, NULL);
    char buf[16] = {0};
    read(cli, buf, sizeof(buf) - 1);
    printf("server got: %s\n", buf);
    close(cli);
    close(srv);
    unlink(path);
    return 0;
}
```

**`socketpair`**：一步拿到一对**已连接**的 socket（不用 bind/listen/connect），父子进程双向通信的最简方式：

```c
int sv[2];
socketpair(AF_UNIX, SOCK_STREAM, 0, sv);   // sv[0] 和 sv[1] 双向
```

**传文件描述符（SCM_RIGHTS）**：Unix socket 能在进程间传递 fd（接收方拿到一个指向同一文件/管道的新 fd）——实现"主进程收连接、worker 处理"的经典手法。

```c
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/uio.h>
#include <unistd.h>

int send_fd(int sock, int fd) {
    char byte = 'x';
    struct iovec iov = { .iov_base = &byte, .iov_len = 1 };
    char control[CMSG_SPACE(sizeof(int))];
    struct msghdr msg;
    memset(&msg, 0, sizeof msg);
    msg.msg_iov = &iov;
    msg.msg_iovlen = 1;
    msg.msg_control = control;
    msg.msg_controllen = sizeof control;

    struct cmsghdr* cmsg = CMSG_FIRSTHDR(&msg);
    cmsg->cmsg_level = SOL_SOCKET;
    cmsg->cmsg_type = SCM_RIGHTS;
    cmsg->cmsg_len = CMSG_LEN(sizeof(int));
    memcpy(CMSG_DATA(cmsg), &fd, sizeof fd);
    return sendmsg(sock, &msg, 0);
}

int recv_fd(int sock) {
    char byte;
    struct iovec iov = { .iov_base = &byte, .iov_len = 1 };
    char control[CMSG_SPACE(sizeof(int))];
    struct msghdr msg;
    memset(&msg, 0, sizeof msg);
    msg.msg_iov = &iov;
    msg.msg_iovlen = 1;
    msg.msg_control = control;
    msg.msg_controllen = sizeof control;

    if (recvmsg(sock, &msg, MSG_CMSG_CLOEXEC) <= 0) return -1;
    struct cmsghdr* cmsg = CMSG_FIRSTHDR(&msg);
    if (!cmsg || cmsg->cmsg_level != SOL_SOCKET || cmsg->cmsg_type != SCM_RIGHTS) {
        return -1;
    }
    int fd;
    memcpy(&fd, CMSG_DATA(cmsg), sizeof fd);
    return fd;
}
```

用 `socketpair(AF_UNIX, SOCK_DGRAM, 0, sv)` 建一对 fd，发送方 `send_fd(sv[0], fd)`，接收方 `recv_fd(sv[1])`；接收到的 fd 用完要自己 `close`。

## 5. mmap：内存映射

```c
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

int main(void) {
    int fd = open("map.txt", O_RDWR | O_CREAT, 0644);
    ftruncate(fd, 4096);

    // MAP_SHARED：改动会写回文件，也能被其他映射者看到
    char* p = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    strcpy(p, "mapped content");
    msync(p, 4096, MS_SYNC);          // 显式刷回磁盘；不 msync 内核最终也会回写，但时机不保证
    munmap(p, 4096);

    // MAP_PRIVATE：写时复制，改动不影响文件
    p = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE, fd, 0);
    p[0] = 'X';                       // 只改了自己的副本
    munmap(p, 4096);
    close(fd);
    return 0;
}
```

`mmap` 失败返回 `MAP_FAILED`（不是 `NULL`）；`munmap` / `msync` / `madvise` 也要检查返回值。

**三种用法**：

| 用法 | 说明 |
|------|------|
| 文件映射（`MAP_SHARED`） | 大文件随机访问、多进程共享（比 read/write 少一次拷贝） |
| 文件映射（`MAP_PRIVATE`） | 只读 + 写时复制（加载库、读配置） |
| **匿名映射**（`MAP_ANONYMOUS`，无 fd） | 大块内存分配（malloc 大块走的就是 mmap）；`MAP_SHARED` 时 fork 后父子共享，`MAP_PRIVATE` 是 COW |

**要点**：

- 访问是按**页**（4K）的：映射 1 字节也占一页；文件末尾不足一页的补零
- **缺页按需加载**（第一次访问才读盘）——比一次性 read 更适合"随机访问大文件"
- `madvise(MADV_SEQUENTIAL/MADV_RANDOM)` 给内核访问模式提示
- `msync` 控制刷盘时机；崩溃可能丢数据（要持久化就 msync 或 fdatasync）

## 6. 事件：epoll 完整例子

```c
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <unistd.h>

static int set_nonblock(int fd) {
    int fl = fcntl(fd, F_GETFL, 0);
    return fcntl(fd, F_SETFL, fl | O_NONBLOCK);
}

int main(void) {
    int lfd = socket(AF_INET, SOCK_STREAM, 0);
    int one = 1;
    setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(18090);
    bind(lfd, (struct sockaddr*)&addr, sizeof(addr));
    listen(lfd, 8);
    set_nonblock(lfd);

    int ep = epoll_create1(EPOLL_CLOEXEC);
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = lfd;
    epoll_ctl(ep, EPOLL_CTL_ADD, lfd, &ev);

    for (int round = 0; round < 3; ++round) {
        struct epoll_event events[4];
        int n = epoll_wait(ep, events, 4, 1000);       // 超时 1s
        if (n < 0) {
            if (errno == EINTR) continue;
            perror("epoll_wait");
            break;
        }
        for (int i = 0; i < n; ++i) {
            int fd = events[i].data.fd;
            if (fd == lfd) {
                int c = accept(lfd, NULL, NULL);       // 新连接
                if (c == -1) {
                    if (errno == EAGAIN || errno == EWOULDBLOCK) continue;
                    perror("accept");
                    continue;
                }
                set_nonblock(c);
                ev.events = EPOLLIN;
                ev.data.fd = c;
                epoll_ctl(ep, EPOLL_CTL_ADD, c, &ev);
            } else {
                char buf[256];
                ssize_t r = read(fd, buf, sizeof(buf));
                if (r > 0) {
                    write(STDOUT_FILENO, "read: ", 6);
                    write(STDOUT_FILENO, buf, (size_t)r);
                } else if (r == 0) {
                    epoll_ctl(ep, EPOLL_CTL_DEL, fd, NULL);
                    close(fd);                         // 对端关闭：先移除再关
                } else if (errno != EINTR && errno != EAGAIN && errno != EWOULDBLOCK) {
                    perror("read");
                    epoll_ctl(ep, EPOLL_CTL_DEL, fd, NULL);
                    close(fd);
                }
                // EAGAIN/EWOULDBLOCK：非阻塞读完，等下一次事件，不能关连接
            }
        }
    }
    close(lfd);
    close(ep);
    return 0;
}
```

**epoll 的要点**（和 select/poll 的区别）：

- `epoll_create1` → 得到一个"事件表"；`epoll_ctl` 增删改；`epoll_wait` 等事件——**不用每次传全量 fd 集合**，fd 多时也快
- **必须配非阻塞 fd**（`O_NONBLOCK`）：边缘触发（ET）模式下，不读到 `EAGAIN` 会漏事件；水平触发（LT，默认）也要防"阻塞在一个连接上拖住其他连接"
- `EPOLLIN` 可读、`EPOLLOUT` 可写（**别一直监听可写**，会空转 CPU；只在写不完时临时加）
- 关闭连接：先 `EPOLL_CTL_DEL` 再 `close`（或依赖 fd 自动移除——但混用可能出"惊群"式 bug，明确删更稳）
- 同时处理 `EPOLLERR` / `EPOLLHUP`；只判断 `EPOLLIN` 会在对端异常断开时卡住或漏清理

**ET 版本的关键改动**：

```c
// 注册时加 EPOLLET；fd 必须非阻塞
ev.events = EPOLLIN | EPOLLET;

// 新连接直接带 NONBLOCK/CLOEXEC（Linux，需 _GNU_SOURCE）
int c = accept4(lfd, NULL, NULL, SOCK_NONBLOCK | SOCK_CLOEXEC);

// 事件处理要一直读到 EAGAIN
for (;;) {
    ssize_t r = read(fd, buf, sizeof(buf));
    if (r > 0) { /* 处理数据 */ continue; }
    if (r == 0) { /* 对端关闭 */ break; }
    if (errno == EINTR) continue;
    if (errno == EAGAIN || errno == EWOULDBLOCK) break;
    /* 真实错误 */ break;
}
```

## 7. 定时器：timerfd

把"定时"也变成 fd，配 epoll 统一管理（比 `setitimer` + 信号更可控）：

```c
#include <stdio.h>
#include <sys/timerfd.h>
#include <unistd.h>

int main(void) {
    int tfd = timerfd_create(CLOCK_MONOTONIC, TFD_CLOEXEC);
    struct itimerspec its;
    its.it_value.tv_sec = 0;              // 首次触发：100ms 后
    its.it_value.tv_nsec = 100 * 1000 * 1000;
    its.it_interval.tv_sec = 0;           // 周期：100ms
    its.it_interval.tv_nsec = 100 * 1000 * 1000;
    timerfd_settime(tfd, 0, &its, NULL);

    unsigned long long expirations = 0;
    read(tfd, &expirations, sizeof(expirations));   // 阻塞等到期（读走"到期次数"）
    printf("fired: %llu\n", expirations);
    close(tfd);
    return 0;
}
```

**计时用 `CLOCK_MONOTONIC`**（不受系统时间调整影响）：

```c
#include <time.h>
struct timespec ts;
clock_gettime(CLOCK_MONOTONIC, &ts);
printf("%ld.%09ld\n", (long)ts.tv_sec, ts.tv_nsec);
```

（老接口 `alarm`/`setitimer` 用信号通知，会打断系统调用、还要处理 `EINTR`——新代码优先 timerfd 或 POSIX timer。）

## 8. 其他

- **POSIX 消息队列**：`mq_open/mq_send/mq_receive`（有消息边界、带优先级）；实际项目里用得少（常被 socket 或自建队列替代）
- **eventfd**：内核维护的计数器 fd，适合线程/进程间发通知，可配 epoll
- **signalfd**：把信号变成 fd 读取，和 epoll 统一处理
- **memfd_create**：匿名内存文件，拿到 fd 后可 mmap 或传给子进程
- **系统调用机制**：`syscall(SYS_getpid)` 可以直接触发系统调用；`gettimeofday`/`clock_gettime` 多数情况走 **vDSO**（用户态读内核数据，不真正陷入内核，所以快）
- **`fork` + 多线程**很危险：子进程只保留调用 `fork` 的那个线程，锁状态可能损坏——优先 `posix_spawn` 或先 fork 再起线程

## 9. 要点回顾

1. **pipe 是字节流**（无边界）；**写端全关 → read 返回 0**；`PIPE_BUF` 内写原子；FIFO 让无关进程也能用
2. **共享内存最快但要自己同步**：`shm_open + ftruncate + mmap(MAP_SHARED)` + 信号量；`mmap` 失败是 `MAP_FAILED`；用完 `shm_unlink`
3. **Unix socket 是本机 IPC 首选**（比 TCP loopback 快）；`socketpair` 一步拿双向连接；`SCM_RIGHTS` 能传 fd（`sendmsg`/`recvmsg` + `CMSG_*`）
4. **mmap**：`MAP_SHARED` 改文件、`MAP_PRIVATE` 写时复制、匿名映射当大内存（共享要看 `MAP_SHARED`）；按页、缺页按需加载
5. **epoll**：`create1/ctl/wait` + **非阻塞 fd**；只监听需要的事件；关闭连接先 `EPOLL_CTL_DEL`；处理 `EAGAIN`/`EPOLLERR`/`EPOLLHUP`；ET 用 `EPOLLET` + `accept4`，读到 `EAGAIN`
6. **定时用 timerfd + `CLOCK_MONOTONIC`**（不受系统时间影响）；别用信号定时
7. **消息队列**知道有即可；`eventfd`/`signalfd`/`memfd_create` 是常用 fd 化工具；`fork` 在多线程程序里要谨慎
8. **选型一句话**：控制用信号、亲缘用 pipe、本机双向用 Unix socket、大块数据用共享内存+信号量、服务端并发用 epoll
