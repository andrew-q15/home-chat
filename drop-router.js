// ============ 天降橘子雨 ============
const crypto = require('crypto');

module.exports = function setupDrop(app, ctx) {
  // 当前掉落状态（内存，重启清空）
  let activeDrop = null;

  // 获取当前掉落状态
  app.get('/api/drop/status', (req, res) => {
    if (!activeDrop) return res.json({ ok: true, active: false });
    res.json({
      ok: true,
      active: true,
      remainCount: activeDrop.claims.length,
      totalReward: activeDrop.totalReward,
      leftMs: Math.max(0, activeDrop.expiresAt - Date.now()),
    });
  });

  // 发起掉落（超管或 mac）
  app.post('/api/drop/start', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
    const user = ctx.state.users[username];
    if (!user || !(user.isSuperAdmin || username === 'mac')) {
      return res.json({ ok: false, msg: '只有老板能发起橘子雨' });
    }
    if (activeDrop) {
      return res.json({ ok: false, msg: '已经有橘子雨在进行中' });
    }

    activeDrop = {
      id: 'drop-' + crypto.randomBytes(4).toString('hex'),
      startAt: Date.now(),
      expiresAt: Date.now() + 15000,  // 15 秒
      totalReward: 50,
      maxClaims: 3,
      claims: [],
      initiator: username,
    };

    // 全服广播
    ctx.io.emit('drop_start', {
      id: activeDrop.id,
      totalReward: activeDrop.totalReward,
      maxClaims: activeDrop.maxClaims,
      leftMs: 15000,
    });

    console.log('[掉落] ' + username + ' 发起橘子雨，15 秒内前 3 名发言得 50🍊');

    // 15 秒后自动结束
    setTimeout(() => {
      if (activeDrop && activeDrop.id === activeDrop.id) {
        ctx.io.emit('drop_end', { id: activeDrop.id, claims: activeDrop.claims });
        activeDrop = null;
      }
    }, 15500);

    res.json({ ok: true, dropId: activeDrop.id });
  });

  // 抢掉落（发言时调用）
  app.post('/api/drop/claim', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    if (!activeDrop) return res.json({ ok: false, msg: '没有橘子雨' });
    if (Date.now() > activeDrop.expiresAt) {
      activeDrop = null;
      return res.json({ ok: false, msg: '橘子雨已经停了' });
    }
    if (activeDrop.claims.length >= activeDrop.maxClaims) {
      return res.json({ ok: false, msg: '已经被抢光了' });
    }
    if (activeDrop.claims.includes(username)) {
      return res.json({ ok: false, msg: '你已经抢过了' });
    }

    const user = ctx.state.users[username];
    if (!user) return res.json({ ok: false });

    activeDrop.claims.push(username);
    const bal = ctx.getBalance(user.id);
    bal.oranges += activeDrop.totalReward;
    ctx.saveLobster(ctx.lobsterData);
    ctx.addOrangeLog(user.id, activeDrop.totalReward, '天降橘子雨');

    console.log('[掉落] ' + username + ' 抢到 ' + activeDrop.totalReward + ' 🍊');
    ctx.io.emit('drop_claim', {
      username,
      displayName: user.displayName || username,
      amount: activeDrop.totalReward,
      claimIndex: activeDrop.claims.length,
      total: activeDrop.maxClaims,
    });

    // 抢满 3 个立即结束
    if (activeDrop.claims.length >= activeDrop.maxClaims) {
      const dropId = activeDrop.id;
      setTimeout(() => {
        ctx.io.emit('drop_end', { id: dropId, claims: activeDrop ? activeDrop.claims : [] });
        activeDrop = null;
      }, 2000);
    }

    res.json({ ok: true, amount: activeDrop.totalReward, oranges: bal.oranges });
  });

  console.log('[掉落] 天降橘子雨模块已挂载');
};
