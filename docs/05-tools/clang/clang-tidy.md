# clang-tidy

基于 AST 的**静态检查**：找 bug、性能问题、过时写法，并给现代 C++ 改写建议（很多能自动修）。

> clang-tidy 18.1.3；下面 `bad.cpp` 的告警与 `--fix` 均为真实输出。

## 1. 基本用法

```bash
clang-tidy -p build src/a.cpp          # 读取 compile_commands.json 拿编译参数（推荐）
clang-tidy file.cpp -- -std=c++20 -Iinclude   # 没有 DB 时：`--` 之后手写编译参数
```

**注意**：**语法错误**时检查跑不了（只报 `clang-diagnostic-error`）；语义错误（如类型未定义）检查可能照跑，但会以 `Found compiler error(s).` 结束，且默认不应用 `--fix`（要 `--fix-errors`，见 §3）。

## 2. 检查类别（-checks）

```bash
clang-tidy -checks='-*,modernize-*,bugprone-*,performance-*' -p build src/a.cpp
```

| 前缀 | 内容 |
|------|------|
| `bugprone-*` | 易错写法（悬垂引用、误用移动后的对象……） |
| `modernize-*` | 建议改用 C++11/14/17/20 新特性 |
| `performance-*` | 性能问题（多余拷贝、按值传参……） |
| `readability-*` | 可读性 |
| `cppcoreguidelines-*` | C++ 核心准则 |
| `-*` | 先关全部，再按需开（避免默认集合里的噪音） |

**注意**：`-*` 会把**编译器诊断**（`clang-diagnostic-*`）也一起关掉——想保留 `-Wall` 那类警告要显式加回（如 `-checks='-*,modernize-*,clang-diagnostic-*'`）；另外 `-*` 单独用会直接报 `no checks enabled`。

**实测告警样例**（对一段"能用但不现代"的代码跑上面这组检查）：

```
bad.cpp:4:30: warning: annotate this function with 'override' ... [modernize-use-override]
bad.cpp:7:5:  warning: use range-based for loop instead      [modernize-loop-convert]
bad.cpp:10:6: warning: use a trailing return type ...        [modernize-use-trailing-return-type]
```

（`modernize-use-trailing-return-type` 风格争议大——会把大量函数改成尾置返回类型，很多项目直接关掉。）

## 3. 自动修复（--fix）

实测 `clang-tidy --fix --fix-errors -checks='-*,modernize-*' bad.cpp -- -std=c++20` 的改动：

```diff
-struct Derived : Base { void f(); };
-int sum(const std::vector<int>& v) {
-    for (int i = 0; i < (int)v.size(); ++i) s += v[i];
+struct Derived : Base { void f() override; };
+auto sum(const std::vector<int>& v) -> int {
+    for (int i : v) s += i;
```

**用法建议**：

- 编译出错时**默认不应用修复**；`--fix-errors` 连错误自带的修也应用
- 改完**跑两遍**（新修可能引出新告警），并**必看 `git diff`**（改名/接口变化它也会动）
- **先开小集合**（如只开 `modernize-*`）逐步加

## 4. 压掉某条告警：NOLINT

```cpp
int x = 1;  // NOLINT(readability-magic-numbers)    ← 同一行

// NOLINTNEXTLINE(modernize-use-override)            ← 放上一行，管下一行
struct D : Base { void f(); };

// NOLINTBEGIN(modernize-use-override)               ← 管一段
struct D2 : Base { void f(); };
// NOLINTEND(modernize-use-override)
```

- 不写检查名 = 压掉**所有**告警（慎用）；写名字/通配更精确
- `NOLINTNEXTLINE` 管的是**下一行**，放在本行无效（常见踩坑）

## 5. 配置文件 `.clang-tidy`

放项目根，`clang-tidy -p build` 自动读取（"配置进仓库"而不是每人一套）：

```yaml
Checks: 'bugprone-*,modernize-*,performance-*'
WarningsAsErrors: ''
HeaderFilterRegex: 'src/.*'
CheckOptions:
  readability-identifier-naming.ClassCase: CamelCase   # 命名规则等参数在这里调
```

**CI 集成**：`run-clang-tidy -p build -fix -j$(nproc)` 批量**并行**跑；`-warnings-as-errors` 会把**所有**已启用告警升级为失败——存量告警多时会挡住 CI，只卡新增要配合 diff 型工具（LLVM 源码里的 `clang-tidy-diff.py` 等）或先清存量。

## 6. 和 clang-format 的分工

| 工具 | 管什么 |
|------|--------|
| clang-format | **排版**（空格、缩进、换行） |
| clang-tidy | **语义**（写法、bug、现代化） |

（clangd 可以顺带跑 clang-tidy 的检查，见 [clangd](clangd.md)。）
