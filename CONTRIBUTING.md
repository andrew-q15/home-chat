# 贡献指南（CONTRIBUTING）

> 面向橘域网的新员工，照这份做，不踩坑。

## 1. 仓库纪律（硬约束）

- **不碰 `server.js` 核心逻辑**。新功能写 `xxx-router.js`，挂到 `center.js`。
- **不删数据文件**：`data.json`、`lobster.json`、`intel.json` 等活数据只读不删。
- **不 `rm -rf` 任何目录**。要清理先备份、先问老板。
- **不改 `.gitignore` 把敏感文件放进仓库**：`certs/`、`backups/`、`node_modules/`、`public/uploads/` 等永远排除。
- **改前备份**：`cp 文件名 "文件名.bak-<用途>-$(date +%Y%m%d-%H%M%S)"`。
- **改后语法检查**：JS 用 `node --check`，HTML 内嵌脚本用 Node 临时文件法 `node --check`。
- **改完重启 + 体检**：`pm2 delete chat && pm2 start server.js --name chat`，`curl -X POST http://127.0.0.1:3000/api/verify` 必须 200。

## 2. 分支策略

每张任务卡一个分支，命名 `task/<卡名>`：

```bash
git checkout -b task/xxx main
# 改代码
git add <相关文件>          # 不用 git add .，避免误提交 data.json
git commit -m "[员工A] 卡 N xxx"
git checkout main
git merge task/xxx --no-ff -m "merge: 卡 N xxx"
```

- **不用 `git add .`**：工作区有 `data.json`、`lobster.json` 等活数据，`git add .` 会误提交（虽然 `.gitignore` 排除了，但保险起见逐文件 `git add`）。
- **`--no-ff` 必加**：保留分支痕迹，历史可追溯。
- **合并后清分支**：`git branch -d task/xxx`（可选）。

## 3. 提交信息规范

```
[员工X] 卡 N：一句话说明

- 改了什么文件
- 验收怎么过的
```

例：

```
[员工A] 卡 3：留言墙撤回

- wall-router.js 加 DELETE /api/wall/:id，发布者或超管可删
- public/wall.html 加删除按钮 + 监听 wall_deleted
- 验收：本人 200 / 他人 403 / 超管 200
```

## 4. 验收流程

每张卡必须过：

1. **语法**：`node --check` 通过；HTML 内嵌脚本用 Node 临时文件法 `node --check`。
2. **安全体检**：`node security-check.js` 全绿（未登录拒绝 / 密钥 / 原子写 / 橘语沙箱）。
3. **重启 + 体检**：`bash restart-chat.sh`（幂等：在就 restart、不在才 start，末尾自动 `pm2 save`），`verify 200`。
   **禁止 `pm2 delete chat`**：delete→start 之间会制造进程空窗，watchdog 的 `pm2 restart chat` 会报 `chat not found` 且自愈失效；若 delete 后 start 失败，chat 会长期缺席，8443 代理持续报空错误。
4. **接口验收**：`curl` 或浏览器实测，贴输出。
5. **回归**：相关页面打开不白屏，按钮可点。
6. **报组长**：commit 号 + 验收输出，组长对账后才结案。

## 5. 禁区

- 不动 `server.js` 核心逻辑（主聊天、上传、AI 链式对话、命令处理、主 Socket 循环）。
- 不删数据文件。
- 不 `rm -rf` 任何目录。
- 不改 `.gitignore` 放敏感文件进仓库。
- 不在对话里贴 token / 密码 / 证书私钥。

## 6. 目录速查

| 路径 | 内容 |
|---|---|
| `server.js` | 主服务（**禁区**） |
| `center.js` | 中央挂载器，新 router 挂这里 |
| `*-router.js` | 各功能模块 |
| `public/*.html` | 前端页面 |
| `public/uploads/` 等 | 生成目录，不入库 |
| `certs/`、`backups/` | 敏感，不入库 |
| `data.json`、`lobster.json` 等 | 活数据，不入库 |

## 7. 交接

每次改动后更新 `CHANGELOG.md` 和 `HANDOFF.md`，写清日期、卡号、文件、验收结果。
