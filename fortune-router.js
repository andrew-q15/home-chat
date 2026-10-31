// ============ 每日运势 ============
const path = require('path');
const fs = require('fs');

module.exports = function setupFortune(app, ctx) {
  const { tokens, state, callAI, config } = ctx;
  const FILE = path.join(__dirname, 'fortune.json');
  function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } }
  function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch {} }
  let fortuneData = load();

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  app.get('/api/fortune/today', async (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const today = todayStr();
    const key = user.id + '_' + today;
    if (fortuneData[key]) return res.json({ ok: true, fortune: fortuneData[key].text, cached: true });

    try {
      const reply = await callAI(config.AI1.url, config.AI1.model, [
        { role: 'system', content: '你是赛博算命先生。用一句话给用户今日运势，不超过30字，带点幽默。直接输出，不要解释。' },
        { role: 'user', content: '今天运势如何？' }
      ], 80);
      const text = (reply || '今日宜摸鱼，忌刷题。').trim();
      fortuneData[key] = { text, time: Date.now() };
      save(fortuneData);
      res.json({ ok: true, fortune: text, cached: false });
    } catch (e) {
      res.json({ ok: true, fortune: '今日宜摸鱼，忌刷题。', cached: false });
    }
  });

  console.log('[运势] 每日运势模块已挂载');
};
