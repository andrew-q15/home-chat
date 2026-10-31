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
