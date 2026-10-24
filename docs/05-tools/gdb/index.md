# GDB

GDB 是原生程序的调试器。它不负责让程序变快，也不负责抓内存越界；它负责在程序停下的那一刻，让你看清栈、变量、线程和地址。

## 它解决什么

| 问题 | 第一步 |
|------|--------|
| 崩溃（`SIGSEGV`/`SIGABRT`） | `run` → `bt` → `frame 0` → `info locals` |
| 逻辑错误（变量不对、分支走错） | 断点/条件断点 → 单步 → `print` |
| 卡死/死锁 | `thread apply all bt`，看谁在等锁/IO |
| 线上进程卡住 | `gdb -p <pid>`，看完 `detach` |
| 事后分析 | `ulimit -c` / `coredumpctl` / `gcore` → `bt` |
| 远程/嵌入式 | `gdbserver` + `target remote` |

## 最小闭环

```bash
g++ -g -O0 -fno-omit-frame-pointer app.cpp -o app
gdb ./app
(gdb) run
(gdb) bt                 # 先看调用栈
(gdb) frame 0            # 切到最内层
(gdb) info locals        # 再看变量
```

先 `bt` 定位，再切 frame 看变量；不要一上来就单步。

## 几条判断

- **调试信息**：`-g` 必须有；`-O2` 下变量可能是 `<optimized out>`，调试用 `-O0`/`-Og`
- **core**：`ulimit -c unlimited` 只是第一步；还要看 `core_pattern` 是否被 apport/systemd 接管
- **attach**：受 `ptrace_scope`/Yama 限制；容器里还要 ptrace 权限；attach 会暂停进程
- **多线程**：死锁先 `thread apply all bt`；单步乱跳用 `scheduler-locking`
- **信号**：`SIGPIPE`/`SIGUSR1` 会打断 GDB，必要时 `handle ... nostop noprint pass`
- **它不是 sanitizer/perf**：内存越界/竞态先用 ASan/UBSan/TSan；CPU 热点用 perf

## 能调什么

- **原生语言**：C/C++ 最顺；Rust、Fortran、Ada、D、汇编也能调
- **Go**：GDB 能看原生栈，但 goroutine 用 Delve 更合适
- **Python**：GDB 调的是 CPython 解释器和 C 扩展，不是纯 Python；纯 Python 用 `pdb`/`debugpy`
- **Java/C#/JS/PHP**：只能调 native 扩展，调不了字节码

## 完整内容

[GDB 用法与调试](gdb.md) 包括：

- 启动方式、断点、运行控制、看现场
- 多线程、fork、信号
- core、attach、gcore、gdbserver
- catch、record/rr、改状态、Python、脚本、CGDB
- 按现象查的常见坑表
