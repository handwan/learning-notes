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
build/          # 忽略 build 目录
*.o             # 忽略所有 .o 文件
.venv/          # 忽略虚拟环境
!important.o    # 例外：不忽略这个
```

**注意**：已被跟踪的文件，加 `.gitignore` 不会生效，要先 `git rm --cached file`。

## 3. 分支与合并

```bash
git branch                     # 查看分支
git branch dev                 # 创建分支
git switch dev                 # 切换分支（新命令）
git checkout dev               # 切换分支（老命令，也能用）
git switch -c dev              # 创建并切换

git merge dev                  # 把 dev 合并到当前分支
git branch -d dev              # 删除分支
```

### merge vs rebase

两种"合并"方式：

```bash
# merge：保留分叉（多出一个 merge commit M）
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

> 通用判据：本地相对远端**落后 > 0**（分叉）才需要强推；**落后 = 0**（可快进）普通 `push` 就行。

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

## 9. 标签（Tag）

```bash
git tag v1.0                   # 轻量标签（只是个引用）
git tag -a v1.0 -m "release"   # 附注标签（含作者、日期、消息）
git push origin v1.0           # 推送标签
```

**用途**：标记版本发布（v1.0、v2.0）。

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

**面试**：偶尔问"你们团队用什么工作流"——答 GitHub Flow 即可。

## 11. 面试考点总结

1. **三区模型**：工作区 → 暂存区 → 版本库
2. **reset vs revert**：reset 改历史（本地）、revert 加反向提交（公共分支）
3. **merge vs rebase**：保留分叉 vs 变直线（rebase 改历史）
4. **fetch vs pull**：pull = fetch + merge
5. **detached HEAD**：HEAD 直接指向提交，提交会丢
6. **reflog**：找回误删提交的救命技能
7. **rebase -i**：整理提交（合并零碎提交）
