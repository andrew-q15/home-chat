const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function setupSnacks(app, ctx) {
  const { tokens, state, io, pushMessage, getBalance, saveLobster } = ctx;
  const FOOD_FILE = path.join(__dirname, 'food.json');

  function loadFood() {
    try { return JSON.parse(fs.readFileSync(FOOD_FILE, 'utf8')); }
    catch (e) { return { inventory: {}, recipes: {}, snacks: {}, sharedFeed: [] }; }
  }
  function saveFood(data) {
    try { fs.writeFileSync(FOOD_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
  }

  function getUserId(req) {
    const username = tokens && tokens[req.headers.authorization];
    if (!username) return null;
    const userObj = state && state.users && state.users[username];
    return userObj ? userObj.id : null;
  }

  app.get('/api/snacks/mine', (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, msg: '未登录' });
    const data = loadFood();
    if (!data.snacks) data.snacks = {};
    const list = Object.values(data.snacks).filter(s => s.owner === userId && !s.sharedToFeed);
    res.json({ ok: true, snacks: list });
  });

  app.get('/api/snacks/feed', (req, res) => {
    const data = loadFood();
    if (!data.sharedFeed) data.sharedFeed = [];
    const cutoff = Date.now() - 86400000;
    const feed = data.sharedFeed.filter(s => s.sharedAt > cutoff);
    res.json({ ok: true, feed });
  });

  app.post('/api/snacks/claim', (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, msg: '未登录' });
    const { feedId } = req.body;
    const data = loadFood();
    if (!data.sharedFeed) return res.status(404).json({ ok: false, msg: '没有分享' });
    const idx = data.sharedFeed.findIndex(s => s.id === feedId);
    if (idx === -1) return res.status(404).json({ ok: false, msg: '已被领完' });
    const item = data.sharedFeed[idx];
    if (!item || !item.sharedToFeed) {
      return res.status(400).json({ ok: false, msg: '该零食不可领取' });
    }
    if (item.claimedBy && item.claimedBy.includes(userId)) return res.status(400).json({ ok: false, msg: '你已经领过了' });
    if (!data.snacks) data.snacks = {};
    const copy = { ...item, id: 'snack-' + crypto.randomBytes(4).toString('hex'), owner: userId, sharedToFeed: false };
    delete copy.sharedAt; delete copy.claimedBy; delete copy.sharedBy;
    data.snacks[copy.id] = copy;
    if (!item.claimedBy) item.claimedBy = [];
    item.claimedBy.push(userId);
    if (item.claimedBy.length >= 5) data.sharedFeed.splice(idx, 1);
    saveFood(data);
    if (io) io.emit('snack_update', { action: 'claim', userId });
    res.json({ ok: true, msg: '领取成功：' + item.emoji + ' ' + item.name, snack: copy });
  });

  app.post('/api/snacks/craft', (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, msg: '未登录' });
    const { method, ingredients } = req.body;
    if (!method || !ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ ok: false, msg: '选择加工方式和食材' });
    }
    const snackRecipes = require('./snack-recipes');
    if (!snackRecipes.methods[method]) return res.status(400).json({ ok: false, msg: '未知加工方式' });
    const data = loadFood();
    if (!data.inventory) data.inventory = {};
    if (!data.inventory[userId]) data.inventory[userId] = {};
    for (const ing of ingredients) {
      if (!data.inventory[userId][ing] || data.inventory[userId][ing] <= 0) {
        return res.status(400).json({ ok: false, msg: '库存不足: ' + ing });
      }
    }
    let result = null;
    if (ingredients.length >= 2) result = snackRecipes.findLegendaryCombo(method, ingredients);
    if (!result && ingredients.length === 1) result = snackRecipes.findRecipe(method, ingredients[0]);
    console.log('[CRAFT DEBUG] method=', method, 'ingredients=', JSON.stringify(ingredients), 'result=', JSON.stringify(result));
    if (!result) return res.status(400).json({ ok: false, msg: '这个搭配做不出零食，换种组合试试' });
    const resEmoji = result.emoji || result.icon || result.food || result.e || '';
    if (resEmoji && ingredients.length > 1 && ingredients.includes(resEmoji)) {
      return res.status(400).json({ ok: false, msg: '不能拿成品当原料烤自己' });
    }
    if (result.emoji && ingredients.includes(result.emoji)) {
      return res.status(400).json({ ok: false, msg: '不能拿成品当原料烤自己' });
    }
    for (const ing of ingredients) {
      data.inventory[userId][ing]--;
      if (data.inventory[userId][ing] <= 0) delete data.inventory[userId][ing];
    }
    if (!data.snacks) data.snacks = {};
    const snack = {
      id: 'snack-' + crypto.randomBytes(4).toString('hex'),
      owner: userId,
      emoji: result.emoji,
      name: result.name,
      rarity: result.rarity,
      craftedFrom: ingredients,
      recipe: method,
      desc: result.buff ? result.buff.desc : '',
      createdAt: Date.now(),
      buff: result.buff || null,
      sharedToFeed: false,
    };
    data.snacks[snack.id] = snack;
    saveFood(data);
    if (io) io.emit('snack_update', { action: 'craft', userId });
    res.json({ ok: true, snack, msg: '做出 ' + result.emoji + ' ' + result.name + '！' });
  });

  app.post('/api/snacks/share-to-feed', (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, msg: '未登录' });
    const { snackId } = req.body;
    const data = loadFood();
    if (!data.snacks || !data.snacks[snackId]) return res.status(404).json({ ok: false, msg: '找不到' });
    const snack = data.snacks[snackId];
    if (snack.owner !== userId) return res.status(403).json({ ok: false, msg: '不是你的' });
    if (!data.sharedFeed) data.sharedFeed = [];
    const feedItem = { ...snack, id: 'feed-' + crypto.randomBytes(4).toString('hex'), sharedBy: userId, sharedAt: Date.now(), claimedBy: [] };
    data.sharedFeed.push(feedItem);
    delete data.snacks[snackId];
    saveFood(data);
    if (io) { io.emit('snack_update', { action: 'share_feed' }); }
    if (typeof pushMessage === 'function') {
      var ch = (state && state.channels && state.channels[0]) || '橙子夜聊';
      var uname = (function(){ var keys = Object.keys(state && state.users || {}); for (var i=0;i<keys.length;i++){ if(state.users[keys[i]].id===userId) return keys[i]; } return '系统'; })();
      pushMessage(ch, uname, '分享了零食 ' + feedItem.emoji + ' ' + feedItem.name + '！', { kind: 'snack-share', type: 'snack-share', feedId: feedItem.id, snackName: feedItem.name, snackEmoji: feedItem.emoji, rarity: feedItem.rarity });
    }
    const bal = getBalance(userId);
    bal.oranges += 5;
    if (saveLobster) saveLobster(ctx.lobsterData);
    res.json({ ok: true, msg: '已分享到群聊，+5橘子', bonus: 5 });
  });

  app.post('/api/snacks/eat', (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, msg: '未登录' });
    const { snackId } = req.body;
    const data = loadFood();
    if (!data.snacks || !data.snacks[snackId]) return res.status(404).json({ ok: false, msg: '找不到' });
    const snack = data.snacks[snackId];
    if (snack.owner !== userId) return res.status(403).json({ ok: false, msg: '不是你的' });
    if (!state.users[userId]) state.users[userId] = {};
    if (!state.users[userId].buffs) state.users[userId].buffs = [];
    if (snack.buff) {
      state.users[userId].buffs.push({
        type: snack.buff.type, value: snack.buff.value, desc: snack.buff.desc,
        expireAt: Date.now() + snack.buff.duration, fromSnack: snack.name,
      });
    }
    delete data.snacks[snackId];
    saveFood(data);
    if (io) io.emit('snack_update', { action: 'eat', userId });
    res.json({ ok: true, msg: '吃了 ' + snack.emoji + ' ' + snack.name, buff: snack.buff });
  });

  app.get('/api/snacks/buffs', (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, msg: '未登录' });
    const user = state.users[userId] || {};
    const buffs = (user.buffs || []).filter(b => b.expireAt > Date.now());
    res.json({ ok: true, buffs });
  });

  app.get('/api/snacks/my-inventory', (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, msg: '未登录' });
    const data = loadFood();
    const inv = (data.inventory && data.inventory[userId]) || {};
    res.json({ ok: true, inventory: inv });
  });

  console.log('[零食] 零食展示柜已挂载');
};
