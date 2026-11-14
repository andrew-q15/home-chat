// ============ 赛博彩票 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function setupLotteryGame(app, ctx) {
  const FILE = path.join(__dirname, 'lottery-game.json');
  function load() {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
    catch { return { current: null, history: [] }; }
  }
  function save(d) {
    try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch {}
  }
  let data = load();

  function newRound() {
    const reds = [];
    while (reds.length < 6) {
      const n = Math.floor(Math.random() * 33) + 1;
      if (!reds.includes(n)) reds.push(n);
    }
    reds.sort((a, b) => a - b);
    const blue = Math.floor(Math.random() * 16) + 1;
    data.current = {
      id: 'lg-' + crypto.randomBytes(4).toString('hex'),
      roundNo: ((data.history[0] || {}).roundNo || 0) + 1,
      winning: { reds, blue },
      prizePool: 0, tickets: [], drawnAt: null, createdAt: Date.now(),
    };
    save(data);
    ctx.io.emit('lottery_game_new', { roundNo: data.current.roundNo });
    console.log('[赛博彩票] 第 ' + data.current.roundNo + ' 期开售');
  }

  if (!data.current) newRound();

  app.get('/api/lottery-game/current', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    const user = username ? ctx.state.users[username] : null;
    if (!data.current) return res.json({ ok: true, current: null });
    const c = data.current;
    const myTickets = user ? c.tickets.filter(t => t.userId === user.id) : [];
    res.json({ ok: true, current: {
      roundNo: c.roundNo, prizePool: c.prizePool, ticketCount: c.tickets.length,
      myTickets: myTickets.map(t => ({ id: t.id, reds: t.reds, blue: t.blue, time: t.time })),
      drawn: !!c.drawnAt,
    }});
  });

  app.post('/api/lottery-game/buy', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = ctx.state.users[username];
    if (!data.current) return res.json({ ok: false, msg: '当前没有开售' });
    if (data.current.drawnAt) return res.json({ ok: false, msg: '已开奖，等下一期' });
    const bal = ctx.getBalance(user.id);
    const price = 10;
    if (bal.oranges < price) return res.json({ ok: false, msg: '橘子不够（一注 10🍊）' });
    let reds = (req.body || {}).reds;
    let blue = Number((req.body || {}).blue);
    if (!Array.isArray(reds) || reds.length !== 6) {
      reds = [];
      while (reds.length < 6) {
        const n = Math.floor(Math.random() * 33) + 1;
        if (!reds.includes(n)) reds.push(n);
      }
      reds.sort((a, b) => a - b);
    } else {
      reds = reds.map(Number).filter(n => n >= 1 && n <= 33);
      if (reds.length !== 6) return res.json({ ok: false, msg: '红球要 6 个 1~33' });
    }
    if (!blue || blue < 1 || blue > 16) blue = Math.floor(Math.random() * 16) + 1;
    bal.oranges -= price;
    ctx.saveLobster(ctx.lobsterData);
    data.current.prizePool += price;
    data.current.tickets.push({ id: 'tk-' + crypto.randomBytes(4).toString('hex'), userId: user.id, username, reds, blue, time: Date.now() });
    save(data);
    console.log('[赛博彩票] ' + username + ' 买一注，奖池 ' + data.current.prizePool);
    res.json({ ok: true, reds, blue, oranges: bal.oranges, prizePool: data.current.prizePool });
  });

  function draw() {
    if (!data.current || data.current.drawnAt) return;
    const c = data.current;
    c.drawnAt = Date.now();
    const win = c.winning;
    const results = [];
    for (const t of c.tickets) {
      const hitRed = t.reds.filter(n => win.reds.includes(n)).length;
      const hitBlue = t.blue === win.blue;
      let prize = 0, level = '';
      if (hitRed === 6 && hitBlue) { prize = c.prizePool; level = '头奖'; }
      else if (hitRed === 6) { prize = Math.floor(c.prizePool * 0.3); level = '二等奖'; }
      else if (hitRed === 5 && hitBlue) { prize = Math.floor(c.prizePool * 0.15); level = '三等奖'; }
      else if (hitRed === 5 || (hitRed === 4 && hitBlue)) { prize = 50; level = '四等奖'; }
      else if (hitRed === 4 || (hitRed === 3 && hitBlue)) { prize = 10; level = '五等奖'; }
      if (prize > 0) {
        const b = ctx.getBalance(t.userId);
        b.oranges += prize;
        ctx.saveLobster(ctx.lobsterData);
        results.push({ username: t.username, reds: t.reds, blue: t.blue, hitRed, hitBlue, prize, level });
      }
    }
    // 保底规则：按每个用户本期买注数，确保最低奖金
    const buyCount = {};
    for (const t of c.tickets) buyCount[t.userId] = (buyCount[t.userId] || 0) + 1;
    for (const uid in buyCount) {
      const n = buyCount[uid];
      const minPrize = n >= 10 ? 50 : (n >= 5 ? 10 : 0);
      if (minPrize <= 0) continue;
      // 算这个用户本期已中多少
      const uTickets = c.tickets.filter(t => t.userId === uid);
      let already = 0;
      for (const r of results) {
        if (uTickets.some(t => t.username === r.username)) already += r.prize;
      }
      if (already >= minPrize) continue;
      // 补差价
      const topUp = minPrize - already;
      const b = ctx.getBalance(uid);
      b.oranges += topUp;
      ctx.saveLobster(ctx.lobsterData);
      const u = Object.values(ctx.state.users).find(x => x.id === uid);
      results.push({
        username: u ? u.displayName || u.id : uid,
        reds: [], blue: 0, hitRed: 0, hitBlue: false,
        prize: topUp, level: '保底', isGuarantee: true,
      });
    }

    data.history.unshift({ ...c });
    if (data.history.length > 20) data.history = data.history.slice(0, 20);
    save(data);
    ctx.io.emit('lottery_game_draw', { roundNo: c.roundNo, winning: win, results, prizePool: c.prizePool });
    console.log('[赛博彩票] 第 ' + c.roundNo + ' 期开奖，中奖 ' + results.length + ' 注');
    setTimeout(newRound, 3000);
  }

  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 21 && now.getMinutes() === 0) {
      if (data.current && !data.current.drawnAt) draw();
    }
  }, 30 * 1000);

  app.post('/api/lottery-game/draw', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = ctx.state.users[username];
    if (!user || !(user.isSuperAdmin || username === 'mac')) return res.json({ ok: false, msg: '只有老板能开奖' });
    if (!data.current || data.current.drawnAt) return res.json({ ok: false, msg: '还没到开奖时候' });
    draw();
    res.json({ ok: true });
  });

  app.get('/api/lottery-game/history', (req, res) => {
    res.json({ ok: true, history: data.history.slice(0, 10).map(h => ({ roundNo: h.roundNo, winning: h.winning, prizePool: h.prizePool, drawnAt: h.drawnAt })) });
  });

  console.log('[赛博彩票] 赛博彩票模块已挂载');
};
