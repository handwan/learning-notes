# Shell 与脚本

bash 的引号/变量/heredoc/流程控制、错误处理、实用脚本模板，外加环境变量加载顺序、tmux 与找帮助/历史。

## 1. 变量、引号与展开

```bash
name=wang                 # 赋值：等号两边不能有空格
echo "$name"              # 取值用 $name 或 ${name}
echo ${name}wang          # 需要拼接时用花括号划边界

# 三种引号
echo "hello $name"        # 双引号：变量/命令替换会展开
echo 'hello $name'        # 单引号：原样输出，不展开
echo hello $name          # 不加引号：会做分词和通配符展开（危险）
```

**铁律：变量一律加双引号**——`"$var"`。不加引号时，值里有空格/通配符会被拆开，是脚本 bug 的第一来源：

```bash
f="my file.txt"
rm $f            # ❌ 等于 rm my file.txt（删两个文件）
rm "$f"          # ✅ 一个参数，文件名完整
```

**命令替换与算术**：

```bash
now=$(date +%F)              # 推荐 $()（嵌套友好）
count=$((1 + 2))             # 算术展开
((count++))                  # 算术语句（C 风格）
```

**常用特殊变量**：`$0` 脚本名、`$1..$9` 参数、`$#` 参数个数、`"$@"` 所有参数（**必须加引号**）、`$?` 上个命令退出码、`$$` 当前 PID、`$!` 最近后台进程 PID。

**here-doc（多行文本）**：

```bash
cat <<'EOF'              # EOF 加引号 → 内容不展开（写配置/脚本最常用）
原样保留 $HOME 和 $(date)
EOF

ssh host bash <<'EOF'    # 把一段脚本喂给远端执行
set -euo pipefail
echo done
EOF

tee config <<EOF         # 不加引号 → 展开变量，按当前值写入
path=$PWD
EOF
```

## 2. 参数展开：默认值、长度、路径

```bash
echo ${var:-default}         # var 为空/未设 → 用 default（不改变 var）
echo ${var:=default}         # 空则赋值并返回（会改变 var）
echo ${var:?必须设置}         # 空则报错退出
echo ${#var}                 # 字符串长度
echo ${var:0:3}              # 子串（前 3 个字符）

# 路径处理（替代 basename/dirname，快且无子进程）
p=/opt/app/bin/server
echo ${p##*/}                # server     （去掉最长前缀 */）
echo ${p%/*}                 # /opt/app/bin （去掉最短后缀 /*）
file=a.tar.gz
echo ${file%.tar.gz}         # a          （去掉指定后缀）
echo ${file#*.}              # tar.gz     （去掉第一个 . 之前）
echo ${file//./_}            # a_tar_gz   （替换所有 . → _）
```

## 3. 条件判断

```bash
if [ "$x" -gt 10 ]; then ...; fi          # 数字比较：-eq -ne -gt -ge -lt -le
if [ "$s" = "yes" ]; then ...; fi          # 字符串：= != -z（空） -n（非空）
if [ -f "$f" ]; then ...; fi               # 文件：-f 文件 -d 目录 -e 存在 -x 可执行 -r 可读
if [ -L "$f" ]; then ...; fi               # 符号链接

# [[ ]] 是 bash 增强版：支持正则、&&/||、不用分词
if [[ "$s" =~ ^[0-9]+$ ]]; then ...; fi    # 正则匹配
if [[ -f "$f" && -r "$f" ]]; then ...; fi

# 简写
[ -f "$f" ] && echo exists || echo missing
```

**总是用 `[[ ]]`**（bash 脚本里）。`[ ]` 是 POSIX `test` 语法（bash 里是 builtin），但没有 `[[ ]]` 的分词/模式匹配增强，值里有空格或通配符时更容易踩坑。

## 4. 循环与分支

```bash
# for：列表
shopt -s nullglob        # 没有匹配时展开成空，而不是字面量 *.txt
for f in *.txt; do echo "$f"; done
for i in $(seq 1 5); do ...; done          # 或 {1..5}
for ((i = 0; i < 5; i++)); do ...; done    # C 风格

# for：逐行读文件（IFS= 防首尾空白被吃，read -r 防转义）
while IFS= read -r line; do
    echo "[$line]"
done < input.txt

# 命令输出逐行读（管道会把循环放进子 shell，变量修改外面看不到 → 用进程替换）
count=0
while IFS= read -r line; do
    count=$((count + 1))   # 不用 ((count++))：结果为 0 时状态码是 1，set -e 会退出
done < <(find . -name '*.log')

# case
case "$1" in
    start)   echo starting ;;
    stop)    echo stopping ;;
    restart) echo restarting ;;
    *)       echo "usage: $0 {start|stop|restart}"; exit 1 ;;
esac
```

## 5. 函数与参数

```bash
log() {
    local level="$1"; shift          # 局部变量用 local；shift 把第一个参数移出
    printf '[%s] %s\n' "$level" "$*" >&2
}

backup() {
    local src="$1" dst="$2"
    [ -d "$src" ] || { log ERROR "no such dir: $src"; return 1; }
    rsync -a --delete "$src/" "$dst/" || return 1
    log INFO "backup done: $src -> $dst"
}
```

**要点**：`local` 声明局部变量（不加就是全局）；`return` 返回状态码（不是值，要"返回值"用 echo + `$()`）。

### 参数解析：getopts

```bash
while getopts ":o:v" opt; do
    case "$opt" in
        o) out=$OPTARG ;;
        v) verbose=1 ;;
        \?) echo "invalid option: -$OPTARG" >&2; exit 1 ;;
        :)  echo "missing argument: -$OPTARG" >&2; exit 1 ;;
    esac
done
shift $((OPTIND - 1))       # 剩下的才是位置参数
```

`getopts` 只处理短选项；长选项（`--output`）要自己循环解析或用专门库。

### 批量读文件：mapfile

```bash
mapfile -t lines < file.txt      # 每行一个元素，保留空格
for line in "${lines[@]}"; do
    printf '%s\n' "$line"
done
```

### source：在当前 shell 执行

```bash
source ./env.sh       # 或 . ./env.sh
```

`source` 不会开子 shell，能修改当前 shell 的变量；`./env.sh` 会开子进程，变量通常带不回来。

## 6. 错误处理（脚本的关键）

```bash
#!/usr/bin/env bash
set -euo pipefail
# -e：命令失败立即退出（否则会带着错误一路跑下去）
# -u：用未定义变量报错（防拼写错误）
# -o pipefail：管道中任一环失败，整条管道算失败（否则只看最后一个命令）

# trap：退出/出错时清理（临时文件、锁、子进程）
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

# 出错时打印行号（set -E 让函数里的 ERR 也触发）
set -E
trap 'echo "ERR at line $LINENO" >&2' ERR
```

**`set -e` 的例外**：条件语句里的命令失败不算（`if cmd; then`、`cmd || true`）。写脚本时常用 `cmd || { echo "失败"; exit 1; }` 明确处理。

另外注意算术命令：`((i++))` 在旧值为 0 时返回状态 1，配合 `set -e` 会让脚本直接退出；用 `i=$((i + 1))` 或 `((i += 1))`。

**调试**：

```bash
bash -n script.sh          # 只做语法检查，不执行
bash -x script.sh          # 打印每条执行的命令
set -x / set +x            # 局部打开/关闭跟踪
shellcheck script.sh       # 静态检查（强烈建议，装：apt install shellcheck）
```

**超时保护**：对外部命令一律加 `timeout`——`timeout 30 curl -sL url -o f`（30 秒没完就杀；`-k 5` 表示超时后再宽限 5 秒才 SIGKILL）。

## 7. 脚本模板

```bash
#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat >&2 <<'EOF'
用法: deploy.sh <target> [--dry-run]
  target: staging | prod
EOF
    exit 1
}

log() { printf '[%s] %s\n' "$(date +%T)" "$*" >&2; }

# 参数校验
[ $# -ge 1 ] || usage
target="$1"
dry_run=false
[ "${2:-}" = "--dry-run" ] && dry_run=true

case "$target" in
    staging|prod) ;;
    *) log "未知 target: $target"; usage ;;
esac

log "开始部署到 $target（dry-run=$dry_run）"
if [ "$dry_run" = true ]; then
    log "只演练，不执行"
    exit 0
fi

# 用 trap 保证清理
lock=/tmp/deploy.lock
exec 9>"$lock" || exit 1
flock -n 9 || { log "已有部署在跑"; exit 1; }    # 防并发（flock）

log "部署完成"
```

## 8. 环境变量加载顺序

**登录 shell**（`ssh` 登录 / `bash -l` / `su -`）：`/etc/profile` → `~/.bash_profile`（没有则 `~/.bash_login`，再没有则 `~/.profile`）→ 如果这些里 source 了 `~/.bashrc`，则再读 `.bashrc`。**非登录交互 shell**（开个终端）：`/etc/bash.bashrc`（Debian/Ubuntu；RHEL 系是 `/etc/bashrc`）→ `~/.bashrc`。**非交互**（跑脚本）：基本都不读（除非 `BASH_ENV`）。

**实践**：

- 想"登录 + 交互式终端"生效，放 `~/.bashrc` 并让 profile 链引用——Ubuntu 默认 `~/.profile` 会 source `~/.bashrc`
- **脚本里别依赖 `.bashrc` 的环境变量**——非交互 shell 不读；在脚本里显式 `export`，或用配置文件/`BASH_ENV`
- 用 `env | grep VAR` / `type -a python` 确认"实际用的是哪个"

## 9. tmux（远程会话必备）

```bash
tmux new -s work          # 新建会话（名字 work）
tmux ls                   # 列出会话
tmux attach -t work       # 回到会话（断线重连就用这个）
tmux kill-session -t work
```

**默认前缀键是 `Ctrl+b`**，然后：

| 键        | 作用                                         |
|-----------|----------------------------------------------|
| `d`       | detach（会话继续在后台跑，断线也不影响）     |
| `c`       | 新建窗口；`n`/`p` 切换窗口；`0..9` 直接跳    |
| `%` / `"` | 左右 / 上下分屏                              |
| 方向键    | 在面板间切换；`z` 当前面板全屏               |
| `[`       | 进入滚动模式（方向键/PgUp 翻历史，`q` 退出） |

**典型用法**：ssh 上去 `tmux new -s train` → 跑训练 → `Ctrl+b d` 断开 → 断线/关机后 `tmux attach -t train` 接着看。

## 10. vim 最小集

服务器上通常只有 vi/vim。不用学全套，会改配置就够：

```bash
vim file            # 打开（不存在即新建）

# 三个模式：普通模式（默认）↔ 插入模式（i/a/o 进入）↔ 命令行模式（: 进入）

# 普通模式常用键
i / a / o           # 光标前 / 后 / 下一行插入；Esc 回普通模式
h j k l             # 左下上右（方向键也行）
0 / $               # 行首 / 行尾；gg / G 文件开头 / 结尾
dd / yy / p         # 删一行 / 复制一行 / 粘贴
u                   # 撤销（Ctrl+r 重做）
/word               # 搜索（n 下一个，N 上一个）

# 命令行模式（: 开头）
:w  :q  :wq  :q!    # 保存 / 退出 / 保存退出 / 强制放弃退出
:s/old/new/g        # 当前行替换
:%s/old/new/g       # 全文替换
```

**新手三坑**：忘了当前在哪个模式（按 `Esc` 回普通模式）；`Ctrl+S` 会"冻住"终端（`Ctrl+Q` 解）；`:q!` 会丢改动，想清楚再按。

## 11. 找帮助与历史

**忘参数了先查这三样**：

```bash
cmd --help           # 命令自带速查（先看这个；有的命令只支持 -h）
man rsync            # 完整手册（q 退出；/搜索；man 2/3 区分系统调用/库函数）
tldr rsync           # 只给常用例子（apt install tldr；比 man 快）
man -k 'copy file'   # 按关键词找手册（apropos）
```

**历史与补全（每天都能省时间）**：

```bash
Ctrl+R               # 反向搜索历史（再按继续往前翻，回车执行）
!!                   # 上一条命令；sudo !! 给上条命令补 sudo 最常用
!$                   # 上条命令的最后一个参数
history 20           # 最近 20 条
alias gs='git status'    # 别名（写进 ~/.bashrc 持久化；alias 查看已有）
```

## 12. 要点回顾

1.  **变量一律 `"$var"`**：不加引号会被分词/通配符展开；赋值等号两边不能有空格
2.  **单引号不展开、双引号展开**；`$(cmd)` 做命令替换，`$(( ))` 算算术
3.  **参数展开省事**：`${var:-默认}`、`${#var}`、`${p##*/}`/`${p%/*}`（basename/dirname）
4.  **判断用 `[[ ]]`**（正则/逻辑运算/不用分词）；文件判断 `-f/-d/-e/-x`
5.  **脚本开头 `set -euo pipefail`**，退出清理用 `trap ... EXIT`，并发用 `flock`
6.  **参数**：`$#` 个数、`"$@"` 全部（加引号）、`local` 局部变量；复杂脚本用 `getopts`，批量读文件用 `mapfile`，`source` 在当前 shell 执行配置
7.  **环境变量**：登录 shell 读 profile、交互读 bashrc；**脚本别依赖 bashrc**
8.  **tmux**：`new -s`/`attach -t`/`Ctrl+b d`——远程跑长任务的标准姿势
9.  **服务器改配置用 vim**：记住三个模式、`Esc` 退出插入、`:wq` 保存退出、`:q!` 放弃——够用
10. **写完跑 `shellcheck`**，出错用 `bash -x` 跟踪
11. **找帮助**：`--help` → `man` → `tldr`；`Ctrl+R` 搜历史、`!!`/`!$` 复用上条
12. **here-doc**：`<<'EOF'` 不展开、`<<EOF` 展开；`timeout` 给外部命令兜底
