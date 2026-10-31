// ============ 老板数据大屏（只读）============
const path = require('path');
const fs = require('fs');

module.exports = function setupStats(app, ctx) {
  const { state, io, lobsterData } = ctx;
  const ROOT = __dirname;

  function readJson(name, fallback) {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8')); }
    catch { return fallback; }
  }

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // 在线数：socket.io 当前连接去重到的用户名
  function onlineCount() {
    if (!io || !io.sockets || !io.sockets.sockets) return 0;
    const names = new Set();
    for (const sock of io.sockets.sockets.values()) {
      const n = sock.data && sock.data.name;
      if (n) names.add(n);
    }
    return names.size;
  }

  app.get('/api/stats/dashboard', (req, res) => {
    try {
      const users = state.users || {};
      const histories = state.histories || {};
      const balances = (lobsterData && lobsterData.balances) || {};

      // 1. 用户 + 在线
      const userTotal = Object.keys(users).length;
      const online = onlineCount();

      // 2. 橘子总量
      let orangeTotal = 0;
      for (const uid in balances) {
        const b = balances[uid];
        if (b && typeof b.oranges === 'number') orangeTotal += b.oranges;
      }
      orangeTotal = Math.round(orangeTotal * 100) / 100;

      // 3. 消息：总数 + 今日 + 近 24 小时分桶
      const now = new Date();
      const today = todayStr();
      const buckets = new Array(24).fill(0);
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const endOfToday = startOfToday + 24 * 3600 * 1000;
      const last24Start = now.getTime() - 24 * 3600 * 1000;

      let msgTotal = 0;
      let msgToday = 0;
      for (const ch in histories) {
        const list = histories[ch] || [];
        msgTotal += list.length;
        for (const m of list) {
          const t = m.time || 0;
          if (t >= startOfToday && t < endOfToday) msgToday++;
          if (t >= last24Start) {
            const hourAgo = Math.floor((now.getTime() - t) / 3600000);
            if (hourAgo >= 0 && hourAgo < 24) {
              const idx = 23 - hourAgo;
              buckets[idx]++;
            }
          }
        }
      }

      // 4. 情报条数（中 / 英）
      const intelCn = readJson('intel.json', []);
      const intelEn = readJson('intel-en.json', []);
      const intelCnCount = Array.isArray(intelCn) ? intelCn.length : 0;
      const intelEnCount = Array.isArray(intelEn) ? intelEn.length : 0;

      // 5. 四支股票
      const stockData = readJson('stock.json', { stocks: {} });
      const stocks = [];
      const stockMap = stockData.stocks || {};
      for (const code in stockMap) {
        const s = stockMap[code] || {};
        stocks.push({
          code,
          name: s.name || code,
          price: typeof s.price === 'number' ? s.price : 0,
          trend: s.trend === 'up' ? 'up' : (s.trend === 'down' ? 'down' : 'stable'),
        });
      }

      // 6. 焦点卡
      const koiData = readJson('koi.json', { today: null });
      const koi = koiData.today ? {
        date: koiData.today.date || '',
        displayName: koiData.today.displayName || koiData.today.winner || '',
      } : null;

      const quizData = readJson('quiz.json', { today: null });
      const quizToday = quizData.today || null;
      const quiz = quizToday ? {
        date: quizToday.date || '',
        question: quizToday.question || '',
        answered: !!quizToday.winner,
        winnerName: quizToday.winner
          ? ((users[quizToday.winner] && users[quizToday.winner].displayName) || quizToday.winner)
          : null,
        isToday: quizToday.date === today,
      } : null;

      const lotteryData = readJson('lottery-game.json', { current: null });
      const lc = lotteryData.current || null;
      const lottery = lc ? {
        roundNo: lc.roundNo || 0,
        prizePool: typeof lc.prizePool === 'number' ? lc.prizePool : 0,
        drawn: !!lc.drawnAt,
      } : null;

      res.json({
        ok: true,
        ts: Date.now(),
        date: today,
        // 平铺字段（与 dashboard.html 对齐）
        users: { total: userTotal, online },
        oranges: { total: orangeTotal },
        messages: {
          total: msgTotal,
          today: msgToday,
          last24Buckets: buckets,
        },
        intel: { cn: intelCnCount, en: intelEnCount, total: intelCnCount + intelEnCount },
        stocks,
        koi, quiz, lottery,
        // 兼容旧嵌套结构（若别处还在读 stats/focus）
        stats: {
          users: { total: userTotal, online },
          oranges: { total: orangeTotal },
          messages: {
            total: msgTotal,
            today: msgToday,
            last24Buckets: buckets,
          },
          intel: { cn: intelCnCount, en: intelEnCount, total: intelCnCount + intelEnCount },
        },
        focus: { koi, quiz, lottery },
      });
    } catch (e) {
      console.error('[大屏] 统计失败:', e.message);
      res.status(500).json({ ok: false, msg: e.message });
    }
  });

  console.log('[大屏] 老板数据大屏模块已挂载');
};
