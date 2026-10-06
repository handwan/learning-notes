# clang

LLVM 的 C/C++ 工具链。这里是**编译器本身 + 三个日常工具**（format / tidy / d）。

| 工具 | 作用 | 一句话 |
|------|------|--------|
| [clang 编译器](clang.md) | 编译器（gcc 的替代） | 错误信息好、sanitizer/静态分析发源地、`--target` 交叉编译 |
| [clangd](clangd.md) | 语言服务器（编辑器补全/跳转/诊断） | 靠 `compile_commands.json` 懂项目 |
| [clang-format](clang-format.md) | 排版 | 保存即格式化，风格统一 |
| [clang-tidy](clang-tidy.md) | 静态检查 + 自动修 | 找 bug、推现代化写法 |

## 学习路径

1. **先配编辑器**（收益最大）：clangd + clang-format，保存时既补全又排版（前提：`compile_commands.json`，见 [CMake 基础 · 工具链集成](../cmake/基础.md)）
2. **把编译器用起来**：`clang++` 命令与 gcc 几乎一致；重点用它的 **sanitizer**（ASan/UBSan）和 `-ftime-trace`（编译耗时）
3. **提交前加一道**：clang-tidy（CI/pre-commit 里 `-p build`）
4. 和 CMake 组合：`-DCMAKE_CXX_COMPILER=clang++` + `CMAKE_EXPORT_COMPILE_COMMANDS=ON`

## 重点

- **四件套共用一个前提**：`compile_commands.json`（"每个文件怎么编译"）——没有它，clangd 补全/tidy 检查都会"看不懂项目"
- **三工具分工**：clangd 实时诊断/跳转 → clang-format 保存排版 → clang-tidy 提交前深查
- **clang 的独占能力**：`-Weverything`、`-ftime-trace`、`--analyze`/`scan-build`、MSan、`--target` 交叉编译
- **ABI 坑**：Linux 上 clang 默认用 `libstdc++`（和 gcc 兼容）；换 `-stdlib=libc++` 就**不能和 gcc 产物混链**
- **别全开**：`-Weverything` 和 "开全部 sanitizer" 都有噪音/副作用（见 [clang 编译器 §6](clang.md)）

> 相关：[CMake 工具链集成](../cmake/基础.md)、C++ 的[性能优化与调试](../../01-programming/cpp/性能优化与调试.md)（sanitizer 实战）、[C 语言要点](../../01-programming/cpp/C语言要点.md)（ASan 抓错）。
