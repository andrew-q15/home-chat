// 可选：清理明确的测试残留。默认干跑，必须显式 --apply；写前自动备份。
// 纪律：活数据不删，本脚本默认绝不执行，需老板亲自拍板。
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
function dry(name, F, keep) {
  const d = JSON.parse(fs.readFileSync(F, 'utf8'));
  const kept = keep(d);
  console.log('[' + name + '] 原', Array.isArray(d) ? d.length : (d.history || []).length, '条 → 保留', Array.isArray(kept) ? kept.length : '?', '条');
  if (!APPLY) return;
  backup(F);
  fs.writeFileSync(F, JSON.stringify(kept, null, 2));
  console.log('       已写盘并备份');
}
const B = path.join(__dirname, 'bottles.json');
const W = path.join(__dirname, 'wall.json');
const A = path.join(__dirname, 'auction.json');
if (fs.existsSync(B)) dry('bottles', B, d => d.filter(x => x.text !== '捞上来得人是gay' && x.text !== 'v'));
if (fs.existsSync(W)) dry('wall', W, d => d.filter(x => x.author !== '_t_a' && x.text !== 'asdfghjkl'));
if (fs.existsSync(A)) dry('auction', A, d => { d.history = (d.history || []).filter(x => x.name !== '测试物品'); return d; });
if (!APPLY) console.log('[干跑] 未写盘。确认要清才执行：node cleanup-testdata.js --apply');
