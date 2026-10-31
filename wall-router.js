// ============ 留言墙 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function setupWall(app, ctx) {
  const { tokens, state, io } = ctx;
  const FILE = path.join(__dirname, 'wall.json');
  function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } }
  function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch {} }
  let wallData = load();

  app.get('/api/wall', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    const me = username ? state.users[username] : null;
    let list = wallData.slice().sort((a, b) => b.likes - a.likes || b.time - a.time);
    res.json({
      ok: true,
      wall: list.slice(0, 100),
      me: me ? { userId: me.id, username, isSuperAdmin: !!me.isSuperAdmin } : null,
    });
  });

  app.post('/api/wall', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const text = String((req.body || {}).text || '').trim();
    if (!text) return res.json({ ok: false, msg: '内容不能为空' });
    if (text.length > 100) return res.json({ ok: false, msg: '最多100字' });

    const user = state.users[username];
    const item = {
      id: 'w-' + crypto.randomBytes(4).toString('hex'),
      text, time: Date.now(), likes: 0, likedBy: [],
      userId: user ? user.id : null,
      author: username,
    };
    wallData.unshift(item);
    if (wallData.length > 500) wallData = wallData.slice(0, 500);
    save(wallData);
    io.emit('wall_new', item);
    res.json({ ok: true, item });
  });

  app.post('/api/wall/:id/like', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    const item = wallData.find(x => x.id === req.params.id);
    if (!item) return res.status(404).json({ ok: false });
    
    if (item.likedBy.includes(user.id)) {
      item.likedBy = item.likedBy.filter(x => x !== user.id);
      item.likes = Math.max(0, item.likes - 1);
    } else {
      item.likedBy.push(user.id);
      item.likes++;
    }
    save(wallData);
    res.json({ ok: true, likes: item.likes });
  });
  app.delete('/api/wall/:id', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const idx = wallData.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, msg: '留言不存在' });
    const item = wallData[idx];
    const isOwner = item.userId === user.id || item.author === username;
    if (!isOwner && !user.isSuperAdmin) {
      return res.status(403).json({ ok: false, msg: '无权删除' });
    }
    wallData.splice(idx, 1);
    save(wallData);
    io.emit('wall_deleted', { id: req.params.id });
    res.json({ ok: true });
  });

  console.log('[互动] 留言墙模块已挂载');
};
