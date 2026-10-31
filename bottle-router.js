// ============ 漂流瓶 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function setupBottle(app, ctx) {
  const { tokens, state } = ctx;
  const FILE = path.join(__dirname, 'bottles.json');
  function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } }
  function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch {} }
  let bottles = load();

  app.post('/api/bottle/throw', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const text = String((req.body || {}).text || '').trim();
    if (!text) return res.json({ ok: false, msg: '内容不能为空' });
    if (text.length > 200) return res.json({ ok: false, msg: '最多200字' });

    bottles.push({
      id: 'b-' + crypto.randomBytes(4).toString('hex'),
      text, time: Date.now(), pickedBy: []
    });
    if (bottles.length > 500) bottles = bottles.slice(0, 500);
    save(bottles);
    res.json({ ok: true });
  });

  app.get('/api/bottle/pick', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    
    // 过滤掉自己扔的，以及自己捞过的
    const available = bottles.filter(b => !b.pickedBy.includes(user.id));
    if (available.length === 0) return res.json({ ok: false, msg: '海里没有漂流瓶了' });

    const picked = available[Math.floor(Math.random() * available.length)];
    picked.pickedBy.push(user.id);
    save(bottles);
    res.json({ ok: true, bottle: { id: picked.id, text: picked.text, time: picked.time } });
  });
  console.log('[互动] 漂流瓶模块已挂载');
};
