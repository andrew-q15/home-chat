// ============ 赛博许愿池 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function setupWish(app, ctx) {
  const FILE = path.join(__dirname, 'wishes.json');
  function load() {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
    catch { return []; }
  }
  function save(d) {
    try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch {}
  }
  let wishes = load();

  app.post('/api/wish', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = ctx.state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const text = String((req.body || {}).text || '').trim();
    if (!text) return res.json({ ok: false, msg: '愿望不能为空' });
    if (text.length > 100) return res.json({ ok: false, msg: '愿望最多 100 字' });
    const bal = ctx.getBalance(user.id);
    if (bal.oranges < 10) return res.json({ ok: false, msg: '橘子不够（许愿要 10🍊）' });
    bal.oranges -= 10;
    ctx.saveLobster(ctx.lobsterData);
    if (ctx.addOrangeLog) ctx.addOrangeLog(user.id, -10, '赛博许愿池');
    const wish = {
      id: 'wish-' + crypto.randomBytes(4).toString('hex'),
      userId: user.id, username, displayName: user.displayName || username,
      text, time: Date.now(), granted: false, grantedAt: null, grantedBy: null, likes: 0, likedBy: [],
    };
    wishes.unshift(wish);
    if (wishes.length > 200) wishes = wishes.slice(0, 200);
    save(wishes);
    ctx.io.emit('wish_new', { id: wish.id, displayName: wish.displayName, text: wish.text });
    console.log('[许愿池] ' + username + ' 许愿：' + text);
    res.json({ ok: true, wish, oranges: bal.oranges });
  });

  app.get('/api/wish/list', (req, res) => {
    const sortBy = req.query.sort === 'hot' ? 'hot' : 'new';
    let list = wishes.slice();
    if (sortBy === 'hot') list.sort((a, b) => b.likes - a.likes);
    else list.sort((a, b) => b.time - a.time);
    res.json({ ok: true, wishes: list.slice(0, 100) });
  });

  app.post('/api/wish/:id/like', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = ctx.state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const w = wishes.find(x => x.id === req.params.id);
    if (!w) return res.status(404).json({ ok: false });
    if (w.likedBy.includes(user.id)) {
      w.likedBy = w.likedBy.filter(x => x !== user.id);
      w.likes = Math.max(0, w.likes - 1);
    } else {
      w.likedBy.push(user.id);
      w.likes++;
    }
    save(wishes);
    res.json({ ok: true, likes: w.likes });
  });

  app.post('/api/wish/:id/grant', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = ctx.state.users[username];
    if (!user || !(user.isSuperAdmin || username === 'mac')) return res.json({ ok: false, msg: '只有老板能显灵' });
    const w = wishes.find(x => x.id === req.params.id);
    if (!w) return res.status(404).json({ ok: false });
    if (w.granted) return res.json({ ok: false, msg: '已经显灵过了' });
    w.granted = true;
    w.grantedAt = Date.now();
    w.grantedBy = username;
    save(wishes);
    ctx.io.emit('wish_granted', { id: w.id, displayName: w.displayName, text: w.text });
    console.log('[许愿池] ' + username + ' 显灵了：' + w.text);
    res.json({ ok: true });
  });

  console.log('[许愿池] 赛博许愿池模块已挂载');
};
