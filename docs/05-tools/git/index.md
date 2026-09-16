# Git

分布式版本控制系统。核心是**三区模型**，日常是**管理提交历史**。

## 核心一句话

```
工作区 ──(git add)──→ 暂存区 ──(git commit)──→ 版本库
```

出错别慌：`git reflog` 能找回误删的提交。

## 篇目

| 篇目 | 内容 |
|------|------|
| [命令与原理](git.md) | 三区模型、分支/合并、撤销回退、rebase、reflog、工作流、面试考点 |

## 最常用 6 条

```bash
git status                  # 看状态
git add <file>              # 暂存
git commit -m "msg"         # 提交
git switch -c feature       # 建分支并切换
git pull --rebase           # 拉取（变基）
git log --oneline --graph   # 看历史
```
