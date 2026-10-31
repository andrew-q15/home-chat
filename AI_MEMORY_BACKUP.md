【橘域网 CEO 唤醒指令】
新接手的 AI 请立刻阅读以下内容。当前老板刚刚手动更新了 server.js。
请直接对老板说：'我回来了。'
（不需要输出多余分析，直接说这一句，然后等待老板下达新指令）

========================= 历史交接文档 =========================
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
- [ ] 赛博电台（调频调幅）、表情包合成器、聊天记录导出 PDF
- [ ] 打地鼠、藏宝图、菜谱翻牌、段位赛、宠物对战、暗号接龙、任务链
- [ ] 老板数据大屏（ECharts）

========================= 最新系统状态 =========================
# 🍊 橘域网最新状态快照 (给下一位 AI 的备忘录)
生成时间: Sat Oct 31 14:28:00 CST 2026

## 1. 基础架构
- 后端: Node.js + Express + Socket.io
- 数据库: data.json, lobster.json, posts.json, writings.json

## 2. 当前运行状态
```text
│ 155 │ chat             │ default     │ 1.0.0   │ fork    │ 97445    │ 82s    │ 0    │ online    │ 0%       │ 211.0mb  │ jianmin… │ disabled │
│ 3   │ https-proxy      │ default     │ 1.0.0   │ fork    │ 1566     │ 7D     │ 0    │ online    │ 0%       │ 28.2mb   │ jianmin… │ disabled │
│ 2   │ report           │ default     │ 1.0.0   │ fork    │ 41330    │ 4D     │ 32   │ online    │ 0%       │ 38.6mb   │ jianmin… │ disabled │
│ 6   │ watchdog         │ default     │ 1.0.0   │ fork    │ 1569     │ 7D     │ 0    │ online    │ 0%       │ 33.3mb   │ jianmin… │ disabled │
```

## 3. 核心 API 校验
- /api/verify: 200
- /api/posts: 200

## 4. 前端页面清单
achievements.html
admin.html
auto-map.html
board.html
bottle.html
brightness.html
calc.html
calendar.html
delta-intel.html
doctor.html
drop.html
english-intel.html
fishing.html
foodmarket.html
fortune.html
fps.html
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
vault.html
vision.html
wall.html
wish.html
writing.html
zodiac.html

## 5. 日志记录的近期重大更新
5. **只给一键执行命令**：不要手把手教改代码，给 `cat << EOF` 或 `python3 - << PY`。

---

## 6. 待办清单（后续 CEO 从这里继续）
- [x] 锦鲤、运势、留言墙、漂流瓶、戳一戳、日历、抽签分组
- [ ] 积分商城、赛博作业提醒、签到表情包、答题闯关
- [ ] 赛博电台（调频调幅）、表情包合成器、聊天记录导出 PDF
- [ ] 打地鼠、藏宝图、菜谱翻牌、段位赛、宠物对战、暗号接龙、任务链
- [ ] 老板数据大屏（ECharts）

========================= 核心代码结构提取 =========================
491:app.post('/api/register', (req, res) => {
519:app.post('/api/login', (req, res) => {
555:app.post('/api/tailscale-login', (req, res) => {
593:app.post('/api/forgot-password', (req, res) => {
608:app.post('/api/verify', (req, res) => {
629:app.post('/api/device/say', (req, res) => {
640:app.get('/api/device/channels', (req, res) => {
647:app.get('/api/history', (req, res) => {
664:app.get('/api/search', (req, res) => {
685:app.get('/api/device/latest', (req, res) => {
696:app.get('/api/ts/status', (req, res) => {
701:app.get('/api/ts/join-key', (req, res) => {
734:app.post('/api/story', async (req, res) => {
771:app.get('/api/market', (req, res) => {
785:app.post('/api/market', (req, res) => {
812:app.delete('/api/market/:id', (req, res) => {
827:app.post('/api/market/:id/buy', (req, res) => {
877:app.post('/api/market/tip', (req, res) => {
906:app.get('/api/market/tip-info', (req, res) => {
918:app.post('/api/food/cook', async (req, res) => {
989:app.get('/api/food/recipes', (req, res) => {
996:app.get('/api/food/channels', (req, res) => {
1004:app.post('/api/food/share', (req, res) => {
1026:app.get('/api/food/inventory', (req, res) => {
1046:app.post('/api/food/sell', (req, res) => {
1098:app.post('/api/food/eat-lobster', (req, res) => {
1231:app.get('/api/lottery/info', (req, res) => {
1249:app.post('/api/lottery/draw', (req, res) => {
1304:app.post('/api/food/loot', (req, res) => {
1374:app.post('/api/hotpot/grab', (req, res) => {
1762:app.get('/api/intel/en', (req, res) => {
1766:app.post('/api/intel/en', (req, res) => {
2318:app.post('/api/intel/join', (req, res) => {
2338:app.post('/api/intel/leave', (req, res) => {
2351:app.get('/api/intel/status', (req, res) => {
2426:app.post('/api/intel/settle-test', (req, res) => {
1452:  socket.on('block_user', ({ target }) => {
1461:  socket.on('unblock_user', ({ target }) => {
1473:  socket.on('open_dm', ({ target }) => {
1496:  socket.on('join', ({ channel }) => {
1517:  socket.on('message', async (text, opts) => {
1560:  socket.on('toggle_reaction', ({ messageId, emoji }) => {
1581:  socket.on('delete_message', ({ messageId }) => {
1605:  socket.on('audio_message', ({ url, duration }) => {
1617:  socket.on('image_message', ({ url }) => {
1628:  socket.on('file_message', ({ url, fileName, fileSize }) => {
1639:  socket.on('location_message', ({ lat, lng, place }) => {
1651:  socket.on('dice_message', ({ sides, result }) => {
1667:  socket.on('create_channel', (rawName) => {
1678:  socket.on('delete_channel', (nm) => {
1703:  socket.on('disconnect', () => {
