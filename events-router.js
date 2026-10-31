const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function setupEventsRouter(app, ctx) {
  // ============ 每日签到 ============
  app.post('/api/checkin', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
    const user = ctx.state.users[username];

    const today = new Date().toISOString().slice(0, 10);
    const last = user.lastCheckIn;
    
    if (last === today) return res.json({ ok: false, msg: '今天已经签过啦，明天再来！' });

    let streak = user.checkInStreak || 0;
    if (last) {
      const diffDays = Math.round((new Date(today) - new Date(last)) / 86400000);
      if (diffDays === 1) streak += 1;
      else streak = 1;
    } else streak = 1;

    user.lastCheckIn = today;
    user.checkInStreak = streak;

    let earn = Math.floor(Math.random() * 11) + 5;
    let isJackpot = false;
    if (streak % 7 === 0) {
      earn += 100; isJackpot = true;
      ctx.io.emit('system_all', '🎉 恭喜 ' + (user.displayName || username) + ' 连续签到 ' + streak + ' 天，触发暴击，获得 100 🍊 大奖！');
    }

    const bal = ctx.getBalance(user.id);
    bal.oranges += earn;
    ctx.saveLobster(ctx.lobsterData);
    ctx.saveState();

    // 签到掉落表情包
    const SYSTEM_STICKERS = ['/system-stickers/orange.svg', '/system-stickers/success.svg', '/system-stickers/whale.svg'];
    const sticker = SYSTEM_STICKERS[Math.floor(Math.random() * SYSTEM_STICKERS.length)];

    res.json({ ok: true, earn, streak, isJackpot, total: bal.oranges, sticker });
  });

  // ============ 赛博盲盒 ============
  const BLINDBOX_TITLES = [
    "橘域网董事长", "赛博首富", "宇宙第一帅", "绝对深蓝", 
    "好事发生", "机房老大", "顶级和牛品鉴师", "深海巨兽"
  ];

  app.post('/api/blindbox/draw', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
    const user = ctx.state.users[username];
    const cost = 500;
    const bal = ctx.getBalance(user.id);
    
    if (bal.oranges < cost) return res.json({ ok: false, msg: '橘子不够，盲盒需要 500 🍊！' });

    bal.oranges -= cost;
    ctx.saveLobster(ctx.lobsterData);

    const title = BLINDBOX_TITLES[Math.floor(Math.random() * BLINDBOX_TITLES.length)];
    user.title = title;
    ctx.saveState();

    const displayName = user.displayName || username;
    const sysMsg = `🎰 欧皇降临！【${displayName}】开启赛博盲盒，抽中了绝版头衔：【${title}】！`;
    ctx.pushMessage(ctx.state.channels[0] || '日常', '系统', sysMsg, { kind: 'system' });
    ctx.io.emit('user_updated', { id: user.id, name: username, displayName: displayName, avatar: user.avatar, title: user.title });

    res.json({ ok: true, title, orangesLeft: bal.oranges });
  });

  console.log('[活动] 签到与盲盒独立模块挂载成功');
};
