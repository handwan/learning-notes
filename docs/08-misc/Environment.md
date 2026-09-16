# 本机环境

ubuntu2404

## Python + MkDocs 环境

使用 venv 创建文档独立环境。

```bash
python3 -m venv .venv
```

配置清华源

```bash
mkdir -p ~/.config/pip
# 写入 ~/.config/pip/pip.conf：
# [global]
# index-url = https://pypi.tuna.tsinghua.edu.cn/simple
# timeout = 60
```

用 venv 里的 pip 安装

```bash
./.venv/bin/pip install mkdocs mkdocs-material
./.venv/bin/pip install mkdocs-awesome-pages-plugin

# 新建项目
./.venv/bin/mkdocs new .
# 运行
./.venv/bin/mkdocs serve
```

## Git

```bash
sudo apt install git
```
## C/C++ 开发工具

| 类别 | 工具 |
|------|------|
| 编译器 | gcc/g++、clang/clang++ |
| 构建 | make、cmake、ninja |
| 调试 | gdb、lldb |
| 代码质量 | clang-format、clang-tidy、clangd |
| 内存检测 | valgrind |
| 静态分析 | cppcheck |

```bash
sudo apt install gcc g++ gdb
sudo apt install clang lldb clang-format clang-tidy clangd
sudo apt install make cmake ninja-build
sudo apt install valgrind cppcheck
```

## Numpy + Matplotlib + Jupyter 环境

新建独立开发虚拟环境（与网站 Python 隔离）

```bash
python3 -m venv ~/py-learn
```

装 jupyter + numpy + matplotlib

```bash
~/py-learn/bin/pip install jupyter numpy matplotlib jupyterlab-language-pack-zh-CN
```

启动 jupyter（浏览器输入命令行带 token 的链接）

```bash
~/py-learn/bin/jupyter lab          # 现代 Jupyter
~/py-learn/bin/jupyter notebook     # 经典 Notebook 界面
```
