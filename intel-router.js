// ============ 家庭情报局 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function setupIntel(app, ctx) {
  const { tokens, state, io, saveState, getBalance, saveLobster, lobsterData, callAI, config, intelData, saveIntel } = ctx;

  const INTEL_FILE = path.join(__dirname, 'intel.json');
  let intelCooldowns = {};
  let storyCooldowns = {};

app.get('/api/intel/list', (req, res) => {
  res.json({ ok: true, intel: intelData });
});


app.post('/api/intel', async (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  
  const now = Date.now();
  const lastTime = intelCooldowns[user.id] || 0;
  if (now - lastTime < 5 * 60 * 1000) {
    const left = Math.ceil((5 * 60 * 1000 - (now - lastTime)) / 1000);
    return res.status(400).json({ ok: false, msg: `情报冷却中，请等 ${left} 秒后再发` });
  }

  const { text, type } = req.body || {};
  const intelText = String(text || '').trim();
  if (!intelText) return res.status(400).json({ ok: false, msg: '内容不能为空' });
  if (intelText.length > 200) return res.status(400).json({ ok: false, msg: '情报太长' });

  let reward = 2;
  try {
    const prompt = `评估情报：“${intelText}”。有价值的给 5-10 分，灌水给 0 分。只输出数字。`;
    const reply = await callAI(config.AI1.url, config.AI1.model, [
      { role: 'system', content: '只输出数字。' }, { role: 'user', content: prompt }
    ], 20);
    let aiScore = parseInt((reply || '').trim(), 10);
    if (!isNaN(aiScore)) reward = Math.max(0, Math.min(10, aiScore));
    if (intelText.length < 3) reward = 0;
  } catch (e) {}

  intelCooldowns[user.id] = now;

  // 欠账期发灌水情报（AI < 有效阈值）：每条扣 1
  const _bal = getBalance(user.id);
  if (_bal.oranges < 0 && reward < INTEL_VALID_SCORE) {
    _bal.oranges -= 1;
    saveLobster(lobsterData);
    console.log('[情报局] ' + username + ' 欠账期灌水，扣 1 🍊，当前 ' + _bal.oranges);
  }

  if (reward > 0) { getBalance(user.id).oranges += reward; saveLobster(lobsterData); }

  // 情报局 KPI：有效情报（AI >= 5 分）计入今日配额
  if (reward >= INTEL_VALID_SCORE && intelMembers.members[user.id]) {
    const m = intelMembers.members[user.id];
    const today = todayStr();
    if (m.lastSubmitDate !== today) {
      m.todayCount = 0;
      m.lastSubmitDate = today;
    }
    m.todayCount = (m.todayCount || 0) + 1;
    saveIntelMembers(intelMembers);
    console.log('[情报局] ' + username + ' 今日有效情报 ' + m.todayCount + '/' + getIntelQuota(m));
  }

  const intelItem = { id: 'intel-' + crypto.randomBytes(4).toString('hex'), text: intelText, type: type || 'general', author: username, authorName: user.displayName || username, time: now, reward: reward };
  intelData.unshift(intelItem);
  if (intelData.length > 100) intelData = intelData.slice(0, 100);
  saveIntel(intelData);
  io.emit('intel_updated', intelItem);
  res.json({ ok: true, reward: reward, intel: intelItem });
});

  console.log('[情报局] 家庭情报局模块已挂载');
};
