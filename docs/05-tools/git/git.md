# Git 命令与原理

版本控制工具。核心是"三区模型"和"提交历史的管理"。

## 1. 三区模型

Git 有三个区域，理解它们是理解所有命令的基础：

```
工作区 ──(git add)──→ 暂存区 ──(git commit)──→ 版本库
反向：git restore（暂存区→工作区）、git restore --staged（版本库→暂存区）
```

| 区域 | 含义 |
|------|------|
| 工作区（Working Directory） | 你正在编辑的文件 |
| 暂存区（Staging / Index） | `git add` 后，"准备提交"的改动 |
| 版本库（Repository） | `git commit` 后，永久记录的历史 |

**提交流程**：工作区改文件 → `add` 到暂存区 → `commit` 到版本库。

## 2. 基础操作

首次使用先配置身份（写进 `~/.gitconfig`）：

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main   # 新仓库默认分支（可选）
git config --list --show-origin               # 看配置来自哪个文件
```

日常操作：

```bash
git init                       # 初始化仓库
git clone <url>                # 克隆远程仓库

git status                     # 看当前状态（哪些改了、哪些暂存了）
git add file.txt               # 把文件加入暂存区
git add .                      # 加入所有改动
git commit -m "message"        # 提交暂存区的内容

git log                        # 看提交历史
git log --oneline --graph      # 简洁 + 图形化（好用）
git diff                       # 看工作区 vs 暂存区的差异
git diff --staged              # 看暂存区 vs 版本库的差异
git blame file.txt             # 看每行是谁、哪次提交改的（排查用）
```

### .gitignore

让 Git 不跟踪某些文件（如编译产物、IDE 配置、密钥）：

```gitignore
# .gitignore
# 忽略 build 目录
build/
# 忽略所有 .o 文件
*.o
# 忽略虚拟环境
.venv/
# 例外：不忽略这个
!important.o
```

> `.gitignore` 不支持行内注释：`#` 只有在行首才是注释。

**注意**：已被跟踪的文件，加 `.gitignore` 不会生效，要先 `git rm --cached file`。

## 3. 分支与合并

```bash
git branch                     # 查看分支
git branch dev                 # 创建分支
git switch dev                 # 切换分支（新命令）
git checkout dev               # 切换分支（老命令，也能用）
git switch -c dev              # 创建并切换

git merge dev                  # 把 dev 合并到当前分支
git branch -d dev              # 删除已合并分支
git branch -D dev              # 强制删除未合并分支（确认不要）
```

### merge vs rebase

两种"合并"方式：

```bash
# merge：有分叉时保留分叉（多出一个 merge commit M）
# 无分叉时默认 fast-forward；想强制留 merge commit 用 --no-ff
#   A---B---C-------M (main)
#        \         /
#         D---E---  (dev)

# rebase：把 dev 的提交搬到 main 最新处，变成直线（改历史）
git switch dev
git rebase main                # dev 的基点移到 main 最新
#   A---B---C---D'---E' (dev 变直线，提交被重写)
```

| | merge | rebase |
|--|-------|--------|
| 历史 | 保留分叉 + merge commit | **直线**（干净） |
| 是否改历史 | 否 | **是**（重写提交） |
| 风险 | 低 | 高（别对已推送的公共分支 rebase） |

**规则**：**公共分支用 merge，个人分支用 rebase**（整理自己的提交）。

**rebase 后怎么推**：分两种情况——

- **分支推送过**：rebase 重写历史后，本地与远端**分叉**（远端还留着被重写的旧提交），普通 `push` 会被拒绝，只能强推（**仅限你自己的分支**）：
  ```bash
  git push --force-with-lease
  ```

- **分支从未推送过**：普通 `push` 即可，不需要强推。

> 通用判据：本地和远端**都有对方没有的提交**（ahead > 0 且 behind > 0）才是分叉，才需要强推；只有 behind > 0 说明远端更新，先 `pull`；只有 ahead > 0 普通 `push` 即可（`git status` 会显示 ahead/behind）。

⚠️ **强推是危险操作**：

- `--force-with-lease` 比 `--force` 安全（远程有别人新提交时**会失败**，不盲目覆盖），但它**依然是强推**，会重写远程历史
- **公共/共享分支绝不要强推**（要用 revert）
- 坑：强推前若先 `git fetch`，远程跟踪分支被更新，lease 的保护就失效了

### 冲突解决

```bash
# 冲突时，文件里出现：
<<<<<<< HEAD
你的版本
=======
别人的版本
>>>>>>> other

# 手动编辑选一个（或合并），然后：
git add 冲突文件
git commit        # 或 git merge --continue

# 不想解决了，放弃本次合并：
git merge --abort
# （若是 rebase 冲突：git rebase --continue / --abort）
```

## 4. 撤销与回退

### reset

```bash
git reset --soft HEAD~1     # 只回退 commit（改动留在暂存区）
git reset --mixed HEAD~1    # 回退 commit + 暂存区（改动留在工作区，默认）
git reset --hard HEAD~1     # 全回退（工作区改动也丢，危险！）
```

### revert

```bash
git revert <commit>         # 创建一个"反向提交"来抵消某次提交
```

| | reset | revert |
|--|-------|--------|
| 做法 | 移动 HEAD，**删历史** | **新增**一个反向提交 |
| 历史 | 被改写 | 保留（多一个提交） |
| 适用 | 本地未推送 | **已推送的公共分支** |

**记忆**：reset 是"时光倒流"（改历史），revert 是"改正错误"（加新提交）——**公共分支必须用 revert**。

### restore

```bash
git restore file.txt            # 丢弃工作区改动（恢复成暂存区版本）
git restore --staged file.txt   # 把文件从暂存区移出（撤销 add）
```

### clean

```bash
git clean -nd        # 先预览：会删哪些未跟踪文件/目录
git clean -fd        # 真删（未跟踪文件 + 目录）
git clean -fdx       # 连 .gitignore 里的也删（危险）
```

> `clean` 不可恢复；先 `-n` 看一遍。

### checkout 的多用途

```bash
git checkout dev                # 切分支
git checkout -- file.txt        # 丢弃工作区改动（老写法）
git checkout <commit> -- file    # 从某次提交取文件
```

## 5. 远程协作

```bash
git remote -v                  # 查看远程仓库
git remote add origin <url>    # 添加远程

git fetch origin               # 下载远程更新（不改本地）
git fetch --prune origin       # 顺便清掉远端已删除的分支引用
git pull                       # fetch + merge（下载并合并）
git push origin main           # 推送到远程
git push -u origin main        # 首次推送并设置上游
```

### fetch vs pull

```bash
# fetch：只下载远程更新到本地"远程分支"，不动你的工作区
# pull：= fetch + merge（下载后直接合并到当前分支）
```

**为什么有时推荐 fetch**：先看看远程变了啥（`git log origin/main`），再决定是否 merge。

## 6. stash

**场景**：改了一半，要临时切分支处理急事，但不想提交：

```bash
git stash                      # 把当前改动存起来，工作区变干净
git stash -u                   # 连未跟踪文件一起存（新文件不会丢）
git stash list                 # 看 stash 列表
git stash pop                  # 恢复最近的 stash（并从列表删除）
git stash apply                # 恢复但保留在列表
git stash drop                 # 删除某个 stash
```

## 7. 提交整理

### amend

```bash
git commit --amend             # 修改最后一次提交（消息或内容）
# 场景：刚提交发现漏了文件/消息写错
```

### rebase -i

```bash
git rebase -i HEAD~3           # 整理最近 3 个提交
# 弹出编辑器，可：pick（保留）/ squash（合并）/ reword（改消息）/ drop（删除）
```

**用途**：把一堆零碎提交（"fix"、"typo"）合并成一个干净的提交，再推送。

### cherry-pick

```bash
git cherry-pick <commit>       # 把某个提交"摘"到当前分支
# 场景：只想把 dev 上的某次修复拿到 main，不要其他提交
```

## 8. 底层与进阶

### HEAD 与 detached HEAD

```bash
# HEAD：指向当前所在的分支（或某个提交）
# 正常：HEAD → main → 最新提交
# detached HEAD：HEAD 直接指向某个提交（不在任何分支上）

git checkout <commit>          # 进入 detached HEAD（切到历史提交）
# ⚠️ 此时提交的改动不属于任何分支，切走会丢（用 branch 保存）
```

### reflog

**记录 HEAD 的所有移动历史**，能找回"丢失"的提交：

```bash
git reflog                     # 看 HEAD 移动记录
# 误删分支 / reset --hard 后想找回：
git reset --hard <reflog里的commit>
```

**场景**：`git reset --hard` 误删了提交、误删了分支——reflog 能救回来（本地操作，一般保留 90 天）。

### 对象模型

Git 底层是内容寻址的键值存储：

```
blob   → 文件内容
tree   → 目录结构（指向 blob 和其他 tree）
commit → 一次提交（指向一个 tree + 父提交 + 作者/消息）
```

**含义**：Git 存的是"快照"不是"差异"，每个 commit 是一棵完整的 tree。

### 按内容找提交：log -S

```bash
git log -S "Foo::bar" --oneline        # 某段代码何时加入/删除
git log -G "regex" --oneline           # diff 内容匹配正则
git log -S "TODO" -- src/              # 限定路径
```

`-S` 看字符串出现次数变化；`-G` 看 diff 是否匹配正则。

### worktree

同一个仓库，**同时检出多个工作目录**——不用 stash 就能并行干活：

```bash
git worktree add ../hotfix main      # 把 main 检出到 ../hotfix
git worktree add -b feat ../feat     # 新建分支并检出
git worktree add ../old v0.2         # 标签/提交也能开（自动落 detached）
git worktree list                    # 列出所有工作树
git worktree remove ../hotfix        # 删除（有未跟踪文件要 --force）
```

**场景**：改到一半要紧急修 bug → 开个 worktree 去修，**当前工作一点不动**（比 stash 来回切舒服）；也可以按标签/提交开一份，**复现历史版本、新旧两版同时构建对比**。

**对比**：`git clone` 第二份会复制整个仓库；worktree **共享同一个 `.git`**（对象、分支互通），只多一个工作区。

**注意**：

- 同一分支不能在两个 worktree 同时检出——用分支开会失败，改用提交名即可（自动 detached）
- 新检出里没有被 `.gitignore` 的文件（依赖、构建产物等），要构建得自己补
- 手动 `rm -rf` 掉目录后注册信息还在：`git worktree list` 会把它标成 `prunable`，`git worktree prune` 清掉

## 9. 标签（Tag）

给某个提交起一个**不会移动的版本名**——分支随提交前进，标签永远指着同一处。用途：标记发布点（v1.0、v2.0）。

```bash
git tag v1.0                   # 轻量标签：只是个指向提交的引用
git tag -a v1.0 -m "release"   # 附注标签：带作者、日期、消息（可签名）
git tag                        # 列出全部标签
git show v1.0                  # 附注标签会先显示标签自身的信息，再是提交
```

**推送**：`git push` 默认**不推标签**——标签是独立于分支的引用，要显式推：

```bash
git push origin v1.0           # 只推这一个标签
git push origin --tags         # 推本地全部标签；同名同提交跳过，同名不同提交会被拒绝
git push origin main --tags    # 分支 + 全部标签一起推
git push --follow-tags         # 发版推荐：分支 + 本次可达的附注标签（轻量标签不跟）
```

> 同名标签指向不同提交时，`--tags` 会报 `already exists`；确认覆盖再 `--force`，或先删远端标签。

**为什么默认不推**：标签独立于分支，本地可能有实验性标记不想公开——要是推分支时连带全推，一次手滑就把它们全公开了。所以 git 让你显式决定。

**删除**：

```bash
git tag -d v1.0                # 本地
git push origin --delete v1.0  # 远端
```

**细节**：`git ls-remote --tags origin` 里附注标签会出现两条——`v1.0`（标签对象本身）和 `v1.0^{}`（"剥壳"后指向的提交）；轻量标签只有一条。发布用附注（带元信息；`--follow-tags` 也只认它），临时标记用轻量即可。

## 10. 工作流

**工作流** = 团队约定的"分支怎么建、代码怎么合、版本怎么发"的规范。

### Git Flow

```
main      ──●──────────────●──────（只放发布版本）
             \            /
develop   ────●──●──●──●──●──●────（开发主线）
               \    /       \
feature         ●──●         （功能分支）
```

分支多：`main` + `develop` + `feature/*` + `release/*` + `hotfix/*`。适合有明确发布周期的传统项目，**偏重**。

### GitHub Flow

```
main      ──●────●────●────●──（永远可发布）
             \  /    \  /
feature       ●●      ●●     （功能分支 → PR → 合并）
```

流程：从 main 拉分支 → 开发 → 提 PR → 审查 → 合并 → 部署。只有 `main` + 功能分支，适合**持续部署**的互联网项目。

### Trunk-Based

所有人往 `main`（主干）提交，分支生命周期极短，靠自动化测试 + 特性开关保证质量。

### 对比

| | Git Flow | GitHub Flow | Trunk-Based |
|--|----------|-------------|-------------|
| 分支数 | 多 | 少 | 极少 |
| 复杂度 | 高 | 低 | 低 |
| 发布 | 周期发布 | 持续部署 | 持续部署 |
| 适合 | 传统软件 | 互联网 | 成熟团队 |

**选择**：传统发布周期用 Git Flow；持续集成/持续部署用 GitHub Flow；测试和自动化成熟的团队可以上 Trunk-Based。

## 11. 要点回顾

1. **三区模型**：工作区 → 暂存区 → 版本库
2. **reset vs revert**：reset 改历史（本地）、revert 加反向提交（公共分支）
3. **merge vs rebase**：保留分叉 vs 变直线（rebase 改历史）
4. **fetch vs pull**：pull = fetch + merge
5. **detached HEAD**：HEAD 直接指向提交，提交会丢
6. **reflog**：找回误删提交的救命技能
7. **rebase -i**：整理提交（合并零碎提交）
8. **标签**：独立于分支，`git push` 默认不推；`--tags` 全推、`--follow-tags` 只带附注标签
9. **常用补充**：`git config` 首次配置；`log -S` 按内容找提交；`clean -nd` 先预览；`stash -u` 带未跟踪文件
10. **强推**：只在 ahead > 0 且 behind > 0 的分叉场景；公共分支用 revert
