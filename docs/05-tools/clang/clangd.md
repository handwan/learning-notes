# clangd

LLVM 的**语言服务器**（LSP）：给编辑器提供 C++ 智能功能（补全、跳转、诊断），**不用先构建**。

> clangd 18.1.3（`clangd --check` 可验证配置生效）。

## 1. 提供什么

- 代码补全、跳转到定义/声明、查找引用、重命名
- **实时诊断**（语法/类型错误、未使用变量），不用先编译
- hover 文档、签名帮助、inlay hints
- 格式化（内部调 clang-format）
- **默认就运行** clang-tidy 检查（配置来自 `.clang-tidy` / `.clangd`；`--clang-tidy=false` 可关）

## 2. 前提：怎么让 clangd 懂你的项目

clangd 需要知道每个文件"**怎么编译**"（include 路径、宏、标准）——两种方式：

| 方式 | 适合 |
|------|------|
| **`compile_commands.json`**（推荐） | 有构建系统的项目（CMake/bear 生成，详见 [CMake 基础 · 工具链集成](../cmake/基础.md)） |
| `compile_flags.txt` | 没有构建系统的小项目（每行一个参数） |

```
# compile_flags.txt 示例
-std=c++20
-Iinclude
```

**clangd 的查找顺序**：从源文件所在目录**逐级向上**找 `compile_commands.json`，**父目录里的 `build/` 子目录也会被搜**（官方文档这么说）——CMake 项目通常零配置就能用。

## 3. 配置文件 `.clangd`

放项目根：

```yaml
CompileFlags:
  Add: [-std=c++20, -Wall]
  Remove: [-march=native]         # 本机优化选项会让别的机器上的 clangd 报错

Diagnostics:
  ClangTidy:
    Add: [modernize-*, bugprone-*]   # 在默认集合上追加这两族检查
    Remove: [modernize-use-trailing-return-type]
```

**为什么常写 `Remove: [-march=native]`**：`compile_commands.json` 里的本机专属选项，换机器后 clangd 会误报——在 `.clangd` 里屏蔽掉。

**给第三方代码静音**（整个目录不出诊断；实际项目常用）：

```yaml
If:
  PathMatch: third_party/.*
Diagnostics:
  Suppress: ['*']     # 这个目录里所有诊断静音
```

**为什么编辑器提示比命令行少**：clangd 默认只跑"快"的 clang-tidy 检查（`FastCheckFilter: Strict`）；要全量改成 `Loose`（更慢）。

**两个版本相关的坑**（clangd 18.1.3 实测）：

- `CompilationDatabase: build` 这个键在 **18.x 会报 `Unknown Config key` 并被忽略**；较新版里它挂在 `CompileFlags` 下（`CompileFlags.CompilationDatabase`，可填目录 / `Ancestors` / `None`）。不影响使用：clangd 本来就会自动去 `build/` 找 `compile_commands.json`（实测日志：`Loaded compilation database from .../build/compile_commands.json`）。要显式指定目录，可以用启动参数 `clangd --compile-commands-dir=build`（VS Code 里写进 `clangd.arguments`）
- `.clangd` 的 `Diagnostics.ClangTidy` 和 `.clang-tidy` 是**合并**关系（冲突项以 clangd 侧为准）——18.1.3 实测：两边配置的检查都会生效，不用二选一

## 4. 编辑器（VS Code）

1. 装 **clangd** 插件（`llvm-vs-code-extensions.vscode-clangd`）
2. **禁用 ms-vscode.cpptools 的 IntelliSense**，否则两个引擎打架：

```json
"C_Cpp.intelliSenseEngine": "disabled"
```

3. 项目根（或 `--compile-commands-dir` 指定的目录）能解析到 `compile_commands.json` 即可用

## 5. 常见问题

| 现象 | 原因/解法 |
|------|----------|
| 补全没有/全是波浪线 | 找不到 `compile_commands.json` → 看 clangd 日志（Output → clangd），确认路径 |
| 换机器后一堆错 | 构建命令里有本机专属选项（`-march=native`）→ `.clangd` 里 `Remove` |
| 索引很慢/内存大 | 大项目正常；`.clangd` 里 `Index.Background: Skip`（不建后台索引）或限制范围 |
| 和 C/C++ 插件冲突 | 禁用 cpptools IntelliSense（见 §4） |
| Docker 里构建、宿主机编辑 | 路径不同（绝对路径）→ 重建 DB 或用 remote 开发 |

## 6. 和其它工具的分工

写代码时 **clangd 实时诊断/跳转**、保存时 **clang-format 排版**、提交前 **clang-tidy 深查**——总览见[本章 index](index.md) 和 [clang-tidy](clang-tidy.md)。
