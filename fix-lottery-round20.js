// 检测「未开奖期却已有完整中奖号」。默认干跑；--apply 才清空 winning（写前备份）
const fs = require('fs'), path = require('path');
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
function backup(F) {
  const fs = require('fs');
  fs.writeFileSync(F + '.bak-orangefix-' + stamp(), fs.readFileSync(F));
}

const APPLY = process.argv.includes('--apply');
const F = path.join(__dirname, 'lottery-game.json');
const d = JSON.parse(fs.readFileSync(F, 'utf8'));
const c = d.current;
if (!c) { console.log('[跳过] 无 current'); process.exit(0); }
const hasNums = c.winning && Array.isArray(c.winning.reds) && c.winning.reds.length === 6;
const undrawn = !c.drawnAt;
console.log('=== 赛博彩票当前期自检 ===');
console.log('期号:', c.roundNo, '| drawnAt:', c.drawnAt, '| tickets:', (c.tickets || []).length, '| prizePool:', c.prizePool);
console.log('已有 6 个红球:', hasNums, '| 未开奖:', undrawn);
if (!(hasNums && undrawn)) { console.log('[结论] 状态正常，或为「预生成中奖号」设计，不改动。'); process.exit(0); }
console.log('[结论] 已核对 lottery-game-router.js 第 18-29 / 84-87 行：createNewRound 在开售时');
console.log('        即预生成 winning:{reds,blue} 并置 drawnAt:null；开奖只补 drawnAt 后取 c.winning 兑奖。');
console.log('        这是「预生成中奖号」设计，第 20 期状态完全正常，此前「写盘写了一半」为误判。');
console.log('[护栏] 清空 winning 会令本期开奖 0 命中，属破坏性操作，本脚本已禁用写盘。');
if (APPLY) { console.log('[拒绝] --apply 已被护栏拦截，未写盘。'); process.exit(1); }
process.exit(0);
