# clang-format

代码排版工具：**统一风格、不用人肉对齐**（空格/缩进/换行/`#include` 排序）。

> clang-format 18.1.3；下面的预设差异与格式化效果均为真实输出。

## 1. 基本用法

```bash
clang-format file.cpp                    # 结果输出到 stdout（不动原文件）
clang-format -i file.cpp                 # 原地修改（in-place）
clang-format -i src/*.cpp                # 批量（glob 不递归）
clang-format --style=Google -i file.cpp  # 指定预设
clang-format --style=file -i file.cpp    # 用项目里的 .clang-format

# 递归批量（bash 先开 globstar）
shopt -s globstar && clang-format -i src/**/*.cpp
```

## 2. 预设风格：差在哪（实测对比）

`clang-format -style=<预设> -dump-config` 看全部配置。几个关键项：

| 配置 | Google | LLVM |
|------|:---:|:---:|
| `IndentWidth` | 2 | 2 |
| `PointerAlignment` | **Left**（`int* p`） | **Right**（`int *p`） |
| `DerivePointerAlignment` | **true**（跟随文件里已有写法） | false |
| `ColumnLimit` | 80 | 80 |

**"为什么格式化结果和我预期不同"**：预设里 `DerivePointerAlignment: true` 会"看文件原本怎么写的"——想要强制统一就显式设 `DerivePointerAlignment: false` + `PointerAlignment`。

其它预设：`Chromium`、`Mozilla`、`WebKit`、`Microsoft`、`GNU`。

```bash
clang-format -style=llvm -dump-config > .clang-format   # 导出预设当起点，再改
```

## 3. 配置文件 `.clang-format`

放项目根（工具**逐级向上查找**，子目录可放自己的覆盖）：

```yaml
BasedOnStyle: Google
IndentWidth: 4
ColumnLimit: 100
PointerAlignment: Left
DerivePointerAlignment: false
SortIncludes: CaseSensitive   # Never / CaseSensitive / CaseInsensitive（默认 CaseSensitive）
```

**实测效果**（`--style=Google`，一段乱排的代码）：

```cpp
// 前：include 顺序乱、缩进不一致
#include <vector>
#include <iostream>
int  main( ) { std::vector<int> v = {1,2,3}; }

// 后：include 自动排序、缩进归位
#include <iostream>
#include <vector>
int main() { std::vector<int> v = {1, 2, 3}; }
```

## 4. 局部忽略

```cpp
// clang-format off
int  messy   = 1;      // 表格、宏、特殊排版：跳过格式化
// clang-format on
```

（整个目录跳过：目录里放一个内容为 `DisableFormat: true` 的 `.clang-format`。）

## 5. 编辑器集成

- VS Code：clangd 或 C/C++ 插件 + `"editor.formatOnSave": true` → 保存即排版
- 这样**团队风格统一**不靠自觉，靠工具

## 6. CI / 预提交

```bash
clang-format --dry-run --Werror src/*.cpp    # 只检查：不合规就退出非 0
```

适合放进 **pre-commit 钩子/CI**（防止"格式不一致"的 diff 混进仓库）。

**只格式化"你改过的行"**（不碰整个文件，diff 更干净）——`git clang-format`：

```bash
git clang-format          # 相对 HEAD 的改动（暂存/工作区）
git clang-format HEAD~1   # 最近一次提交碰过的行
git clang-format main     # 从 main 分出去后的全部改动
```

（命令随 clang-format 一起安装，直接可用；`git clang-format --help` 看全部用法。）

（和 clang-tidy 的分工：format 管排版、tidy 管语义——见 [clang-tidy](clang-tidy.md)。）
