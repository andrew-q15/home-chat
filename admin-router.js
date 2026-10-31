// ============ 管理接口 ============
const crypto = require('crypto');

module.exports = function setupAdmin(app, ctx) {
  const { tokens, state, getBalance, saveState, intelData, foodData, saveFood } = ctx;

// ============ 超管重置用户密码 ============
app.post('/api/admin/reset-pwd', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false });
  const admin = state.users[username];
  if (!admin || !admin.isSuperAdmin) return res.status(403).json({ ok: false, msg: '仅超管可操作' });

  const { targetName, newPassword } = req.body || {};
  const target = state.users[targetName];
  if (!target) return res.status(404).json({ ok: false, msg: '目标用户不存在' });
  if (!newPassword || newPassword.length < 3) return res.status(400).json({ ok: false, msg: '密码至少 3 位' });

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  target.salt = salt;
  target.hash = hash;
  saveState();
  
  res.json({ ok: true, msg: '密码重置成功' });
});

app.get('/api/admin/dashboard', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false });
  const user = state.users[username];
  if (!user.isSuperAdmin) return res.status(403).json({ ok: false, msg: '无权访问总控台' });

  let totalOranges = 0;
  let userBalances = [];
  for (const uname in state.users) {
    const u = state.users[uname];
    const bal = getBalance(u.id);
    totalOranges += bal.oranges;
    userBalances.push({
      id: u.id, name: uname, displayName: u.displayName || uname,
      oranges: bal.oranges, isSuperAdmin: !!u.isSuperAdmin, banned: !!u.banned
    });
  }

  res.json({
    ok: true,
    stats: {
      userCount: Object.keys(state.users).length,
      totalOranges: totalOranges,
      totalMsgs: Object.values(state.histories).reduce((sum, h) => sum + h.length, 0),
      totalIntel: intelData.length
    },
    users: userBalances
  });
});

app.post('/api/admin/food', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false });
  const user = state.users[username];
  if (!user.isSuperAdmin) return res.status(403).json({ ok: false, msg: '无权操作' });

  const { targetName, emoji, amount } = req.body || {};
  const target = state.users[targetName];
  if (!target) return res.json({ ok: false, msg: '目标用户不存在' });
  
  const a = Number(amount);
  if (isNaN(a)) return res.json({ ok: false, msg: '数量错误' });

  if (!foodData.inventory[target.id]) foodData.inventory[target.id] = {};
  const inv = foodData.inventory[target.id];
  inv[emoji] = (inv[emoji] || 0) + a;
  if (inv[emoji] <= 0) delete inv[emoji];
  
  saveFood(foodData);
  res.json({ ok: true });
});

  console.log('[管理] admin 接口模块已挂载');
};
