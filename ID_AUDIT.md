# ID 审计报告

> 扫描 public/*.html 里每个文件的静态 id，列出重复项。
> 排除含单引号/加号/${ 的 JS 模板拼接片段（那是 data-* 属性，不是真 id）。

| 文件 | 静态 id 数 | 唯一数 | 重复项 |
|---|---|---|---|
| achievements.html | 3 | 3 | 无 |
| admin.html | 14 | 14 | 无 |
| auto-map.html | 1 | 1 | 无 |
| board.html | 18 | 18 | 无 |
| bottle.html | 5 | 5 | 无 |
| brightness.html | 5 | 5 | 无 |
| calc.html | 2 | 2 | 无 |
| calendar.html | 6 | 6 | 无 |
| dashboard.html | 16 | 16 | 无 |
| delta-intel.html | 5 | 5 | 无 |
| doctor.html | 7 | 7 | 无 |
| drop.html | 7 | 7 | 无 |
| english-intel.html | 8 | 8 | 无 |
| fishing.html | 6 | 6 | 无 |
| foodmarket.html | 5 | 5 | 无 |
| fortune.html | 1 | 1 | 无 |
| fps.html | 8 | 8 | 无 |
| group.html | 4 | 4 | 无 |
| guide.html | 0 | 0 | 无 |
| hiking.html | 6 | 6 | 无 |
| hotpot.html | 4 | 4 | 无 |
| index.html | 164 | 164 | 无 |
| intel.html | 16 | 16 | 无 |
| join.html | 0 | 0 | 无 |
| kitchen.html | 14 | 10 | `salt-bar` ×2, `salt-fill` ×2, `soy-bar` ×2, `soy-fill` ×2 |
| koi.html | 4 | 4 | 无 |
| ledger.html | 8 | 8 | 无 |
| lobster.html | 20 | 20 | 无 |
| lottery-game.html | 6 | 6 | 无 |
| lottery.html | 11 | 11 | 无 |
| map.html | 4 | 4 | 无 |
| market.html | 13 | 13 | 无 |
| novels.html | 5 | 5 | 无 |
| profile.html | 2 | 2 | 无 |
| quiz.html | 6 | 6 | 无 |
| snake.html | 11 | 11 | 无 |
| sonar.html | 2 | 2 | 无 |
| square.html | 16 | 16 | 无 |
| stickman.html | 8 | 8 | 无 |
| stock.html | 3 | 3 | 无 |
| vault.html | 6 | 6 | 无 |
| vision.html | 9 | 9 | 无 |
| wall.html | 3 | 3 | 无 |
| wish.html | 3 | 3 | 无 |
| writing.html | 6 | 6 | 无 |
| zodiac.html | 7 | 7 | 无 |

## 已知重复项说明

### public/kitchen.html： /  /  /  各 ×2

- **位置**：83–95 行是主界面滑块（正常可见区），225–226 行是「烹饪中」弹层模板（JS 模板字符串）。
- **定性**：JS 模板字符串复制粘贴遗留，弹层滑块与主界面滑块同时存在于 DOM，同名 id 并存。
- **影响**：JS 未用 `getElementById` 按 id 操作这 4 个元素（已 grep 确认），弹层滑块为静态展示，**不影响运行**。浏览器控制台可能报 id 重复警告，未来若有人新增 `getElementById` 驱动需注意。
- **处理**：老板决定不修代码，仅记录。若后续要修，方案是把弹层模板 id 加 `-cook` 后缀（`salt-bar-cook` 等），同步改 JS 引用。

## 汇总

- 扫描文件数: 46
- 有重复 id 的文件数: 1
- 重复项总数: 4

> 注：如果某文件重复项是 `writing-btn` 这种，说明该页面有历史遗留，需人工确认。