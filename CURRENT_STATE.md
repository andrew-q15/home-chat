# 🍊 橘域网最新状态快照 (给下一位 AI 的备忘录)
生成时间: Mon Nov  2 21:56:19 CST 2026

## 1. 基础架构
- 后端: Node.js + Express + Socket.io
- 数据库: data.json, lobster.json, posts.json, writings.json

## 2. 当前运行状态
```text
│ 15 │ chat             │ default     │ 1.0.0   │ fork    │ 79476    │ 21m    │ 0    │ online    │ 0%       │ 214.1mb  │ jianmin… │ disabled │
│ 2  │ https-proxy      │ default     │ 1.0.0   │ fork    │ 1095     │ 25h    │ 0    │ online    │ 0%       │ 52.2mb   │ jianmin… │ disabled │
│ 1  │ report           │ default     │ 1.0.0   │ fork    │ 1093     │ 25h    │ 0    │ online    │ 0%       │ 68.8mb   │ jianmin… │ disabled │
│ 5  │ watchdog         │ default     │ 1.0.0   │ fork    │ 1097     │ 25h    │ 0    │ online    │ 0%       │ 58.5mb   │ jianmin… │ disabled │
```

## 3. 核心 API 校验
- /api/verify: 200
- /api/posts: 200

## 4. 前端页面清单
achievements.html
admin.html
auction.html
auto-map.html
board.html
bottle.html
brightness.html
calc.html
calendar.html
dashboard.html
delta-intel.html
doctor.html
drop.html
english-intel.html
fishing.html
foodmarket.html
fortune.html
fps.html
garden.html
group.html
guide.html
hiking.html
hotpot.html
index.html
intel.html
join.html
kitchen.html
koi.html
ledger.html
loan.html
lobster.html
lottery-game.html
lottery.html
map.html
market.html
novels.html
profile.html
quiz.html
snake.html
sonar.html
square.html
stickman.html
stock.html
treasury.html
vault.html
vision.html
wall.html
wish.html
writing.html
zodiac.html

## 5. 日志记录的近期重大更新

## 2026-10-31 15:28 编程组员工 A 六张任务卡
- quiz-router.js：每日一题 5 天去重（最近 5 个不同日期的全部题面排除）
- quiz-compensate.js：一次性补偿脚本（组长已清，可删）
- wall-router.js + wall.html：留言墙撤回（本人/超管），GET 返回 me，前端有权限才显示删除按钮
- index.html：侧栏按「游戏大厅 9 / 实用工具 31 / 橘子经济 4 / 超级管理 2」重排，数据大屏进超级管理，跳蚤市场原位不动，writing-btn 去重
- stats-router.js + dashboard.html：后端平铺返回（兼容 stats/focus 嵌套），前端字段路径对齐，四卡三焦点卡数据全通
- market.html：删除 load() 里 myName = null 置空行，卖家能看到「下架」按钮

- [2026-11-02 21:56] 交接文档补公司信息：Orange Network、OMZL、QD
