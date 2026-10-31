// ============ 戳一戳 ============
const path = require('path');

module.exports = function setupPoke(app, ctx) {
  const { tokens, state, io, nameToSockets, broadcastChannels } = ctx;

  app.post('/api/poke', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const { target } = req.body || {};
    if (!target || !state.users[target]) return res.json({ ok: false, msg: '目标不存在' });
    if (target === username) return res.json({ ok: false, msg: '不能戳自己' });

    const myName = state.users[username].displayName || username;
    
    // 推给目标用户
    const targetSockets = nameToSockets[target];
    if (targetSockets) {
      targetSockets.forEach(s => {
        s.emit('poked', { fromName: myName });
      });
      // 系统提示
      const dmName = 'DM:' + [username, target].sort().join('|');
      if (!state.channels.includes(dmName)) {
        state.channels.push(dmName);
        state.histories[dmName] = [];
      }
      if (typeof ctx.pushMessage === 'function') {
        ctx.pushMessage(dmName, '系统', `👉 ${myName} 戳了戳你`, { kind: 'system' });
      }
      if (typeof broadcastChannels === 'function') broadcastChannels();
      res.json({ ok: true });
    } else {
      res.json({ ok: false, msg: '对方不在线' });
    }
  });
  console.log('[互动] 戳一戳模块已挂载');
};
