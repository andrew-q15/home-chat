// ============ 龙虾桥接层 ============
// 提供给 home-chat server.js 挂载的路由
const path = require('path');
const fs = require('fs');

module.exports = function setupLobsterBridge(app, ctx) {
  // ctx 会传入：{ tokens, state, lobsterData, saveLobster, getBalance, ORANGE_DEFAULT }

  // 中间件：验证 token
  // 说明：ctx.tokens 是 state.tokens 的浅拷贝（server.js:238），
  // 其值是 userId（如 '1'/'mac'/'爸爸'），与 state.users 的键同源，可直接用。
  function auth(req, res, next) {
    const token = req.headers.authorization;
    const userId = (ctx.tokens && ctx.tokens[token]) !== undefined
      ? ctx.tokens[token]
      : (ctx.state && ctx.state.tokens && ctx.state.tokens[token]);
    if (!userId) return res.status(401).json({ ok: false, msg: '未登录' });
    req.userId = userId;
    req.username = userId;
    req.user = (ctx.state && ctx.state.users && ctx.state.users[userId]) || { id: userId, name: userId };
    next();
  }

  // 中间件：验证超管
  function authSuper(req, res, next) {
    if (!req.user || !req.user.isSuperAdmin) {
      return res.status(403).json({ ok: false, msg: '只有超级管理员能操作' });
    }
    next();
  }

  // ============ 查我的余额 ============
  app.get('/api/lobster/balance', auth, (req, res) => {
    const userId = (req.user && req.user.id) || req.username;
    if (!userId) return res.status(401).json({ ok: false, msg: '身份异常' });
    const bal = ctx.getBalance(userId);
    res.json({
      ok: true,
      oranges: bal.oranges,
      totalSpent: bal.totalSpent || 0,
    });
  });

  // ============ 我的历史 ============
  app.get('/api/lobster/history', auth, (req, res) => {
    const list = (ctx.lobsterData.history || [])
      .filter(h => h.userId === req.user.id)
      .slice(-50)
      .reverse();
    res.json({ ok: true, history: list });
  });

  // ============ 超管：加橘子 ============
  app.post('/api/lobster/admin/add', auth, authSuper, (req, res) => {
    const targetName = String((req.body && req.body.username) || '').trim();
    const amount = Number(req.body && req.body.amount);
    if (!targetName || !ctx.state.users[targetName]) {
      return res.status(400).json({ ok: false, msg: '目标用户不存在' });
    }
    if (isNaN(amount) || amount === 0) {
      return res.status(400).json({ ok: false, msg: '数量无效' });
    }
    const target = ctx.state.users[targetName];
    const bal = ctx.getBalance(target.id);
    // 超管受信任：允许负数（销账）
    bal.oranges = Math.min(ctx.ORANGE_MAX, bal.oranges + amount);
    ctx.saveLobster(ctx.lobsterData);
    console.log('[橘子] ' + req.username + ' 给 ' + targetName + ' 加 ' + amount + '，当前 ' + bal.oranges);
    res.json({ ok: true, oranges: bal.oranges });
  });

  // ============ 超管：直接设置 ============
  app.post('/api/lobster/admin/set', auth, authSuper, (req, res) => {
    const targetName = String((req.body && req.body.username) || '').trim();
    const amount = Number(req.body && req.body.amount);
    if (!targetName || !ctx.state.users[targetName]) {
      return res.status(400).json({ ok: false, msg: '目标用户不存在' });
    }
    if (isNaN(amount) || amount < 0) {
      return res.status(400).json({ ok: false, msg: '数量无效' });
    }
    const target = ctx.state.users[targetName];
    const bal = ctx.getBalance(target.id);
    bal.oranges = amount;
    ctx.saveLobster(ctx.lobsterData);
    console.log('[橘子] ' + req.username + ' 设置 ' + targetName + ' 为 ' + amount);
    res.json({ ok: true, oranges: bal.oranges });
  });

  // ============ 跳蚤市场 ============
const MARKET_FILE = path.join(__dirname, 'market.json');
function loadMarket() {
  try { return JSON.parse(fs.readFileSync(MARKET_FILE, 'utf8')); }
  catch { return { listings: [] }; }
}
function saveMarket(m) {
  try { fs.writeFileSync(MARKET_FILE, JSON.stringify(m, null, 2)); } catch {}
}
let market = loadMarket();
if (!market.listings) market.listings = [];

// 建立两人私聊频道并推送一条消息（用于买卖双方沟通）
function openDmAndNotify(aName, bName, text) {
  const chName = 'DM:' + [aName, bName].sort().join('|');
  if (!ctx.state.channels.includes(chName)) {
    ctx.state.channels.push(chName);
    ctx.state.histories[chName] = [];
  }
  ctx.saveState();
  if (ctx.broadcastChannels) ctx.broadcastChannels();
  if (ctx.pushMessage) ctx.pushMessage(chName, aName, text, { kind: 'user' });
  return chName;
}

// 浏览市场（登录即可；已售出的不再展示）
app.get('/api/market', auth, (req, res) => {
  const list = market.listings
    .filter(l => !l.sold)
    .map(l => {
      const u = ctx.state.users[l.seller];
      return {
        id: l.id, title: l.title, desc: l.desc, price: l.price,
        image: l.image || null,
        seller: l.seller, sellerName: (u && u.displayName) || l.seller,
        time: l.time,
      };
    }).sort((a, b) => b.time - a.time);
  res.json({ ok: true, listings: list, myBalance: ctx.getBalance(req.user.id).oranges });
});

// ============ 给开发者打赏 ============
const DEVELOPER_NAME = 'mac'; // 开发者账号

app.get('/api/market/tip-info', auth, (req, res) => {
  const dev = ctx.state.users[DEVELOPER_NAME];
  if (!dev) return res.json({ ok: true, available: false });
  const tips = (market.tips || []).slice(-10).reverse();
  const total = (market.tips || []).reduce((s, t) => s + t.amount, 0);
  res.json({
    ok: true,
    available: true,
    developer: (dev.displayName && dev.displayName !== DEVELOPER_NAME) ? dev.displayName : DEVELOPER_NAME,
    total: total,
    recent: tips.map(t => ({ from: t.from, amount: t.amount, time: t.time })),
  });
});

app.post('/api/market/tip', auth, (req, res) => {
  const dev = ctx.state.users[DEVELOPER_NAME];
  if (!dev) return res.status(400).json({ ok: false, msg: '开发者账号不存在' });
  const amount = Number(req.body && req.body.amount);
  if (isNaN(amount) || amount <= 0 || amount > 10000000) {
    return res.status(400).json({ ok: false, msg: '金额无效' });
  }
  const me = ctx.state.users[req.username];
  if (req.username === DEVELOPER_NAME) return res.status(400).json({ ok: false, msg: '不能打赏自己' });
  const myBal = ctx.getBalance(me.id);
  if (myBal.oranges < amount) return res.status(400).json({ ok: false, msg: '橘子不够' });
  const devBal = ctx.getBalance(dev.id);

  myBal.oranges -= amount;
  devBal.oranges = Math.min(ctx.ORANGE_MAX, devBal.oranges + amount);
  if (!market.tips) market.tips = [];
  market.tips.push({ from: req.username, amount, time: Date.now() });
  if (market.tips.length > 500) market.tips = market.tips.slice(-500);
  ctx.saveLobster(ctx.lobsterData);
  saveMarket(market);
  console.log('[打赏] ' + req.username + ' → ' + DEVELOPER_NAME + '：' + amount + ' 🍊');
  res.json({ ok: true, oranges: myBal.oranges, total: market.tips.reduce((s, t) => s + t.amount, 0) });
});

// 发布商品
app.post('/api/market', auth, (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const desc = String(body.desc || '').trim();
  const price = Number(body.price);
  const image = String(body.image || '').trim() || null;
  if (!title || title.length > 30) return res.status(400).json({ ok: false, msg: '标题 1-30 字' });
  if (desc.length > 300) return res.status(400).json({ ok: false, msg: '描述最多 300 字' });
  if (isNaN(price) || price < 0 || price > ctx.ORANGE_MAX) return res.status(400).json({ ok: false, msg: '价格无效（最高 ' + ctx.ORANGE_MAX + ' 🍊）' });
  if (image && !image.startsWith('/uploads/') && !image.startsWith('/avatars/')) {
    return res.status(400).json({ ok: false, msg: '图片地址不合法' });
  }
  const item = {
    id: 'mk-' + require('crypto').randomBytes(4).toString('hex'),
    seller: req.username, title, desc, price, image,
    time: Date.now(), sold: false, soldTo: null, soldAt: null,
  };
  market.listings.push(item);
  if (market.listings.length > 500) market.listings = market.listings.slice(-500);
  saveMarket(market);
  console.log('[市场] ' + req.username + ' 上架「' + title + '」' + price + ' 🍊');
  res.json({ ok: true, item });
});

// 购买：扣买家、加卖家、标记售出、自动建私聊
app.post('/api/market/:id/buy', auth, (req, res) => {
  const item = market.listings.find(l => l.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, msg: '商品不存在' });
  if (item.sold) return res.status(400).json({ ok: false, msg: '已经卖掉了' });
  if (item.seller === req.username) return res.status(400).json({ ok: false, msg: '不能买自己的东西' });
  const buyer = ctx.state.users[req.username];
  const seller = ctx.state.users[item.seller];
  if (!buyer || !seller) return res.status(400).json({ ok: false, msg: '账号异常' });

  const buyerBal = ctx.getBalance(buyer.id);
  if (buyerBal.oranges < item.price) {
    return res.status(400).json({ ok: false, msg: '橘子不够（需要 ' + item.price + ' 🍊）' });
  }
  const sellerBal = ctx.getBalance(seller.id);

  // 交易税 5% 进金库
  const tax = Math.floor(item.price * 0.05);
  const sellerGet = item.price - tax;
  buyerBal.oranges -= item.price;
  sellerBal.oranges = Math.min(ctx.ORANGE_MAX, sellerBal.oranges + sellerGet);
  if (tax > 0) {
    try {
      const TF = path.join(__dirname, 'treasury.json');
      let t = { oranges: 0, history: [] };
      try { t = JSON.parse(fs.readFileSync(TF, 'utf8')); } catch (e) {}
      t.oranges = (t.oranges || 0) + tax;
      if (t.history === undefined) t.history = [];
      t.history.unshift({ time: Date.now(), type: 'tax', amount: tax, reason: '跳蚤市场交易税《' + item.title + '》', by: 'market' });
      if (t.history.length > 200) t.history = t.history.slice(0, 200);
      fs.writeFileSync(TF, JSON.stringify(t, null, 2));
      console.log('[税] 跳蚤市场《' + item.title + '》成交 ' + item.price + ' 🍊，税 ' + tax + ' 🍊 进金库');
    } catch (e) { console.error('[税] 写金库失败:', e.message); }
  }
  item.sold = true;
  item.soldTo = req.username;
  item.soldAt = Date.now();
  ctx.saveLobster(ctx.lobsterData);
  saveMarket(market);

  // 自动建立买卖双方私聊并通知
  const dm = openDmAndNotify(req.username, item.seller,
    '🛒 我在跳蚤市场购买了你的「' + item.title + '」，已支付 ' + item.price + ' 🍊。约个线下交易吧！');
  console.log('[市场] ' + req.username + ' 买了 ' + item.seller + ' 的「' + item.title + '」（' + item.price + ' 🍊）');

  res.json({
    ok: true,
    oranges: buyerBal.oranges,
    dmChannel: dm,
    sellerName: (ctx.state.users[item.seller] && ctx.state.users[item.seller].displayName) || item.seller,
  });
});

// 下架（卖家本人或管理员）
app.delete('/api/market/:id', auth, (req, res) => {
  const idx = market.listings.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false });
  const item = market.listings[idx];
  if (item.seller !== req.username && !req.user.isAdmin && !req.user.isSuperAdmin) {
    return res.status(403).json({ ok: false, msg: '只能下架自己的商品' });
  }
  market.listings.splice(idx, 1);
  saveMarket(market);
  res.json({ ok: true });
});

console.log('[市场] 跳蚤市场已挂载');

// ============ 所有人：查看用户余额（超管用） ============
  app.get('/api/lobster/admin/users', auth, authSuper, (req, res) => {
    const list = Object.keys(ctx.state.users).map(uname => {
      const u = ctx.state.users[uname];
      const bal = ctx.getBalance(u.id);
      return { 
        name: uname, 
        oranges: bal.oranges, 
        totalSpent: bal.totalSpent || 0,
        isVip: !!u.vipTokenRate,
        isElder: !!u.isElderMode,
        customDiscount: u.customDiscount !== undefined ? u.customDiscount : 1
      };
    });
    res.json({ ok: true, users: list });
  });

  // ============ 橘子商店：动态对话框皮肤 ============
  const SKINS = {
    neon:    { name: '霓虹',   price: 200,  emoji: '💜' },
    rainbow: { name: '彩虹',   price: 500,  emoji: '🌈' },
    gold:    { name: '土豪金', price: 1000, emoji: '👑' },
  };

  app.get('/api/shop/skins', auth, (req, res) => {
    const u = req.user;
    const mySkin = u.skin || null;
    res.json({
      ok: true,
      myBalance: ctx.getBalance(u.id).oranges,
      mySkin,
      skins: Object.keys(SKINS).map(k => ({
        id: k, name: SKINS[k].name, price: SKINS[k].price,
        emoji: SKINS[k].emoji, owned: mySkin === k,
      })),
    });
  });

  app.post('/api/shop/buy', auth, (req, res) => {
    const id = String((req.body && req.body.skin) || '');
    if (!SKINS[id]) return res.status(400).json({ ok: false, msg: '皮肤不存在' });
    const u = req.user;
    if (ctx.getBalance(u.id).oranges < 0) return res.status(403).json({ ok: false, msg: '欠账中，先还清债务再用橘子功能' });
    if (u.skin === id) return res.json({ ok: false, msg: '你已经拥有这个皮肤了' });
    const bal = ctx.getBalance(u.id);
    if (bal.oranges < 0) return res.status(403).json({ ok: false, msg: '欠账中，先还清债务再买皮肤' });
    if (bal.oranges < SKINS[id].price) {
      return res.status(400).json({ ok: false, msg: '橘子不够（需要 ' + SKINS[id].price + ' 🍊）' });
    }
    bal.oranges -= SKINS[id].price;
    u.skin = id;
    ctx.saveLobster(ctx.lobsterData);
    ctx.saveState();
    if (ctx.io) {
      ctx.io.emit('user_updated', {
        id: u.id, name: req.username,
        displayName: u.displayName || req.username,
        avatar: u.avatar || null,
        skin: u.skin,
      });
    }
    console.log('[商店] ' + req.username + ' 买了皮肤 ' + id + '，花费 ' + SKINS[id].price + ' 🍊');
    res.json({ ok: true, skin: id, orangesLeft: bal.oranges });
  });

  // ============ 橘子排行榜 ============
  app.get('/api/leaderboard', auth, (req, res) => {
    const rows = [];
    for (const uname of Object.keys(ctx.state.users)) {
      const u = ctx.state.users[uname];
      const b = ctx.getBalance(u.id);
      rows.push({
        name: uname,
        displayName: u.displayName || uname,
        avatar: u.avatar || null,
        oranges: b.oranges,
        totalSpent: b.totalSpent || 0,
        skin: u.skin || null,
      });
    }
    rows.sort((a, b) => b.oranges - a.oranges);
    res.json({ ok: true, top: rows.slice(0, 10) });
  });

  console.log('[龙虾] 桥接层已挂载');
};
