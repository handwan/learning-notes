# perf 用法

> perf 看“CPU 花在哪”；strace 看“卡在哪个系统调用”。程序卡住/文件打不开先用 strace，CPU 高先用 perf。

## 1. 权限

```bash
perf stat ./prog
# Access to performance monitoring and observability operations is limited.
```

Ubuntu（较新版本）默认 `perf_event_paranoid = 4`（最严）——**普通用户完全用不了**：

```bash
# 临时放宽
sudo sysctl kernel.perf_event_paranoid=1      # 或 -1（全放开）

# 永久
echo 'kernel.perf_event_paranoid=1' | sudo tee /etc/sysctl.d/99-perf.conf
sudo sysctl --system
```

| 值 | 含义 |
|:--:|------|
| `-1` | 全放开（含 raw tracepoint / 内核采样），开发机可用 |
| `0` | 禁 raw tracepoint / ftrace |
| `1` | 再禁 CPU 级事件 |
| `2+` | 再禁内核采样，越来越严（Ubuntu 默认 4） |

也可以直接 `sudo perf ...`（root 不受此限制）。容器里要 `--privileged`，或加 `CAP_PERFMON`（Linux 5.8+；老内核用 `CAP_SYS_ADMIN`）。

## 2. 编译准备

```bash
g++ -g -O2 -fno-omit-frame-pointer main.cpp -o main
```

| 选项 | 为什么 |
|------|--------|
| `-g` | 能定位到**行号** |
| `-fno-omit-frame-pointer` | 调用栈**完整**（否则火焰图是断的） |
| `-O2` | 别去掉——要测真实优化后的表现 |

## 3. 核心命令

### perf stat：整体指标

```bash
sudo perf stat ./prog
```

```
task-clock        → 占用 CPU 时间
context-switches  → 上下文切换次数
page-faults       → 缺页次数
cycles            → CPU 周期
instructions      → 执行指令数（IPC = instructions / cycles）
branches / branch-misses
```

**混合架构 CPU 的坑**（12 代 Intel 等 P 核/E 核）：

```
Error: Invalid event (cpu_core/TOPDOWN.SLOTS/) in per-thread mode,
enable system wide with '-a'.
```

新版 perf 的默认事件集里有只能"系统级"用的事件 → **显式指定事件绕开**：

```bash
sudo perf stat -e cycles,instructions,branches,branch-misses,cache-misses ./prog
```

### perf record + report：找热点（最常用）

```bash
sudo perf record -g ./prog     # 采样（-g 记录调用栈）
perf report                    # 交互式查看：占比最高的就是热点
perf report --stdio            # 非交互输出（CI/远程）
```

> report 里 `Children` 包含被调用者，`Self` 才是函数自身；找热点先看 `Self`，追调用链再看 `Children`。

> ⚠️ `sudo perf record` 生成的 `perf.data` 属 **root**——若 `perf report` / `perf script` 报权限错，加 `sudo` 或 `sudo chown $USER perf.data`。

### perf top：实时看

```bash
sudo perf top                  # 类似 top，实时显示热点函数
```

### 火焰图

```bash
perf record -g -F 999 ./prog
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg
```

（脚本来自 [FlameGraph](https://github.com/brendangregg/FlameGraph)）

**读法**：横轴 = **采样占比**（CPU 火焰图里可近似当时间，越宽越耗时），纵轴 = 调用栈深度 → 找“**又宽又高**”的方块。

### 其他常用

```bash
perf stat -d ./prog       # 详细指标（L1/dTLB/cache 层级）
perf stat -r 5 ./prog     # 重复 5 次，看平均值/方差（测稳定性）
perf c2c record ./prog    # 检测伪共享（多线程抢同一 cache line）
perf c2c report           # 看伪共享结果
perf trace -p <pid>       # 类似 strace 的系统调用跟踪
```

## 4. 常用参数

| 参数 | 作用 |
|------|------|
| `-g` | 记录调用栈 |
| `-F 999` | 采样频率（避开 1000，防止和定时器同步） |
| `-p <pid>` | 分析**运行中**的进程（`perf record -g -p 1234 -- sleep 10`） |
| `-e <event>` | 指定事件 |
| `-a` | 系统级（所有 CPU） |
| `--call-graph fp` | 默认；靠帧指针，快；需要 `-fno-omit-frame-pointer` |
| `--call-graph dwarf` | 没有帧指针时用 DWARF 展开栈（更准但更慢） |
| `--call-graph lbr` | 硬件分支栈（部分 Intel CPU），开销低 |

**子命令**（不是参数）：`perf report`（看采样结果）、`perf annotate`（**汇编级**热点，哪条指令慢）、`perf list`（列出事件）、`perf diff`（对比两次采样）

**常用事件**：`cycles`、`instructions`、`cache-misses`/`cache-references`、`branch-misses`、`task-clock`

## 5. 指标怎么读

| 指标 | 说明 |
|------|------|
| **IPC** = instructions / cycles | < 1 常见原因是访存/Cache 等待，也可能是指令依赖、分支、前端瓶颈；越高通常说明流水线利用越充分 |
| **cache-miss 率高** | 数据访问不友好 → 改数据结构、提升局部性 |
| **branch-miss 率高** | 分支预测失败多 → 无分支写法、把大概率分支放前面 |

## 6. 典型工作流

```
① perf stat           → 整体有没有异常（IPC、miss 率）
② perf record -g      → 采样
③ perf report / 火焰图 → 找热点函数
④ 优化热点
⑤ 回到 ① 对比验证
```

> **注意**：perf 是**统计采样**——适合"找热点"；要**精确测耗时**用 Google Benchmark。

**优化前后对比**（`perf diff`）：

```bash
perf record -o before.data ./prog_old
perf record -o after.data  ./prog_new
perf diff before.data after.data     # 看哪些函数占比降了/升了
```

## 7. 要点回顾

1. **perf = Linux 采样性能分析**，主力是 `record` + 火焰图
2. **权限**：`perf_event_paranoid`（Ubuntu 默认 4）→ 放宽或 `sudo`
3. **编译**：`-g -fno-omit-frame-pointer`，否则栈不全
4. **混合 CPU 坑**：默认事件集报 TOPDOWN 错 → 用 `-e` 显式指定
5. **三个关键指标**：IPC、cache-miss、branch-miss
6. **采样找热点，benchmark 测精确值**
