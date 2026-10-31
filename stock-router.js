const path = require('path');
const fs = require('fs');

module.exports = function setupStock(app, ctx) {
  const STOCK_FILE = path.join(__dirname, 'stock.json');
  
  // 初始化股票数据
  let stockData = {};
  try { stockData = JSON.parse(fs.readFileSync(STOCK_FILE, 'utf8')); } catch {}

  if (!stockData.stocks) {
    stockData = {
      stocks: {
        'POTATO': { name: '土豆重工', price: 100, trend: 'stable' },
        'BEEF':   { name: '顶级牛肉', price: 250, trend: 'stable' },
        'GINGER': { name: '生姜科技', price: 10,  trend: 'stable' },
        'LOBSTER':{ name: '深海龙虾', price: 500, trend: 'stable' }
      },
      portfolios: {} // { userId: { POTATO: { count: 10, cost: 1000 } } }
    };
    saveData();
  }

  function saveData() {
    try { fs.writeFileSync(STOCK_FILE, JSON.stringify(stockData, null, 2)); } catch {}
  }

  // 1. 获取大盘行情与我的持仓
  app.get('/api/stock/market', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = ctx.state.users[username];
    
    res.json({ 
      ok: true, 
      stocks: stockData.stocks, 
      myPortfolio: stockData.portfolios[user.id] || {},
      balance: ctx.getBalance(user.id).oranges
    });
  });

  // 2. 买入
  app.post('/api/stock/buy', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = ctx.state.users[username];
    
    const { code, amount } = req.body || {};
    const stock = stockData.stocks[code];
    if (!stock) return res.json({ ok: false, msg: '股票代码不存在' });
    const count = parseInt(amount, 10);
    if (isNaN(count) || count <= 0) return res.json({ ok: false, msg: '数量不合法' });

    const totalCost = stock.price * count;
    const bal = ctx.getBalance(user.id);
    if (bal.oranges < totalCost) return res.json({ ok: false, msg: `橘子不够，需要 ${totalCost} 🍊` });

    // 扣钱
    bal.oranges -= totalCost;
    if (typeof ctx.addOrangeLog === 'function') ctx.addOrangeLog(user.id, -totalCost, `买入股票 ${code}`);
    ctx.saveLobster(ctx.lobsterData);

    // 记录持仓
    if (!stockData.portfolios[user.id]) stockData.portfolios[user.id] = {};
    if (!stockData.portfolios[user.id][code]) stockData.portfolios[user.id][code] = { count: 0, cost: 0 };
    
    stockData.portfolios[user.id][code].count += count;
    stockData.portfolios[user.id][code].cost += totalCost;
    saveData();

    res.json({ ok: true, msg: `成功买入 ${count} 股【${stock.name}】`, balance: bal.oranges });
  });

  // 3. 卖出
  app.post('/api/stock/sell', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = ctx.state.users[username];
    
    const { code, amount } = req.body || {};
    const stock = stockData.stocks[code];
    if (!stock) return res.json({ ok: false, msg: '股票代码不存在' });
    const count = parseInt(amount, 10);
    if (isNaN(count) || count <= 0) return res.json({ ok: false, msg: '数量不合法' });

    const myPort = stockData.portfolios[user.id] || {};
    if (!myPort[code] || myPort[code].count < count) {
      return res.json({ ok: false, msg: '你没有这么多这只股票' });
    }

    // 加钱
    const totalEarn = stock.price * count;
    const bal = ctx.getBalance(user.id);
    bal.oranges += totalEarn;
    if (typeof ctx.addOrangeLog === 'function') ctx.addOrangeLog(user.id, totalEarn, `卖出股票 ${code}`);
    ctx.saveLobster(ctx.lobsterData);

    // 扣减持仓
    myPort[code].count -= count;
    if (myPort[code].count === 0) delete myPort[code];
    saveData();

    res.json({ ok: true, msg: `成功卖出 ${count} 股【${stock.name}】，赚了 ${totalEarn} 🍊`, balance: bal.oranges });
  });

  // ==========================================
  // 4. 赛博股市熔断与波动引擎 (每分钟自动运行)
  // ==========================================
  setInterval(() => {
    let changed = false;
    for (const code in stockData.stocks) {
      const stock = stockData.stocks[code];
      // 随机波动 -8% 到 +8%
      const percent = (Math.random() * 16 - 8) / 100;
      const oldPrice = stock.price;
      
      stock.price = Math.max(1, Math.round(stock.price * (1 + percent)));
      stock.trend = percent > 0 ? 'up' : (percent < 0 ? 'down' : 'stable');
      
      if (stock.price !== oldPrice) changed = true;
    }
    if (changed) saveData();
  }, 60 * 1000); // 1 分钟刷新一次

  console.log('[金融] 赛博股票交易所已挂载');
};
