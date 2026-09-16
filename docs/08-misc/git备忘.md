# Git 备忘

## 常用命令

```bash
git branch                     # 查看分支
git branch xxx                 # 创建分支
git switch xxx                 # 切换分支
git switch -c xxx              # 创建并切换分支
git switch -c xxx origin/main  # 从远程 main 创建分支

git merge xxx                  # 将 xxx 合并到当前分支
git pull                       # 拉取当前分支对应的远程分支
git pull --rebase origin main  # 个人分支拉取最新 main（变基）

git branch -d xxx              # 删除分支
git branch -D xxx              # 强制删除分支
git push origin --delete xxx   # 删除远程分支
```

## VSCode 图形化操作

- 暂存更改
- 提交
- 拉取、推送
- 创建分支、切换分支、合并分支、变基到
- 查 diff
- 解决冲突
- **GitLens** 插件：blame 功能
