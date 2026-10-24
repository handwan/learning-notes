# GDB 用法与调试

GNU 调试器。它主要解决三类问题：

- **崩溃**：进程收到 `SIGSEGV`/`SIGABRT`，看它死在哪
- **逻辑错误**：变量不对、分支走错、循环多跑一次
- **卡住/死锁**：看所有线程的栈，谁在等谁

前提：程序要带调试信息。

```bash
g++ -g -O0 -fno-omit-frame-pointer app.cpp -o app
# 或者 -Og：比 -O0 多一点优化，但仍适合调试
```

`-O2` 也能调试，但变量可能显示 `<optimized out>`，调用栈也可能被内联打乱。

## 1. 最小闭环

```bash
gdb ./app
(gdb) run
# 崩溃后
(gdb) bt                 # 先看调用栈
(gdb) frame 0            # 切到最内层
(gdb) info locals        # 看局部变量
(gdb) p x                # 打印变量
(gdb) p *ptr             # 解引用
```

顺序很重要：**先 `bt` 定位，再切 frame 看变量**。不要一上来就单步。

## 2. 启动方式

| 方式 | 用途 |
|------|------|
| `gdb ./app` | 从头调试 |
| `gdb --args ./app arg1 arg2` | 带参数启动 |
| `gdb -p <pid>` | 挂到运行中的进程 |
| `gdb ./app core.1234` | 分析 core 文件 |
| `gdb --batch -ex run -ex bt --args ./app` | 非交互，跑完打栈 |
| `gdbserver :1234 ./app` | 远程调试（嵌入式/容器） |

进入后可改参数：

```bash
(gdb) set args arg1 arg2
(gdb) show args
(gdb) set environment FOO=bar      # 临时改环境变量
(gdb) show environment
(gdb) set cwd /path/to/run         # 改工作目录
(gdb) run
```

挂上去之后：

```bash
(gdb) detach      # 断开，让进程继续跑
(gdb) quit        # 退出
```

## 3. 断点

```bash
(gdb) break main                 # 函数断点
(gdb) break file.cpp:42          # 行断点
(gdb) break *0x401234            # 地址断点
(gdb) tbreak file.cpp:42         # 临时断点，命中一次就删
(gdb) set breakpoint pending on  # 共享库还没加载时先挂起

(gdb) break file.cpp:42 if i == 100     # 条件断点
(gdb) condition 1 i == 100               # 给已有断点加条件
(gdb) ignore 1 100                       # 前 100 次不 stop

(gdb) rbreak '^MyClass::'        # 正则批量下断点
(gdb) info breakpoints
(gdb) disable 1
(gdb) enable 1
(gdb) delete 1
```

**自动打印再继续**：

```bash
(gdb) break file.cpp:42
(gdb) commands
> silent
> printf "i=%d, p=%p\n", i, p
> continue
> end
```

适合抓“偶发一次”的循环/边界条件。

## 4. 运行控制

| 命令 | 作用 |
|------|------|
| `run` / `r` | 从头运行 |
| `start` | 停在 `main` 第一行 |
| `continue` / `c` | 继续到下一个断点 |
| `next` / `n` | 下一行（不进入函数） |
| `step` / `s` | 下一行（进入函数） |
| `finish` | 跑完当前函数，回到调用者 |
| `until` | 跑到当前循环/行号之后 |
| `advance file:line` | 跑到指定行 |
| `nexti` / `stepi` | 汇编级单步 |
| `signal SIGINT` | 给程序发信号 |

`until` 和 `advance` 的区别：

- `until` 常用来跳出循环
- `advance` 直接跑到某一行，适合跳过一大段

## 5. 看现场

### 栈

```bash
(gdb) bt                 # 调用栈
(gdb) bt full            # 带局部变量
(gdb) frame 2            # 切到第 2 层
(gdb) up                 # 上一层
(gdb) down               # 下一层
(gdb) info frame         # 当前帧信息
(gdb) info args          # 函数参数
(gdb) info locals        # 局部变量
(gdb) info registers     # 寄存器
```

### 打印

```bash
(gdb) p x
(gdb) p/x x              # 十六进制
(gdb) p *ptr
(gdb) p arr[0]@10        # 从 arr[0] 开始打印 10 个元素
(gdb) p $rax             # 寄存器
(gdb) p this             # C++ 成员函数
(gdb) ptype x            # 类型
```

输出太长时：

```bash
(gdb) set print pretty on
(gdb) set print elements 0     # 不截断数组/字符串
```

### STL 打印

GDB 通常会自动加载 libstdc++ 的 pretty printer，直接打印容器即可：

```bash
(gdb) p vec
(gdb) p str
(gdb) info pretty-printer
```

如果输出是一堆内部字段，先看 `info pretty-printer` 里有没有 `libstdc++`；没有的话需要检查 pretty printer 的加载路径。

### 内存

```bash
(gdb) x/16gx $rsp        # 栈上 16 个 8 字节
(gdb) x/s 0x...          # 按字符串看
(gdb) x/10i $pc          # 看接下来 10 条指令
(gdb) info symbol 0x...  # 地址属于哪个符号
(gdb) info line *0x...   # 地址对应哪一行
(gdb) info proc mappings # 进程的虚拟地址空间
```

> 寄存器名和指令集随架构变化；上面示例是 x86-64。

### 源码与汇编

```bash
(gdb) list                     # 看当前行附近
(gdb) list file.cpp:1,50       # 看指定范围
(gdb) search pattern           # 源码里正向搜索
(gdb) reverse-search pattern   # 反向搜索
(gdb) directory /path/to/src   # 源码搜索路径
(gdb) disassemble /m main      # 源码 + 汇编混排
(gdb) set disassembly-flavor intel
```

TUI 模式可以边看源码/汇编边单步：

```bash
(gdb) tui enable
(gdb) layout src               # 源码窗口
(gdb) layout asm               # 汇编窗口
```

### 观察点

```bash
(gdb) watch x            # x 被写时停
(gdb) rwatch x           # x 被读时停
(gdb) awatch x           # 读写都停
(gdb) info watchpoints
```

观察点适合找“谁踩了我的内存”。但它可能很慢，硬件观察点数量也有限。

### 自动显示

```bash
(gdb) display x          # 每次停下都打印 x
(gdb) display/i $pc      # 每次停下看当前指令
(gdb) undisplay 1
```

## 6. 多线程

```bash
(gdb) info threads              # 所有线程，* 是当前
(gdb) thread 2                  # 切到线程 2
(gdb) thread apply all bt       # 所有线程的栈
(gdb) thread apply all bt full  # 带局部变量
```

排查死锁/卡住时，先看 `thread apply all bt`：

- 谁持有锁
- 谁在 `pthread_mutex_lock`/`futex` 等
- 谁在 `read`/`epoll_wait` 等 IO

控制调度：

```bash
(gdb) set scheduler-locking on    # 只让当前线程跑
(gdb) set scheduler-locking step  # 单步时锁
(gdb) set scheduler-locking off
```

跟踪 fork：

```bash
(gdb) set follow-fork-mode child   # 跟子进程
(gdb) set detach-on-fork off       # 父子都留着
```

fork/exec 事件本身用 `catch fork` / `catch exec`，见后面的 catch 节。

## 7. core dump

程序已经死了，只能看 core。

```bash
ulimit -c unlimited          # 当前 shell 放开 core
./app                        # 崩了会生成 core
gdb ./app core
```

core 文件位置由 `core_pattern` 决定：

```bash
cat /proc/sys/kernel/core_pattern
# systemd 系统常见：|/usr/lib/systemd/systemd-coredump ...
coredumpctl list
coredumpctl debug <pid>
```

在 core 里最常看：

```bash
(gdb) bt
(gdb) bt full
(gdb) frame 0
(gdb) info registers
(gdb) x/10i $pc
(gdb) info locals
```

没有源码/符号时：

```bash
addr2line -e ./app -f -C 0x401234
```

运行中的进程也可以主动 dump：

```bash
gcore <pid>                  # 生成 core.<pid>
gdb ./app core.<pid>         # 再按 core 分析
```

## 8. 进阶

### 信号

```bash
(gdb) info signals
(gdb) handle SIGPIPE nostop noprint pass
(gdb) handle SIGSEGV stop print
(gdb) catch signal SIGUSR1
```

- `nostop`：收到信号不停
- `noprint`：不打印信号信息
- `pass`：把信号继续交给程序
- `catch signal`：信号到达时停下来，适合抓“悄悄发生”的信号

调试网络服务时，`SIGPIPE` 默认会让 GDB 停下来；不想被它打断就 `nostop noprint pass`。

### catch：抓事件

```bash
(gdb) catch throw            # C++ 抛异常时停
(gdb) catch catch            # 捕获时停
(gdb) catch syscall openat   # 指定系统调用
(gdb) catch load mylib.so    # 共享库加载
(gdb) catch unload           # 共享库卸载
(gdb) catch fork
(gdb) catch exec
```

### 修改状态与跳转

```bash
(gdb) set var x = 42          # 改变量
(gdb) set $rax = 0            # 改寄存器
(gdb) return                  # 立即从当前函数返回
(gdb) jump file.cpp:100       # 跳到指定行
(gdb) call foo(1)             # 实际执行函数，注意副作用
(gdb) dprintf file.cpp:100, "x=%d\n", x   # 不中断地打印
```

`return`/`jump` 会跳过正常的清理逻辑，适合验证假设，不适合当常规流程。

### 反向调试

```bash
(gdb) record full            # 记录执行（慢）
(gdb) reverse-continue
(gdb) reverse-step
```

一个最小流程：

```bash
(gdb) break main
(gdb) run
(gdb) record full
(gdb) next
(gdb) reverse-step          # 回到上一行
(gdb) reverse-continue      # 反向继续
```

更常用的是 `rr`：

```bash
rr record ./app
rr replay
```

### 远程调试

目标机：

```bash
gdbserver :1234 ./app
```

开发机：

```bash
gdb ./app
(gdb) target remote <target-ip>:1234
(gdb) continue
(gdb) detach
(gdb) monitor exit          # 让 gdbserver 退出
```

如果目标程序还没跑，`gdbserver` 会先停在入口；`continue` 之后才真正执行。

交叉编译时可能还要：

```bash
(gdb) set sysroot /path/to/sysroot
(gdb) set solib-search-path /path/to/libs
(gdb) set substitute-path /build /src
(gdb) info sharedlibrary      # 看共享库基址/加载状态
```

一个 gdbserver 调多个程序：

```bash
gdbserver --multi :1234
(gdb) target extended-remote <target-ip>:1234
```

### Python 脚本

```bash
(gdb) python print(gdb.parse_and_eval("x"))
(gdb) python gdb.execute("bt")
```

可以写命令宏、自动化检查。

### 命令脚本与日志

`~/.gdbinit` 里放常用设置，启动时自动加载：

```bash
set pagination off
set print pretty on
set confirm off
```

项目里可以放一份脚本，按需加载：

```bash
(gdb) source ./gdb-helpers.gdb
```

定义自己的命令：

```bash
(gdb) define mycmd
> bt
> info registers
> end
(gdb) mycmd
```

把一次调试输出留档：

```bash
(gdb) set logging file gdb.log
(gdb) set logging enabled on
```

### 终端前端：CGDB

CGDB 是 GDB 的 curses 前端：上面显示源码，下面还是 GDB 命令窗口，SSH 里也能用。

```bash
sudo apt install cgdb
cgdb ./app
```

- `Esc` 进源码窗口，`i` 回 GDB 窗口
- 源码里 `space` 下/取消断点，`t` 临时断点
- `F5` run、`F6` continue、`F7` finish、`F8` next、`F10` step
- GDB 命令照旧；它只是界面，不改变调试能力

## 9. 常见坑

### 编译与符号

| 现象 | 原因 | 处理 |
|---|---|---|
| 只有地址，没有行号/变量 | 没加 `-g` | 重新编译：`-g -O0` 或 `-g -Og` |
| 变量显示 `<optimized out>` | `-O2` 优化/内联 | 调试用 `-Og`；或看寄存器/汇编反推 |
| 源码窗口空白/错行 | 构建路径和本地不同 | `set substitute-path /build /src`、`dir` |
| STL 打印一堆内部字段 | pretty printer 未加载 | `info pretty-printer`；检查 libstdc++ 脚本 |

### attach 与 core

| 现象 | 原因 | 处理 |
|---|---|---|
| `attach`/`gcore` 失败 | Yama `ptrace_scope=1` | 父进程 attach、`sudo`，或调 `ptrace_scope` |
| 容器里 attach 不上 | 缺 ptrace 权限/seccomp | `--cap-add=SYS_PTRACE`；必要时调 seccomp |
| 崩了但没有 core | `ulimit -c` 为 0，或 `core_pattern` 被接管 | `ulimit -c unlimited`；看 `/proc/sys/kernel/core_pattern` |
| core 被 apport/systemd 接走 | `core_pattern` 是管道 | `coredumpctl list/debug`，或改配置 |
| core 和二进制对不上 | 版本/编译选项不一致 | 用崩溃时同一份 binary + 符号 |
| attach 后进程像卡住 | GDB 默认 all-stop | 看完尽快 `detach` |

### 线程、fork 与信号

| 现象 | 原因 | 处理 |
|---|---|---|
| 单步时线程乱跳 | 调度器在切线程 | `set scheduler-locking on` |
| 死锁看不出谁等谁 | 只看当前线程 | `thread apply all bt` |
| fork 后跟错进程 | 默认跟父进程 | `set follow-fork-mode child/parent`；`set detach-on-fork off` |
| `SIGPIPE`/`SIGUSR1` 把 GDB 打断 | GDB 默认遇到信号就停 | `handle SIGPIPE nostop noprint pass` |

### 断点与观察点

| 现象 | 原因 | 处理 |
|---|---|---|
| 共享库断点 pending | 库还没加载 | `set breakpoint pending on`；等库加载后再下 |
| PIE 地址断点打不中 | 运行基址随机化 | 用符号/行号；`start` 后看实际基址 |
| `watch` 很慢 | 软件观察点/范围太大 | 缩小变量/作用域；硬件观察点数量有限 |
| 变量出作用域后 watch 失效 | 观察点依赖作用域 | 在作用域内下；或 watch 内存地址 |

### 远程与输出

| 现象 | 原因 | 处理 |
|---|---|---|
| gdbserver 连接失败 | 版本/端口/防火墙 | 两边 GDB 版本尽量一致；`ss -lntp` 看端口 |
| 共享库 missing | sysroot/solib 路径不对 | `set sysroot`、`set solib-search-path` |
| debuginfod 卡在提示 | 自动下载调试信息 | `set debuginfod enabled off` |
| 输出分页停住 | pagination | `set pagination off` |
| `print` 改了程序状态 | 调用函数有副作用 | 用 `set var`/看寄存器；别随便 `p foo()` |
| `catch throw` 太吵 | 所有异常都停，包括被捕获的 | 条件断点/继续；断具体异常类型 |
| `return`/`jump` 跳过清理 | 直接改控制流 | 只用于验证假设，别当常规流程 |

> GDB 不是 sanitizer 替代：内存越界/竞态先用 ASan/UBSan/TSan；GDB 负责逻辑错误和崩溃现场。
> macOS/LLVM 工具链常用 `lldb`，命令不同但概念相通。

## 10. 速查

```bash
gdb ./app                 # 启动
gdb -p <pid>              # attach
gdb ./app core            # core

b file:42                 # 断点
tb func                   # 临时断点
c                         # 继续
n / s                     # 下一行 / 进入函数
finish                    # 返回
bt [full]                 # 栈
frame N                   # 切帧
up / down                 # 上/下一层
info locals               # 局部变量
p x                       # 打印
x/16gx $rsp               # 内存
watch x                   # 观察点
info threads              # 线程
thread apply all bt       # 所有线程栈
set scheduler-locking on  # 锁线程
help breakpoints          # 查命令帮助
apropos "breakpoint"      # 按关键字搜命令
```
