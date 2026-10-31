// ============ 共享日历 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function setupCalendar(app, ctx) {
  const { tokens, state, io } = ctx;
  const FILE = path.join(__dirname, 'calendar.json');
  function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } }
  function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch {} }
  let calData = load();

  app.get('/api/calendar', (req, res) => {
    res.json({ ok: true, events: calData.sort((a, b) => a.date.localeCompare(b.date)) });
  });

  app.post('/api/calendar', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    
    const { title, date, time, desc } = req.body || {};
    if (!title || !date) return res.json({ ok: false, msg: '标题和日期必填' });

    const item = {
      id: 'cal-' + crypto.randomBytes(4).toString('hex'),
      title, date, time: time || '', desc: desc || '',
      creator: user.displayName || username,
      time_created: Date.now()
    };
    calData.push(item);
    save(calData);
    io.emit('calendar_updated', item);
    res.json({ ok: true, item });
  });

  app.delete('/api/calendar/:id', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    
    const idx = calData.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false });
    
    // 只有创建者或超管能删
    if (calData[idx].creator !== (user.displayName || username) && !user.isSuperAdmin) {
      return res.status(403).json({ ok: false, msg: '无权删除' });
    }
    calData.splice(idx, 1);
    save(calData);
    io.emit('calendar_deleted', req.params.id);
    res.json({ ok: true });
  });

  console.log('[日历] 共享日历模块已挂载');
};
