// ============ 橘子成就系统（带等级） ============
const path = require('path');
const fs = require('fs');

module.exports = function setupAchievement(app, ctx) {
  const ACH_FILE = path.join(__dirname, 'achievements.json');
  function loadAch() { try { return JSON.parse(fs.readFileSync(ACH_FILE, 'utf8')); } catch { return {}; } }
  function saveAch(d) { try { fs.writeFileSync(ACH_FILE, JSON.stringify(d, null, 2)); } catch {} }
  let achData = loadAch();

  // 等级定义：等级名、emoji、颜色
  const LEVELS = [
    { name: '铜', emoji: '🥉', color: '#cd7f32' },
    { name: '银', emoji: '🥈', color: '#c0c0c0' },
    { name: '金', emoji: '🥇', color: '#ffd700' },
    { name: '铂金', emoji: '💎', color: '#e5e4e2' },
    { name: '钻石', emoji: '💠', color: '#b9f2ff' },
  ];

  // 成就定义：每个成就有5个等级，阈值数组
  const ACHIEVEMENTS = [
    { id: 'first-1000', name: '千橘富翁', emoji: '💰', desc: '橘子余额达到', thresholds: [1000, 5000, 20000, 50000, 100000] },
    { id: 'first-10000', name: '万橘户', emoji: '💎', desc: '橘子余额达到', thresholds: [10000, 50000, 100000, 500000, 1000000] },
    { id: 'checkin-7', name: '七日签到', emoji: '📅', desc: '连续签到', thresholds: [7, 14, 30, 60, 100] },
    { id: 'checkin-30', name: '月度全勤', emoji: '🏆', desc: '连续签到', thresholds: [30, 60, 90, 180, 365] },
    { id: 'stock-profit', name: '股市之神', emoji: '📈', desc: '股市累计盈利', thresholds: [1000, 5000, 20000, 50000, 100000] },
    { id: 'intel-king', name: '情报之王', emoji: '📡', desc: '有效情报', thresholds: [10, 50, 200, 500, 1000] },
    { id: 'hotpot-master', name: '火锅达人', emoji: '🍲', desc: '火锅抢食材', thresholds: [10, 50, 200, 500, 1000] },
    { id: 'cook-master', name: '赛博厨神', emoji: '👨‍🍳', desc: '做菜', thresholds: [5, 20, 50, 100, 200] },
    { id: 'fish-legend', name: '深海传奇', emoji: '🐳', desc: '捞到蓝鲸', thresholds: [1, 3, 10, 30, 100] },
    { id: 'lobster-10', name: '龙虾老饕', emoji: '🦞', desc: '成功龙虾任务', thresholds: [5, 10, 30, 60, 100] },
    { id: 'daily-quiz', name: '答题达人', emoji: '🧠', desc: '每日一题答对', thresholds: [1, 5, 15, 30, 50] },
    { id: 'quiz-master', name: '答题王者', emoji: '👑', desc: '每日一题答对', thresholds: [10, 30, 100, 300, 500] },
    { id: 'koi-lucky', name: '天选锦鲤', emoji: '🍀', desc: '被抽中锦鲤', thresholds: [1, 3, 5, 10, 20] },
    { id: 'lottery-win', name: '彩票中奖', emoji: '🎫', desc: '彩票中奖次数', thresholds: [1, 3, 10, 30, 100] },
    { id: 'wish-maker', name: '许愿达人', emoji: '🌟', desc: '许愿次数', thresholds: [5, 20, 50, 100, 200] },
    { id: 'wish-granted', name: '愿望成真', emoji: '✨', desc: '愿望被显灵', thresholds: [1, 3, 5, 10, 20] },
    { id: 'drop-hunter', name: '橘子雨猎人', emoji: '🌧️', desc: '抢到橘子雨', thresholds: [3, 10, 30, 60, 100] },
    { id: 'uploader', name: '分享达人', emoji: '📤', desc: '上传文件', thresholds: [10, 50, 100, 300, 500] },
    { id: 'avatar-set', name: '有头有脸', emoji: '🖼️', desc: '设置头像', thresholds: [1, 2, 3, 5, 10] },
    { id: 'board-artist', name: '白板画家', emoji: '🎨', desc: '白板画', thresholds: [20, 100, 500, 1000, 5000] },
    { id: 'poll-creator', name: '民意领袖', emoji: '📊', desc: '发起投票', thresholds: [3, 10, 30, 60, 100] },
    { id: 'red-packet', name: '红包大户', emoji: '🧧', desc: '发红包', thresholds: [5, 20, 50, 100, 200] },
    { id: 'tipper', name: '打赏土豪', emoji: '💰', desc: '打赏消息', thresholds: [10, 30, 100, 300, 500] },
    { id: 'list-keeper', name: '清单管家', emoji: '📋', desc: '清单加项', thresholds: [20, 100, 300, 600, 1000] },
    { id: 'sticker-collector', name: '表情包收藏家', emoji: '😀', desc: '收藏贴纸', thresholds: [10, 50, 100, 300, 500] },
    { id: 'novel-writer', name: '小说作家', emoji: '📖', desc: '发布作品', thresholds: [1, 5, 10, 30, 50] },
    { id: 'novel-coin', name: '小说金主', emoji: '🪙', desc: '投币次数', thresholds: [5, 20, 50, 100, 200] },
  ];

  // 根据数值计算等级索引（0~4，-1表示未解锁）
  function calcLevel(value, thresholds) {
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (value >= thresholds[i]) return i;
    }
    return -1;
  }

  // 检查并更新成就等级
  function checkLevel(userId, achId, value) {
    if (!achData[userId]) achData[userId] = {};
    const def = ACHIEVEMENTS.find(a => a.id === achId);
    if (!def) return null;
    const level = calcLevel(value, def.thresholds);
    if (level < 0) return null;
    const oldLevel = achData[userId][achId] !== undefined ? achData[userId][achId] : -1;
    if (level > oldLevel) {
      achData[userId][achId] = level;
      saveAch(achData);
      // 全服广播升级
      const user = Object.values(ctx.state.users).find(u => u.id === userId);
      if (user) {
        ctx.io.emit('achievement_level_up', {
          userId, username: user.displayName || userId,
          achievement: def, level: LEVELS[level], levelIdx: level,
        });
      }
      return level;
    }
    return null;
  }

  // 获取用户各项成就的当前值和等级
  function getUserStats(user) {
    const stats = {};
    // 橘子余额
    const bal = ctx.getBalance(user.id);
    stats['first-1000'] = bal.oranges;
    stats['first-10000'] = bal.oranges;
    // 签到
    stats['checkin-7'] = user.checkInStreak || 0;
    stats['checkin-30'] = user.checkInStreak || 0;
    // 龙虾
    stats['lobster-10'] = user.lobsterTaskCount || 0;
    // 上传
    stats['uploader'] = user.uploadCount || 0;
    // 头像
    stats['avatar-set'] = user.avatar ? 1 : 0;
    // 数据文件统计
    try {
      const quizFile = path.join(__dirname, 'quiz.json');
      if (fs.existsSync(quizFile)) {
        const qd = JSON.parse(fs.readFileSync(quizFile, 'utf8'));
        const wins = (qd.history || []).filter(h => h.winner === user.id).length;
        stats['daily-quiz'] = wins;
        stats['quiz-master'] = wins;
      }
      const koiFile = path.join(__dirname, 'koi.json');
      if (fs.existsSync(koiFile)) {
        const kd = JSON.parse(fs.readFileSync(koiFile, 'utf8'));
        stats['koi-lucky'] = (kd.today && kd.today.winner === user.id) ? 1 : 0;
      }
      const wishFile = path.join(__dirname, 'wishes.json');
      if (fs.existsSync(wishFile)) {
        const wd = JSON.parse(fs.readFileSync(wishFile, 'utf8'));
        const myWishes = (wd || []).filter(w => w.userId === user.id);
        stats['wish-maker'] = myWishes.length;
        stats['wish-granted'] = myWishes.filter(w => w.granted).length;
      }
      const writingsFile = path.join(__dirname, 'writings.json');
      if (fs.existsSync(writingsFile)) {
        const wd2 = JSON.parse(fs.readFileSync(writingsFile, 'utf8'));
        const myNovels = (wd2 || []).filter(w => w.author === user.username && w.isPublished);
        stats['novel-writer'] = myNovels.length;
        const myCoins = (wd2 || []).reduce((sum, w) => sum + ((w.coins || []).filter(c => c.from === user.username).length), 0);
        stats['novel-coin'] = myCoins;
      }
    } catch (e) {}
    return stats;
  }

  // 获取我的成就（带等级和当前进度）
  app.get('/api/achievements/mine', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = ctx.state.users[username];
    if (!user) return res.status(401).json({ ok: false });

    const stats = getUserStats(user);
    const list = ACHIEVEMENTS.map(a => {
      const value = stats[a.id] || 0;
      const levelIdx = calcLevel(value, a.thresholds);
      const nextThreshold = levelIdx < 4 ? a.thresholds[levelIdx + 1] : null;
      return {
        id: a.id, name: a.name, emoji: a.emoji, desc: a.desc,
        thresholds: a.thresholds,
        currentValue: value,
        levelIdx,
        level: levelIdx >= 0 ? LEVELS[levelIdx] : null,
        nextThreshold,
      };
    });
    const unlockedCount = list.filter(a => a.levelIdx >= 0).length;
    const maxedCount = list.filter(a => a.levelIdx === 4).length;
    res.json({ ok: true, achievements: list, levels: LEVELS, unlockedCount, maxedCount, totalCount: ACHIEVEMENTS.length });
  });

  // 获取全站成就展览
  app.get('/api/achievements/all', (req, res) => {
    const list = ACHIEVEMENTS.map(a => {
      const holders = [];
      for (const uid in achData) {
        const lv = achData[uid][a.id];
        if (lv !== undefined && lv >= 0) {
          const u = Object.values(ctx.state.users).find(x => x.id === uid);
          if (u) holders.push({ name: u.displayName || u.id, level: LEVELS[lv], levelIdx: lv });
        }
      }
      return { ...a, holders, count: holders.length };
    });
    res.json({ ok: true, achievements: list, levels: LEVELS });
  });

  // 手动触发检查（供其他地方调用）
  app.post('/api/achievements/check', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = ctx.state.users[username];
    if (!user) return res.status(401).json({ ok: false });

    const stats = getUserStats(user);
    const leveled = [];
    for (const a of ACHIEVEMENTS) {
      const value = stats[a.id] || 0;
      const lv = checkLevel(user.id, a.id, value);
      if (lv !== null) leveled.push({ name: a.name, level: LEVELS[lv] });
    }
    res.json({ ok: true, leveled });
  });

  // 暴露给其他路由
  ctx.checkAchievement = (userId, achId, value) => checkLevel(userId, achId, value);

  console.log('[成就] 橘子成就系统（带等级）已挂载');
};
