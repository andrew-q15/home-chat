# 变更记录

## 2026-10-31 之前（首次 commit 7e855a9 收录）

- [员工A] 卡 1：每日一题去重（quiz-router.js，newQuiz 过滤最近 5 个不同日期出过的全部题面，池空回退全池；验证 10 次连抽重复数 0）
- [员工A] 卡 2：每日一题补偿（quiz-compensate.js，跨天重复出题日给答对者补 100🍊/天，按日期去重、无 winner 跳过；组长已清，脚本保留待定）
- [员工A] 卡 3：留言墙撤回（wall-router.js + public/wall.html，DELETE /api/wall/:id，发布者本人或超管可删，io.emit('wall_deleted') 广播，前端有权限才显示删除按钮并监听刷新；验收 403/200/200）
- [员工A] 卡 4：侧栏分类调整（public/index.html，游戏大厅留 9 个游戏按钮，其余挪实用工具，数据大屏挪超级管理，跳蚤市场原位不动，writing-btn 去重；68 个 -btn 零重复，164 个静态 id 零重复）
- [员工A] 卡 5：修 dashboard.html 字段路径（stats-router.js 改平铺返回并兼容 stats/focus 嵌套，dashboard.html 的 d.stats.xxx → d.xxx、d.focus.xxx → d.xxx；验收四卡三焦点卡数据全通）
- [员工A] 卡 6：修 market.html myName 被置 null（删除 load() 里 myName = null 置空行，卖家能看到「下架」按钮）

## 2026-10-31 之后

- [员工A] 卡 0：初始化 git 仓库（211 → 116 文件，数据文件/证书/依赖/备份/生成目录全排除）
- [员工A] 卡 0 修复：排除误入的 .git.old 旧仓库目录
- [员工A] 卡 0 清理：排除非标准备份残留（*.bak/*.bak2/*.new/*.KNOWN-GOOD-*/*.broken-*）和 public/downloads/ 安装包
- [员工A] 卡 0.7：补记卡 1–6 完成记录（本文件）


## 2026-11-11 CEO 体检补丁（一次性）

- center.js：零食展示柜挂载补 try/catch，消除单点失败导致全站模块不挂
- intel-router.js：INTEL_VALID_SCORE 5 → 4，与 guide.html 公示的「AI > 3 有效」对齐
- auction-router.js：成交结算改为「先扣金库、成功再给卖家入账」，杜绝超发
- bottle-router.js：扔瓶记录 throwerId，捞瓶过滤自己扔的（兼容无字段旧瓶）
- 前端转义：profile / vault / novels / group / invite.js 补 esc 并移除 onclick 字符串拼接；新增 public/esc.js 全域工具并注入各页
- 文档：CONTRIBUTING 验收流程加入 security-check.js；HANDOFF 待办打勾数据大屏/电台并补记已上线模块
- 新增工具：audit-treasury.js（只读对账）、fix-lottery-round20.js（第20期检测，干跑）、cleanup-testdata.js（测试数据，默认干跑不执行）
- 按老板指令：夜间 AI 整块略过，night-ai.json 与 night-ai.html 均未改动

## 2026-11-11 收尾：橘语解释器修复 + 彩票第 20 期平反

- orange-lang.py（既有缺陷，非 11-11 补丁引入，第 6 节只扫 .js 故一直漏检）：
  - 赋值正则 `(.*);?` 贪婪吃掉行尾分号 → `ast.parse('10;', mode='eval')` 报 invalid syntax
  - 错误文本被 `except` 兜底存进变量表 → `打印(甲*2)` 变成字符串重复，`20` 永远出不来
  - 修：赋值/打印表达式显式剥分号；赋值失败不再写变量表；注释剥离保留 `//` 整除与字符串内 `//`
  - `evaluate/walk()` 白名单一字未动，沙箱逃逸防护不变
- 彩票第 20 期：核对 lottery-game-router.js 18-29 / 84-87 行，确认 createNewRound 开售时即
  预生成 winning 并置 drawnAt:null，开奖只补 drawnAt 后直接兑奖 —— 属正常设计，此前 P0 误判平反
  fix-lottery-round20.js 已加护栏：即使 --apply 也拒绝清空 winning（清空会导致本期 0 命中）
- 按老板指令：夜间 AI 整块略过，night-ai.json / night-ai-router.js 保持原样

## 2026-11-11 新模块：你画我猜擂台（B）

- 新增 drawguess-router.js + public/drawguess.html + drawguess.json，挂进 center.js，server.js 一行未动
- 玩法：90 秒一轮，轮换画手，Socket.IO 同步笔画（固定 900×560 逻辑坐标），猜中者 +8🍊、画手 +3🍊
- 赏金：ctx.treasury.spend 先扣金库、成功再读最新 lobster.json 写余额；金库不足只挂账不超发
- 自定义题词：本地黑名单必过 + config.AI1.url 的 AI 复审（2s 超时）；AI 不可用静默降级，绝不阻塞投稿
- 防泄漏：笔画数组上限 800 且 shift 淘汰；轮次切换先 clearTimeout；finishRound 防重复结算
- 所有 HTTP 接口 / Socket 事件均校验 token；前端聊天、昵称、榜单全部 esc()
- 入口：/drawguess.html（首页导航未改，需 index.html 全文再挂链接）

## 2026-11-11 新模块：你画我猜擂台（B）

- 新增 drawguess-router.js + public/drawguess.html + drawguess.json，挂进 center.js，server.js 一行未动
- 玩法：90 秒一轮，轮换画手，Socket.IO 同步笔画（固定 900×560 逻辑坐标），猜中者 +8🍊、画手 +3🍊
- 赏金：ctx.treasury.spend 先扣金库、成功再读最新 lobster.json 写余额；金库不足只挂账不超发
- 自定义题词：本地黑名单必过 + config.AI1.url 的 AI 复审（2s 超时）；AI 不可用静默降级，绝不阻塞投稿
- 防泄漏：笔画数组上限 800 且 shift 淘汰；轮次切换先 clearTimeout；finishRound 防重复结算
- 所有 HTTP 接口 / Socket 事件均校验 token；前端聊天、昵称、榜单全部 esc()
- 入口：/drawguess.html（首页导航未改，需 index.html 全文再挂链接）

## 2026-11-11 新模块：你画我猜擂台（B）上线

- 新增 drawguess-router.js + public/drawguess.html + drawguess.json，挂进 center.js，server.js 一行未动
- 新增 public/drawguess-entry.js：运行时探测 #input-bar / 侧栏注入首页入口，幂等双兜底；index.html 只注入一行 script，不改结构
- 玩法：90 秒一轮轮换画手，Socket.IO 同步笔画（900×560 逻辑坐标），猜中 +8🍊、画手 +3🍊
- 赏金：ctx.treasury.spend 先扣金库、成功再重读 lobster.json 写余额并回读校验；金库不足只挂账不超发
- 自定义题词：本地黑名单必过 + config.AI1.url 的 AI 复审（2s 超时）；AI 不可用静默降级，绝不阻塞投稿
- 对齐全站：io({auth:{token}}) 鉴权三路兼容；引入 /invite.js 并暴露 window.socket（与 stickman.html 一致）
- 防泄漏：笔画上限 800 且 shift 淘汰；轮次切换先 clearTimeout；finishRound 防重复结算
- 已知边界：若 lobster-router 持有 balances 内存副本，其下次 save 可能覆盖本次发放，需改走统一 balance 接口
- 按老板指令：夜间 AI 整块略过，night-ai.html / night-ai-router.js / night-ai.json 均未改动

## 2026-11-12 pm2 日志复盘（修正版）

- 更正：backup / report / watchdog / ip-watch 均为 online 常驻进程（uptime 22h、restarts 0），3:00 备份 / 7:00 早报是进程内定时触发，非「跑完即停」；v2 时的 stopped 快照为当时真实状态，之后已恢复
- P0：pm2 namespace 中 chat 缺席，watchdog 持续探测无响应且 `pm2 restart chat` 报 not found，https-proxy 在线刷空 `代理错误: `（8443→3000 无监听）。已用 restart-chat.sh 幂等拉起
- 新增 restart-chat.sh：在则 restart、不在才 start、末尾 pm2 save；替代补丁链里的 `pm2 delete chat && pm2 start`
- CONTRIBUTING.md 同步禁止 delete 并说明空窗后果
- 待查：https-proxy 空错误打印的是空字段（需补 err.code / req.url）；backup 3:00:14 与 3:00:44 双份产物是否双触发
- 按老板指令：夜间 AI 整块略过，未改动