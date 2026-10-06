# clang 编译器

LLVM 的 C/C++ 编译器。`clang-format` / `clang-tidy` / `clangd` 都出自同一个 LLVM 项目，这里讲的是**编译器本身**。

## 1. 是什么

- **LLVM 项目的 C/C++/ObjC 编译器**（clang 前端 + LLVM 后端）
- gcc 的替代品：命令、选项都高度相似
- 系统默认：**macOS / BSD** 用 clang；Linux 要装（`sudo apt install clang`）
- 授权 **Apache 2.0**（gcc 是 GPL v3）——可自由嵌进商业产品

## 2. clang vs gcc

| 维度 | clang | gcc |
|------|-------|-----|
| **错误信息** | **更友好**（位置准、带修复建议、彩色） | 也在改进 |
| 编译速度 / 内存 | 通常更快、更省 | — |
| 生成代码 | 接近（各有胜负） | — |
| 默认 C++ 标准库 | macOS 用 **libc++**、Linux 用 **libstdc++** | **libstdc++** |
| 授权 | Apache 2.0 | GPL v3 |
| 特色 | **sanitizer / 静态分析的发源地** | 跟得也快 |

## 3. 基本用法

和 `g++` 几乎一样：

```bash
clang++ -std=c++20 -O2 -Wall -g main.cpp -o main
```

大多数 gcc 选项 clang 都支持：`-O2`、`-g`、`-Wall -Wextra`、`-I`、`-L -l`、`-fsanitize=...`、`-fPIC -shared`……

## 4. clang 特色

### `-Weverything`（开全部警告）

```bash
clang++ -Weverything main.cpp                                  # 开所有警告
clang++ -Weverything -Wno-c++98-compat -Wno-padded main.cpp    # 再逐个关掉不要的
```

gcc 没有等价物（gcc 只有 `-Wall -Wextra` 两档）。

### `-ftime-trace`（编译耗时分析）

```bash
clang++ -ftime-trace main.cpp -o main    # 生成 main.json
```

用 Chrome 打开 `chrome://tracing` 加载它——**一眼看出哪个头文件 / 模板实例化最耗时**（大项目编译慢的排查利器）。

### 静态分析器（比编译警告更深）

```bash
clang++ --analyze main.cpp     # 分析单文件
scan-build make                # 配合构建系统
```

能发现编译警告抓不到的问题（空指针路径、资源泄漏、逻辑错误）。

### Sanitizer 全家桶（clang 是发源地）

```bash
clang++ -fsanitize=address   -g main.cpp   # ASan：内存错误
clang++ -fsanitize=undefined -g main.cpp   # UBSan：未定义行为
clang++ -fsanitize=thread    -g main.cpp   # TSan：数据竞争
clang++ -fsanitize=memory    -g main.cpp   # MSan：未初始化读（gcc 没有）
clang++ -fsanitize=leak      -g main.cpp   # LSan：内存泄漏（Linux 上 ASan 默认已含）
```

**clang 支持最全**（尤其 MSan 只有 clang 有）。

（各工具抓什么 → C++ 的[性能优化与调试](../../01-programming/cpp/性能优化与调试.md) §9；哪些选项容易"过度" → 本文 §6。）

### 换标准库

```bash
clang++ -stdlib=libc++ main.cpp    # 用 LLVM 的 libc++ 代替 libstdc++
```

### 交叉编译（`--target`）

**clang 天生就是交叉编译器**——一条 `--target=` 就能编别的架构（gcc 要单独装交叉工具链）：

```bash
clang++ --target=aarch64-linux-gnu main.cpp -o main_arm64     # 编 ARM64
clang++ --target=riscv64-linux-gnu  main.cpp -o main_riscv    # 编 RISC-V
```

完整一点还要指定目标平台的 sysroot：

```bash
clang++ --target=aarch64-linux-gnu --sysroot=/usr/aarch64-linux-gnu main.cpp -o main_arm64
```

**用途**：嵌入式、AI 部署（ARM）、异构平台。

### 其他实用选项

| 选项 | 作用 |
|------|------|
| **`-###`** | **打印实际执行的命令**（调试编译参数、看真实的 include 路径） |
| `-fsyntax-only` | 只检查语法、不生成代码（快速验证） |
| `-fuse-ld=lld` | 用 LLVM 的 lld 链接（比 GNU ld 快） |
| `-fno-color-diagnostics` | 关掉彩色诊断（写日志 / CI 用） |
| `-w` / `-Werror` | 关警告 / 把警告当错误 |

## 5. 实测：特色功能的真跑证据

上面每个特色都真跑过（clang 18.1.3）：

| 功能 | 实测命令/结果 |
|------|--------------|
| **静态分析器** | `clang++ --analyze leak.cpp` → `warning: Potential leak of memory pointed to by 'p' [unix.Malloc]`，并生成 `leak.plist` |
| **ASan** | `-fsanitize=address` 跑越界写 → `ERROR: AddressSanitizer: heap-buffer-overflow` |
| **`-ftime-trace`** | `clang++ -ftime-trace -c t.cpp -o t.o` → 生成 `t.json`（210 条 traceEvents、总耗时 1535 ms，Chrome 打开看热点） |
| **`-###`** | 打印真实执行的 `clang -cc1 ...` 命令（看 include 路径/内部选项） |
| **`--target` 交叉编译** | `--target=aarch64-linux-gnu` 不带 sysroot → `fatal error: 'vector' file not found`（验证了"必须配 sysroot"） |

**两个使用注意**：

- `-ftime-trace` 的输出名跟 `-o` 走（`-o t.o` → `t.json`；写成 `-o /dev/null` 会尝试写 `/dev/null.json` 报错）
- 静态分析器**报告比编译警告深**，但慢——适合按需跑（CI 夜间/重点模块），不必每次编译都开

## 6. 编译配置（三套 build）

工程上按用途分**三套**配置，**别混**：

| 用途 | 关键选项 |
|------|---------|
| **日常开发** | `-O1 -g -Wall -Wextra` |
| **测试 / 排错** | `-O1 -g` + ASan/UBSan + `-D_GLIBCXX_ASSERTIONS` |
| **发布** | `-O2 -DNDEBUG` + 加固，**无 sanitizer** |

### 测试 build（核心选项）

```bash
clang++ -std=c++23 \
  -g -O1 \
  -Wall -Wextra -Wshadow \
  -fsanitize=address,undefined \
  -fno-sanitize-recover=all \
  -fno-omit-frame-pointer \
  -D_GLIBCXX_ASSERTIONS \
  main.cpp -o main
```

（gcc 同样支持：`clang++` 换 `g++` 即可）

| 选项 | 为什么必要 |
|------|-----------|
| `-g -O1` | 能调试、又不至于太慢 |
| `-Wall -Wextra` | 性价比最高的警告 |
| **`-Wshadow`** | 抓**变量遮蔽**（局部变量盖住外层的）——真 bug 源，几乎无噪音 |
| **`-fsanitize=address,undefined`** | **内存错误 + UB 一网打尽**（最值） |
| `-fno-sanitize-recover=all` | 出错立刻 abort，不埋隐患 |
| `-fno-omit-frame-pointer` | ASan 栈回溯必需 |
| **`-D_GLIBCXX_ASSERTIONS`** | 容器越界（`v[i]`）立刻报，几乎零成本 |

### 容易"过度"的选项（不是越多越好）

| 选项 | 问题 |
|------|------|
| `-Weverything` | 已含 `-Wall/-Wextra`；**噪音大、随编译器版本变**（今天能编明天未必） |
| `-fsanitize=leak` | ASan 在支持平台上**默认已集成**（含 Linux / macOS），一般不用显式加 |
| `-fsanitize=float-divide-by-zero` | 浮点除零在 IEEE 语义下产生 inf/NaN（"拿无穷"的正当方式），一般不该报 |
| `-fsanitize=integer` | 含 `unsigned-integer-overflow`（defined），噪音大 |
| `-fstack-protector-strong` | ASan 已覆盖栈溢出；这是**发布加固**用的 |

### 按需加

| 选项 | 场景 |
|------|------|
| `-Wpedantic` | 标准符合性检查 |
| `-ftrivial-auto-var-init=pattern` | 排查未初始化变量（会改行为） |
| `-fsanitize=thread` | 数据竞争（**单独 build**，和 ASan 互斥） |

### 发布 build

```bash
-O2 -g -DNDEBUG -fstack-protector-strong -D_FORTIFY_SOURCE=2 -Wl,-z,relro,-z,now
```

- **`-g` 要留着**：保留调试符号 → **线上 core dump 能 gdb/perf 分析**；真要发布再 `strip main` 剥掉
- CMake 里对应 **`RelWithDebInfo`**（= `-O2 -g`），比 `Release` 更适合生产

### 进阶：LTO / PGO / 覆盖率（clang 口径）

| 主题 | 一句话 + clang 写法 |
|------|---------------------|
| **LTO** | 链接时优化：`-flto`；clang 还有 **ThinLTO**（`-flto=thin`）——跨模块优化且能并行、增量链接快，大工程首选 |
| **PGO** | 两步：`-fprofile-instr-generate` 编译 → 跑典型负载 → `llvm-profdata merge` → `-fprofile-instr-use=default.profdata` 重编（LLVM 格式，和 gcc 的 `-fprofile-generate/-use` 不通用） |
| **覆盖率** | 编译加 `-fprofile-instr-generate -fcoverage-mapping`，运行后用 `llvm-profdata merge` + `llvm-cov show` 看源码级覆盖率（Ubuntu 上是带后缀的 `llvm-cov-18` 等） |

（基础概念与收益见 [编译链接 §11](../../01-programming/cpp/编译链接.md)。）

### CMake 里接入 sanitizer

```cmake
option(USE_SANITIZER "Enable ASan+UBSan" OFF)

add_executable(app main.cpp)
target_compile_options(app PRIVATE -Wall -Wextra -Wshadow)

if(USE_SANITIZER)
    target_compile_options(app PRIVATE
        -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer)
    target_link_options(app PRIVATE -fsanitize=address,undefined)   # ⚠️ 链接也要加！
endif()
```

- **`target_link_options` 必须加**——只在 compile 加、链接不加，会链接不过
- 警告用 `target_compile_options`，**别用全局 `add_compile_options`**（见 [CMake / 核心：Target](../cmake/核心-target.md)）
- 想给所有 target 统一警告 → 建一个 **interface 库**（如 `myproject::warnings`）挂上去

### 实践建议

- 三套配置写进 **`CMakePresets.json`**（`dev` / `sanitize` / `release`），一条 `cmake --preset sanitize` 切换（写法见 [CMake / 工程实践](../cmake/工程实践.md)）
- **别手打这一长串**——容易漏、容易错

## 7. 和 CMake 集成

```bash
cmake -S . -B build \
  -DCMAKE_C_COMPILER=clang \
  -DCMAKE_CXX_COMPILER=clang++
```

或写进 `CMakePresets.json` 的 `cacheVariables`。

## 8. ⚠️ ABI / 标准库的坑

| 场景 | 结果 |
|------|------|
| Linux 上 clang **默认**（用系统 libstdc++） | 和 gcc 编的库**兼容** |
| clang 加 `-stdlib=libc++` | 和 libstdc++ **不兼容** ❌（链接错 / 运行时崩） |
| 项目里混用 gcc 和 clang 编的 `.o` / `.so` | 要保证标准库一致，否则出问题 |

**结论**：一个项目**要么全 gcc、要么全 clang**，别混；换 libc++ 更要整个项目统一。

## 9. 什么时候用 clang

- **本地开发**：错误信息更舒服
- **CI 多编译器验证**：gcc + clang 都编译通过，代码更标准
- 要**最强的 sanitizer / 静态分析**
- 用 clang 系工具（clang-format / tidy / d）

## 10. 要点回顾

1. **clang = LLVM 的 C/C++ 编译器**，gcc 的替代；format/tidy/d 是同项目工具
2. **命令和 gcc 几乎一样**，核心优势是**错误信息更好**
3. **特色**：`-Weverything`、`-ftime-trace`（编译耗时）、静态分析器、**sanitizer 最全**、**`--target` 交叉编译**
4. **CMake 集成**：`-DCMAKE_CXX_COMPILER=clang++`
5. **⚠️ ABI**：默认用 libstdc++、和 gcc 兼容；换 `libc++` 就不兼容——**别混用**
6. **三套 build**：日常（Wall+O1）/ 测试（+ASan/UBSan/_GLIBCXX_ASSERTIONS）/ 发布（O2+加固，无 sanitizer）
