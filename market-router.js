const path = require('path');
const express = require('express');
const crypto = require('crypto');

module.exports = function setupMarket(app, ctx) {
  const { tokens, state, foodData, saveFood, getBalance, saveLobster, lobsterData } = ctx;
  
  // 全局交易行数据：必须落盘，否则重启后「已扣食材、货架没了」
  const FOOD_MARKET_FILE = path.join(__dirname, 'food-market.json');
  function loadFoodMarket() {
    try { const d = JSON.parse(fs.readFileSync(FOOD_MARKET_FILE, 'utf8')); return Array.isArray(d) ? d : []; }
    catch (e) { return []; }
  }
  function saveFoodMarket() {
    try { fs.writeFileSync(FOOD_MARKET_FILE, JSON.stringify(foodMarket, null, 2)); } catch (e) {}
  }
  let foodMarket = loadFoodMarket();

  // 获取货架
  app.get('/api/food/market', (req, res) => {
    res.json({ ok: true, market: foodMarket });
  });

  // 上架
  app.post('/api/food/market/sell', (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    const { emoji, price } = req.body || {};
    const p = Number(price);
    
    if (!foodData.inventory[user.id] || !foodData.inventory[user.id][emoji]) {
      return res.json({ ok: false, msg: '你没有这个食材' });
    }
    if (isNaN(p) || p <= 0) return res.json({ ok: false, msg: '价格不合法' });

    // 扣除食材
    foodData.inventory[user.id][emoji]--;
    if (foodData.inventory[user.id][emoji] <= 0) delete foodData.inventory[user.id][emoji];
    saveFood(foodData);

    // 推入货架
    foodMarket.push({
      id: 'fm-' + crypto.randomBytes(4).toString('hex'),
      sellerId: user.id,
      sellerName: user.displayName || username,
      emoji,
      price: p,
      time: Date.now()
    });
    saveFoodMarket();
    res.json({ ok: true });
  });

  // 购买
  app.post('/api/food/market/buy', (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    const { itemId } = req.body || {};

    const idx = foodMarket.findIndex(i => i.id === itemId);
    if (idx === -1) return res.json({ ok: false, msg: '已经被买走啦' });
    const item = foodMarket[idx];

    if (item.sellerId === user.id) return res.json({ ok: false, msg: '不能买自己的' });

    const buyerBal = getBalance(user.id);
    if (buyerBal.oranges < item.price) return res.json({ ok: false, msg: '橘子不够' });

    // 扣钱加食材
    buyerBal.oranges -= item.price;
    if (!foodData.inventory[user.id]) foodData.inventory[user.id] = {};
    foodData.inventory[user.id][item.emoji] = (foodData.inventory[user.id][item.emoji] || 0) + 1;
    
    // 卖家收钱
    const sellerBal = getBalance(item.sellerId);
    sellerBal.oranges += item.price;

    saveLobster(lobsterData);
    saveFood(foodData);

    foodMarket.splice(idx, 1);
    saveFoodMarket();
    res.json({ ok: true });
  });

  // 系统回收
  app.post('/api/food/market/recycle', (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    const { emoji } = req.body || {};

    if (!foodData.inventory[user.id] || !foodData.inventory[user.id][emoji]) return res.json({ ok: false, msg: '库存不足' });

    const prices = {
      '🥩': 12, '🐟': 18, '🍫': 14, '🦞': 25, '🍖': 25,
      '🍗': 6, '🍤': 7, '🥓': 6, '🍜': 5, '🥤': 6, '🧋': 4,
      '🥦': 5, '🍄': 5, '🍪': 4, '🌽': 3, '🥚': 2, '🧅': 2,
      '🥒': 2, '🥔': 2, '🥬': 1, '🌿': 1, '🫚': 0
    };
    const earn = prices[emoji] || 1;

    foodData.inventory[user.id][emoji]--;
    if (foodData.inventory[user.id][emoji] <= 0) delete foodData.inventory[user.id][emoji];
    
    const bal = getBalance(user.id);
    bal.oranges += earn;
    saveLobster(lobsterData);
    saveFood(foodData);

    res.json({ ok: true, earned: earn });
  });

  console.log('[市场] 食材交易行独立挂载成功');
};
