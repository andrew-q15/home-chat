# home-chat 交接文档（HANDOFF）

> 新对话开始，把这份文件发给 AI，并说一句：
> **「读 HANDOFF.md，你继续当 CEO，我是老板。」**
> AI 读完立刻知道公司是什么、有什么、下一步该干嘛。

---

## 0. 公司一句话
**一个 11 岁老板自建的家庭/同学聊天服务器**，带双 AI、橘子虚拟货币、各种游戏与协作工具。
**不是商业公司，不收线上钱。** 汇率口头定：**1000 🍊 = 1 元**。

---

## 1. 角色
- **老板**：11 岁，定方向、拍板、跑命令。重好玩。
- **CEO（AI）**：出战略、给命令、检查结果。叫老板"老板"。
- **员工**：这台 Mac 上的 6 个 pm2 进程。

---

## 2. 最新技术栈（重构后）
- Node.js v24（`node --check` 只认 `.js`）
- Express 5 + Socket.IO 4
- pm2 管进程（`pm2 delete chat && pm2 start server.js --name chat`）
- 双 AI：AI-1 本机 `localhost:1234`，AI-2 局域网 `192.168.1.254:1235` (`prism-ml/bonsai-27b`)
- HTTPS 代理 :8443（mkcert）
- **外网访问**：Tailscale（IP `100.87.149.87`，域名 `jianmings-mac-mini.tail6418df.ts.net`）。已关闭自动批准，必须用邮箱邀请。

---

## 3. 核心架构（高能预警！）
**`server.js` 已经彻底重构，从 4097 行瘦身到约 2500 行。**
新功能**绝对不要直接改 `server.js`**，必须写成独立模块，然后挂载到 `center.js`。
目前 `server.js` 里只剩：主聊天、上传核心、AI链式对话、命令处理、主 Socket 循环。

### 已切出的独立模块（挂载于 center.js）
- `legacy-features-router.js`（图文/三角洲/捞鱼/急救/橘语）
- `sticker-router.js`（贴纸）
- `list-router.js`（清单）
- `upload-router.js`（上传/改名/头像/视觉）
- `board-router.js`（白板）
- `poll-router.js`（投票/红包/打赏）
- `writings-router.js`（小说投币）
- `admin-router.js`（超管接口）
- `hub-router.js`（万能数据站）
- `intel-router.js`（家庭情报局）
- `quiz-router.js`（每日一题）
- `lottery-game-router.js`（赛博彩票，每天21:00开奖，有保底）
- `wish-router.js`（许愿池）
- `koi-router.js`（今日锦鲤）
- `fortune-router.js`（每日运势）
- `drop-router.js`（天降橘子雨）
- `achievement-router.js`（成就系统，五级机制）
- `sonar-router.js`（模拟声纳后端）
- `poke-router.js`（戳一戳）
- `wall-router.js`（留言墙）
- `bottle-router.js`（漂流瓶）
- `calendar-router.js`（共享日历）
- `group-router.js`（抽签分组）
- `stock-router.js`（赛博股市）

---

## 4. 最新功能进度（2026-10-31）
- **重构完毕**：主服务瘦身一半，全站 200+ 接口全绿。
- **声纳重构**：双屏显示（左侧波前扩散，右侧放大监控），反弹上限 200。
- **外网打通**：Tailscale 配置成功，同学通过邮箱邀请进入。
- **近期新增**：每日一题、彩票、锦鲤、运势、留言墙、漂流瓶、戳一戳、日历、抽签。

---

## 5. 纪律（每次改代码必须遵守）
1. **改前备份**：`cp 文件名 文件名.bak-用途-时间`
2. **语法检查**：`node --check 文件名`
3. **改完重启+体检**：`pm2 delete chat && pm2 start server.js --name chat`；`curl -X POST .../api/verify` 必须 200。
4. **不要直接改 `server.js`**，新功能写 `xxx-router.js` 挂 `center.js`。
5. **只给一键执行命令**：不要手把手教改代码，给 `cat << EOF` 或 `python3 - << PY`。

---

## 6. 待办清单（后续 CEO 从这里继续）
- [x] 锦鲤、运势、留言墙、漂流瓶、戳一戳、日历、抽签分组
- [ ] 积分商城、赛博作业提醒、签到表情包、答题闯关
- [x] 赛博电台（PTT / WebRTC 信令版已上线：radio-router.js + radio.html）
- [ ] 赛博电台调频调幅、表情包合成器、聊天记录导出 PDF
- [ ] 打地鼠、藏宝图、菜谱翻牌、段位赛、宠物对战、暗号接龙、任务链
- [x] 老板数据大屏（ECharts）：stats-router.js + public/dashboard.html，30s 刷新
- [x] 补记：零食展示柜（snacks）、中央金库/贷款/菜园/拍卖/股市/夜间 AI 调度均已上线，勿重复造轮子

- [2026-10-31 14:46] 测试-144603

## 2026-10-31 14:50 老板数据大屏上线
- 新增 stats-router.js（只读 /api/stats/dashboard）
- 新增 public/dashboard.html（深色赛博风 + ECharts + 30s 刷新）
- index.html 侧栏「🛠 实用工具」加「📊 数据大屏」按钮
- 备份：center.js.bak-dashboard-* / public/index.html.bak-dashboard-*

## 2026-10-31 15:28 编程组员工 A 六张任务卡
- quiz-router.js：每日一题 5 天去重（最近 5 个不同日期的全部题面排除）
- quiz-compensate.js：一次性补偿脚本（组长已清，可删）
- wall-router.js + wall.html：留言墙撤回（本人/超管），GET 返回 me，前端有权限才显示删除按钮
- index.html：侧栏按「游戏大厅 9 / 实用工具 31 / 橘子经济 4 / 超级管理 2」重排，数据大屏进超级管理，跳蚤市场原位不动，writing-btn 去重
- stats-router.js + dashboard.html：后端平铺返回（兼容 stats/focus 嵌套），前端字段路径对齐，四卡三焦点卡数据全通
- market.html：删除 load() 里 myName = null 置空行，卖家能看到「下架」按钮

- [2026-11-02 21:56] 交接文档补公司信息：Orange Network、OMZL、QD
