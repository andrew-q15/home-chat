// ============ 偷菜系统（全程过金库）============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function setupGarden(app, ctx) {
  const { tokens, state, getBalance, saveLobster, lobsterData, addOrangeLog, io } = ctx;
  if (!ctx.treasury) throw new Error('treasury-router 必须先于 garden-router 挂载');
  const FILE = path.join(__dirname, 'garden.json');
  function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { gardens: {} }; } }
  function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch {} }
  let data = load();
  if (!data.gardens) data.gardens = {};

  const SEEDS = ['🥕', '🍅', '🥬', '🥒', '🌽', '🥦', '🍄', '🥔', '🍆'];
  const GROW_MS = 5 * 60 * 1000;
  const PLANT_COST = 100;
  const HARVEST_PRICE = 300;
  const STEAL_FAIL_RATE = 0.10;
  const STEAL_PENALTY = 900;

  function ensureGarden(userId) {
    if (!data.gardens[userId]) data.gardens[userId] = { plots: [] };
    return data.gardens[userId];
  }

  function fmtGarden(g, now) {
    const plots = [];
    for (let i = 0; i < 9; i++) {
      const p = (g.plots || []).find(x => x.index === i);
      if (!p) { plots.push({ index: i, empty: true }); continue; }
      const mature = now >= p.matureAt;
      plots.push({
        index: i,
        seed: p.seed,
        plantedAt: p.plantedAt,
        matureAt: p.matureAt,
        mature: mature,
        remainMs: mature ? 0 : (p.matureAt - now),
      });
    }
    return plots;
  }

  app.get('/api/garden/my', (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const g = ensureGarden(user.id);
    const now = Date.now();
    res.json({ ok: true, plots: fmtGarden(g, now), balance: getBalance(user.id).oranges });
  });

  app.post('/api/garden/plant', (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const idx = Number((req.body || {}).index);
    if (isNaN(idx) || idx < 0 || idx > 8) return res.json({ ok: false, msg: '格子 0-8' });
    const g = ensureGarden(user.id);
    if ((g.plots || []).find(x => x.index === idx)) return res.json({ ok: false, msg: '这格已经有作物' });
    const bal = getBalance(user.id);
    if (bal.oranges < PLANT_COST) return res.json({ ok: false, msg: '橘子不足（种一格要 ' + PLANT_COST + '🍊）' });
    const inc = ctx.treasury.income(PLANT_COST, '种菜种子 by ' + username, username);
    if (inc.ok === false) return res.json({ ok: false, msg: '金库异常，暂时种不了' });
    bal.oranges -= PLANT_COST;
    addOrangeLog(user.id, -PLANT_COST, '种菜种子');
    const now = Date.now();
    const seed = SEEDS[Math.floor(Math.random() * SEEDS.length)];
    if (!g.plots) g.plots = [];
    g.plots.push({ index: idx, seed, plantedAt: now, matureAt: now + GROW_MS, harvested: false });
    saveLobster(lobsterData);
    save(data);
    io.emit('garden_planted', { userId: user.id, username, index: idx, seed });
    res.json({ ok: true, seed, matureAt: now + GROW_MS, oranges: bal.oranges });
  });

  app.post('/api/garden/harvest', (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const idx = Number((req.body || {}).index);
    const g = ensureGarden(user.id);
    const p = (g.plots || []).find(x => x.index === idx);
    if (!p) return res.json({ ok: false, msg: '这格没有作物' });
    if (Date.now() < p.matureAt) return res.json({ ok: false, msg: '还没成熟，再等等' });
    const spend = ctx.treasury.spend(HARVEST_PRICE, '收获卖菜《' + p.seed + '》by ' + username, username);
    if (spend.ok === false) return res.json({ ok: false, msg: '金库余额不足，卖不了' });
    const bal = getBalance(user.id);
    bal.oranges += HARVEST_PRICE;
    addOrangeLog(user.id, HARVEST_PRICE, '收获卖菜《' + p.seed + '》');
    g.plots = (g.plots || []).filter(x => x.index !== idx);
    saveLobster(lobsterData);
    save(data);
    io.emit('garden_harvested', { userId: user.id, username, seed: p.seed, price: HARVEST_PRICE });
    res.json({ ok: true, seed: p.seed, earned: HARVEST_PRICE, oranges: bal.oranges });
  });

  app.get('/api/garden/list', (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const now = Date.now();
    const list = [];
    for (const uid in data.gardens) {
      if (uid === user.id) continue;
      const g = data.gardens[uid];
      const maturePlots = (g.plots || []).filter(p => now >= p.matureAt);
      if (maturePlots.length === 0) continue;
      const owner = Object.values(state.users).find(u => u.id === uid);
      list.push({
        userId: uid,
        displayName: owner ? (owner.displayName || '匿名') : '匿名',
        matureCount: maturePlots.length,
        seeds: maturePlots.map(p => p.seed),
      });
    }
    res.json({ ok: true, list });
  });

  app.post('/api/garden/steal', (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const targetId = String((req.body || {}).targetUserId || '');
    if (targetId === user.id) return res.json({ ok: false, msg: '不能偷自己' });
    const tg = data.gardens[targetId];
    if (!tg) return res.json({ ok: false, msg: '对方没有菜园' });
    const now = Date.now();
    const maturePlots = (tg.plots || []).filter(p => now >= p.matureAt);
    if (maturePlots.length === 0) return res.json({ ok: false, msg: '没有成熟的菜可偷' });
    const caught = Math.random() < STEAL_FAIL_RATE;
    if (caught) {
      const bal = getBalance(user.id);
      // 余额不足时按实际扣除额入账，不能固定给金库加 900，否则橘子凭空变多
      const actual = Math.min(STEAL_PENALTY, Math.max(0, bal.oranges));
      bal.oranges -= actual;
      addOrangeLog(user.id, -actual, '偷菜被抓罚款');
      if (actual > 0) ctx.treasury.income(actual, '偷菜被抓罚款 by ' + username, 'garden');
      saveLobster(lobsterData);
      io.emit('garden_steal_caught', { username, targetId, penalty: actual });
      return res.json({ ok: true, caught: true, penalty: actual, oranges: bal.oranges, msg: '被抓了！罚款 ' + actual + '🍊 进金库' });
    }
    const stealCount = Math.min(maturePlots.length, 3);
    const stolen = maturePlots.slice(0, stealCount);
    let totalEarn = 0;
    for (const p of stolen) {
      const spend = ctx.treasury.spend(HARVEST_PRICE, '偷菜《' + p.seed + '》by ' + username, 'garden');
      if (spend.ok === false) break;
      totalEarn += HARVEST_PRICE;
      tg.plots = tg.plots.filter(x => x.index !== p.index);
    }
    if (totalEarn > 0) {
      const bal = getBalance(user.id);
      bal.oranges += totalEarn;
      addOrangeLog(user.id, totalEarn, '偷菜卖《' + stolen.map(p => p.seed).join('') + '》');
      saveLobster(lobsterData);
    }
    save(data);
    io.emit('garden_steal_success', { username, targetId, count: stolen.length, earn: totalEarn });
    res.json({ ok: true, caught: false, count: stolen.length, earn: totalEarn, oranges: getBalance(user.id).oranges });
  });

  // 超管催熟接口（仅测试用）
  app.post('/api/garden/force-mature', (req, res) => {
    const username = tokens[req.headers.authorization];
    const user = username ? state.users[username] : null;
    if (!user || !user.isSuperAdmin) return res.status(403).json({ ok: false, msg: '仅超管' });
    const targetName = String((req.body || {}).username || '');
    const target = state.users[targetName];
    if (!target) return res.json({ ok: false, msg: '目标用户不存在' });
    const g = ensureGarden(target.id);
    const now = Date.now();
    let count = 0;
    for (const p of (g.plots || [])) {
      if (!p.harvested) { p.matureAt = now; count++; }
    }
    save(data);
    console.log('[菜园] 超管催熟 ' + targetName + ' 的 ' + count + ' 格');
    res.json({ ok: true, count });
  });

  console.log('[菜园] 偷菜系统已挂载，金库余额 ' + ctx.treasury.getOranges() + ' 🍊');
};
