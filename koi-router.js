// ============ 今日锦鲤 ============
const path = require('path');
const fs = require('fs');

module.exports = function setupKoi(app, ctx) {
  const { tokens, state, getBalance, saveState, io } = ctx;
  const FILE = path.join(__dirname, 'koi.json');
  function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { today: null }; } }
  function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch {} }
  let koiData = load();

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function pickKoi() {
    const users = Object.keys(state.users).filter(u => state.users[u] && !state.users[u].banned);
    if (users.length === 0) return null;
    const winner = users[Math.floor(Math.random() * users.length)];
    const u = state.users[winner];
    koiData.today = {
      date: todayStr(),
      winner,
      displayName: u.displayName || winner,
      pickedAt: Date.now(),
    };
    save(koiData);
    io.emit('koi_picked', { displayName: koiData.today.displayName, date: koiData.today.date });
    console.log('[锦鲤] 今日锦鲤：' + (u.displayName || winner));
    return koiData.today;
  }

  app.get('/api/koi/today', (req, res) => {
    if (!koiData.today || koiData.today.date !== todayStr()) pickKoi();
    res.json({ ok: true, koi: koiData.today });
  });

  app.post('/api/koi/pick', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user || !(user.isSuperAdmin || username === 'mac')) return res.json({ ok: false, msg: '只有老板能抽' });
    const k = pickKoi();
    res.json({ ok: true, koi: k });
  });

  // 每天 8:00 自动抽
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 8 && now.getMinutes() === 0) {
      if (!koiData.today || koiData.today.date !== todayStr()) pickKoi();
    }
  }, 30 * 1000);

  console.log('[锦鲤] 今日锦鲤模块已挂载');
};
