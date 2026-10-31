// 一次性补偿脚本：跨天重复出题日，答对者每天补 100 🍊
// 用法：node quiz-compensate.js          （只报告，不写盘）
//       node quiz-compensate.js --apply  （实际写 lobster.json）
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const QUIZ = path.join(__dirname, 'quiz.json');
const LOB = path.join(__dirname, 'lobster.json');

const quiz = JSON.parse(fs.readFileSync(QUIZ, 'utf8'));
const lob = JSON.parse(fs.readFileSync(LOB, 'utf8'));

// 1. 按日期聚合：同一天可能多条 history（测试刷题），取当天第一条的题面为准
const byDate = {};
for (const h of (quiz.history || [])) {
  const d = h.date;
  if (!d) continue;
  if (!byDate[d]) byDate[d] = { question: h.question, winner: h.winner || null };
  // 若当天有答对记录，优先保留 winner
  if (h.winner && !byDate[d].winner) byDate[d].winner = h.winner;
}

const dates = Object.keys(byDate).sort();
const dupGroups = [];
for (let i = 1; i < dates.length; i++) {
  const prev = byDate[dates[i - 1]];
  const cur = byDate[dates[i]];
  if (prev.question === cur.question) {
    dupGroups.push({ dates: [dates[i - 1], dates[i]], question: cur.question });
  }
}

if (dupGroups.length === 0) {
  console.log('[完成] 未发现跨天重复出题日，0 笔补偿');
  process.exit(0);
}

let granted = 0;
const seen = new Set();
for (const g of dupGroups) {
  console.log('[重复日] ' + g.dates.join(' 与 ') + ' 同题：' + g.question);
  for (const d of g.dates) {
    const rec = byDate[d];
    if (!rec.winner) { console.log('  [跳过] ' + d + ' winner=null'); continue; }
    const uid = rec.winner;
    const key = uid + '|' + d;
    if (seen.has(key)) { console.log('  [跳过] 已补过 ' + key); continue; }
    seen.add(key);
    if (!lob.balances) lob.balances = {};
    if (!lob.balances[uid]) lob.balances[uid] = { oranges: 0, totalSpent: 0, ledger: [] };
    const bal = lob.balances[uid];
    if (!bal.ledger) bal.ledger = [];
    const reason = '每日一题补偿(' + d + ')';
    if (bal.ledger.some(l => l.reason === reason)) {
      console.log('  [跳过] ' + uid + ' 已有 ' + reason);
      continue;
    }
    bal.oranges += 100;
    bal.ledger.unshift({ time: Date.now(), amount: 100, reason });
    if (bal.ledger.length > 100) bal.ledger = bal.ledger.slice(0, 100);
    granted++;
    console.log('  [补偿] ' + uid + ' 于 ' + d + ' 补发 100 🍊');
  }
}

if (APPLY) {
  fs.writeFileSync(LOB, JSON.stringify(lob, null, 2));
  console.log('[完成] 实际写盘，' + granted + ' 笔补偿');
} else {
  console.log('[完成] 干跑模式，未写盘；确认无误后加 --apply 执行。重复日 ' + dupGroups.length + ' 组，可补 ' + granted + ' 笔');
}
