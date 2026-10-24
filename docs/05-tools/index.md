# 工具

按场景查，不按名字背。详细页只写**核心工具**；其余给一句话和最小用法，用到再查 `man` / `--help`。

## 先掌握

这些是日常开发绕不开的，值得有独立详细页。

| 工具 | 解决什么 | 最小用法 | 详细 |
|------|---------|---------|------|
| **Git** | 版本控制、分支、回滚 | `git status` / `git log --oneline` | [Git](git/index.md) |
| **CMake** | 生成构建系统 | `cmake -S . -B build` | [CMake](cmake/index.md) |
| **GDB** | 断点、崩溃现场、调用栈 | `gdb ./app` → `bt` | [GDB](gdb/index.md) |
| **Docker** | 打包环境、复现依赖 | `docker build -t app .` | [Docker](docker/index.md) |
| **perf** | 找 CPU 热点 | `perf record -g ./app` | [perf](perf/index.md) |
| **clang 工具链** | 格式化、静态检查、补全 | `clang-format -i` / `clang-tidy` | [clang](clang/index.md) |

## 日常常用

不必单独成篇，记住“什么时候用 + 一个最小命令”就够。

| 场景 | 工具 | 最小用法 |
|------|------|---------|
| Shell / 多窗口 | `bash`/`zsh`、`tmux` | `tmux new -s work` |
| 远程 / 传文件 | `ssh`、`rsync` | `ssh host`；`rsync -av src/ host:dst/` |
| 找文件 / 找内容 | `fd`、`rg`、`fzf` | `fd name`；`rg pattern`；`fzf` |
| JSON / YAML | `jq`、`yq` | `jq . file.json` |
| HTTP 调试 | `curl`、`httpie` | `curl -v`；`http GET url` |
| 连接 / 端口 | `ss`、`lsof` | `ss -lntp`；`lsof -i :8080` |
| 抓包 | `tcpdump` | `tcpdump -i any -nn port 80` |
| 系统调用 | `strace` | `strace -f -e trace=file ./app` |
| 编译加速 | `ccache`/`sccache`、`mold`/`lld` | `ccache g++`；`-fuse-ld=mold` |
| 内存/并发检查 | ASan / UBSan / TSan；Valgrind（不能重编译时） | `-fsanitize=address,undefined`；`valgrind --leak-check=full ./app` |
| 编辑器 | VS Code + Remote SSH、`clangd` | 远程打开目录，`compile_commands.json` 给 clangd |
| 文档 / 图 | MkDocs、Mermaid | Markdown + `mermaid` 代码块 |

## 按方向补充

| 方向 | 工具 |
|------|------|
| **C++ 工程** | vcpkg/Conan、`clang-format`、`clang-tidy`、`ccache`、`lld`/`mold`、`rr`、`heaptrack` |
| **后端 / SRE** | `systemd`/`journalctl`、`htop`、`iostat`/`vmstat`、Prometheus + Grafana、OpenTelemetry、Kubernetes、Terraform/Ansible |
| **AI 推理** | CUDA、`nvidia-smi`、`ncu`/`nsys`、ONNX Runtime、TensorRT、vLLM、PyTorch |
| **安全** | `checksec`、`readelf`/`objdump`、`openssl`、`gpg`、`ssh-keygen`、`auditd` |

## 怎么用

- 先看 `--help` / `man`，别背参数；知道“它能解决什么”更重要
- 一个工具解决一个问题，别为了工具而工具
- 详细页只写有稳定工作流的工具；其余在 index 留一句话，避免变成命令百科
- 性能问题先 `strace`/`perf` 定位，再考虑换工具；内存问题先 sanitizer/Valgrind
- 生产环境先预演：抓包、strace、perf 都有权限和开销，别直接上核心机器
