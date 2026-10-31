// ============ 小说投币/点赞 ============
const path = require('path');
const fs = require('fs');

module.exports = function setupWritings(app, ctx) {
  const { tokens, state, getBalance, addOrangeLog, saveLobster, lobsterData, pushMessage, saveWritings, writingsData } = ctx;

app.post('/api/writings/:id/coin', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  
  const item = writingsData.find(w => w.id === req.params.id);
  if (!item || !item.isPublished) return res.status(404).json({ ok: false, msg: '作品不存在' });
  if (item.author === username) return res.json({ ok: false, msg: '不能给自己投币哦' });
  
  const amount = Number((req.body && req.body.amount) || 0);
  if (isNaN(amount) || amount <= 0) return res.json({ ok: false, msg: '金额不合法' });
  
  const bal = getBalance(user.id);
  if (bal.oranges < amount) return res.json({ ok: false, msg: '橘子不够啦' });
  
  // 扣读者橘子
  bal.oranges -= amount;
  addOrangeLog(user.id, -amount, `投币支持《${item.title}》`);
  saveLobster(lobsterData);
  
  // 加作者橘子
  const author = state.users[item.author];
  if (author) {
    const authorBal = getBalance(author.id);
    authorBal.oranges += amount;
    addOrangeLog(author.id, amount, `收到《${item.title}》的投币`);
    saveLobster(lobsterData);
  }
  
  // 记录到作品数据里
  if (!item.coins) item.coins = [];
  item.coins.push({ from: username, amount: amount, time: Date.now() });
  saveWritings(writingsData);
  
  pushMessage(state.channels[0] || '日常', '系统', `💰 老板大气！【${user.displayName || username}】给《${item.title}》投了 ${amount} 🍊！`, { kind: 'system' });
  res.json({ ok: true });
});

app.post('/api/writings/:id/like', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  
  const item = writingsData.find(w => w.id === req.params.id);
  if (!item || !item.isPublished) return res.status(404).json({ ok: false });
  
  if (!item.likes) item.likes = [];
  const idx = item.likes.indexOf(username);
  if (idx === -1) item.likes.push(username);
  else item.likes.splice(idx, 1);
  
  saveWritings(writingsData);
  res.json({ ok: true, likes: item.likes.length });
});

  console.log('[小说] 投币/点赞模块已挂载');
};
