// ============ 个人主页 ============
const path = require('path');
const fs = require('fs');

module.exports = function setupProfile(app, ctx) {
  const { tokens, state, getBalance, saveState, lobsterData } = ctx;

  function getUserStats(user) {
    const stats = {};
    try {
      const fs = require('fs');
      const path = require('path');
      const quizFile = path.join(__dirname, 'quiz.json');
      if (fs.existsSync(quizFile)) {
        const qd = JSON.parse(fs.readFileSync(quizFile, 'utf8'));
        stats.quizWins = (qd.history || []).filter(h => h.winner === user.id).length;
      }
      const koiFile = path.join(__dirname, 'koi.json');
      if (fs.existsSync(koiFile)) {
        const kd = JSON.parse(fs.readFileSync(koiFile, 'utf8'));
        stats.koiCount = (kd.today && kd.today.winner === user.id) ? 1 : 0;
      }
      const wishFile = path.join(__dirname, 'wishes.json');
      if (fs.existsSync(wishFile)) {
        const wd = JSON.parse(fs.readFileSync(wishFile, 'utf8'));
        stats.wishCount = (wd || []).filter(w => w.userId === user.id).length;
        stats.wishGranted = (wd || []).filter(w => w.userId === user.id && w.granted).length;
      }
      const writingsFile = path.join(__dirname, 'writings.json');
      if (fs.existsSync(writingsFile)) {
        const wd2 = JSON.parse(fs.readFileSync(writingsFile, 'utf8'));
        stats.novelCount = (wd2 || []).filter(w => w.author === user.username && w.isPublished).length;
      }
      const achFile = path.join(__dirname, 'achievements.json');
      if (fs.existsSync(achFile)) {
        const ad = JSON.parse(fs.readFileSync(achFile, 'utf8'));
        const mine = ad[user.id] || {};
        stats.achievementCount = Object.keys(mine).length;
        stats.maxedCount = Object.values(mine).filter(v => v === 4).length;
      }
    } catch (e) {}
    return stats;
  }

  // 获取用户主页数据
  app.get('/api/profile/me', (req, res) => {
    const auth = req.headers.authorization;
    console.log('[主页调试] auth前16位:', (auth||'').slice(0,16), '| ctx.tokens有这token吗:', !!ctx.tokens[auth], '| 对应username:', ctx.tokens[auth], '| state.users有这用户吗:', !!(ctx.tokens[auth] && state.users[ctx.tokens[auth]]));
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const target = state.users[username];
    if (!target) return res.status(404).json({ ok: false });
    const bal = getBalance(target.id);
    const stats = getUserStats(target);
    const tiers = [
      { name: '青铜', min: 0, emoji: '🥉' },
      { name: '白银', min: 500, emoji: '🥈' },
      { name: '黄金', min: 2000, emoji: '🥇' },
      { name: '铂金', min: 5000, emoji: '💎' },
      { name: '钻石', min: 20000, emoji: '💠' },
      { name: '王者', min: 100000, emoji: '👑' },
    ];
    let tier = tiers[0];
    for (const t of tiers) { if (bal.oranges >= t.min) tier = t; }
    res.json({
      ok: true,
      profile: {
        username, displayName: target.displayName || username,
        avatar: target.avatar || null, title: target.title || null,
        oranges: bal.oranges, totalSpent: bal.totalSpent || 0,
        tier, checkInStreak: target.checkInStreak || 0,
        lobsterTaskCount: target.lobsterTaskCount || 0,
        uploadCount: target.uploadCount || 0, stats,
      },
    });
  });

  app.get('/api/profile/:username', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const viewer = state.users[username];
    if (!viewer) return res.status(401).json({ ok: false });

    const targetName = req.params.username;
    const target = state.users[targetName];
    if (!target) return res.status(404).json({ ok: false, msg: '用户不存在' });

    const bal = getBalance(target.id);
    const stats = getUserStats(target);

    // 段位：按橘子余额算
    const tiers = [
      { name: '青铜', min: 0, emoji: '🥉' },
      { name: '白银', min: 500, emoji: '🥈' },
      { name: '黄金', min: 2000, emoji: '🥇' },
      { name: '铂金', min: 5000, emoji: '💎' },
      { name: '钻石', min: 20000, emoji: '💠' },
      { name: '王者', min: 100000, emoji: '👑' },
    ];
    let tier = tiers[0];
    for (const t of tiers) { if (bal.oranges >= t.min) tier = t; }

    res.json({
      ok: true,
      profile: {
        username: targetName,
        displayName: target.displayName || targetName,
        avatar: target.avatar || null,
        title: target.title || null,
        oranges: bal.oranges,
        totalSpent: bal.totalSpent || 0,
        tier: tier,
        checkInStreak: target.checkInStreak || 0,
        lobsterTaskCount: target.lobsterTaskCount || 0,
        uploadCount: target.uploadCount || 0,
        stats,
      },
    });
  });

  // 获取我的主页（快捷入口）


  console.log('[主页] 个人主页模块已挂载');
};
