# CMake

CMake 是 C++ 事实标准的**构建系统生成器**：写一份 `CMakeLists.txt`，跨平台生成 Makefile / Ninja / VS 工程。

## 一句话

现代 CMake = **一切围绕 target**：每个 target 自带 include / 依赖 / 选项并自动传播；一个库对外只暴露一个 `find_package` + 一个带命名空间的 target（如 `fmt::fmt`）。

## 学习路径

| # | 篇目 | 内容 |
|---|------|------|
| 1 | [基础](基础.md) | CMake 是什么、语法、变量、控制流 |
| 2 | [构建与安装流程](构建与安装流程.md) | 配置 → 编译 → 安装 三步详解 |
| 3 | [核心：Target](核心-target.md) | `target_*`、**PUBLIC/PRIVATE/INTERFACE**、ALIAS |
| 4 | [依赖管理](依赖管理.md) | `find_package` / `FetchContent` / `add_subdirectory` |
| 5 | [安装与导出](安装与导出.md) | `install` / `export`、让别人 `find_package` 你的库 |
| 6 | [生成器表达式](生成器表达式.md) | `$<...>`、`$<BUILD_INTERFACE>` |
| 7 | [实践与坑](实践与坑.md) | 现代 vs 旧、GLOB、作用域等坑 |
| 8 | [完整实战](完整实战.md) | 端到端：可安装的库 + 消费它 |
| 9 | [工程实践](工程实践.md) | 多目录、Presets、自定义命令、CTest、加速 |
| 10 | [进阶主题](进阶主题.md) | 交叉编译、CPack、OBJECT 库、特性检测 |

## 快速上手

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release   # configure
cmake --build build -j                            # build
cmake --install build --prefix ~/.local           # install
```
