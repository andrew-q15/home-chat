// ============ 赛博拍卖行（全程过金库）============
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

module.exports = function setupAuction(app, ctx) {
  const { tokens, state, getBalance, saveLobster, lobsterData, addOrangeLog, io } = ctx;
  if (!ctx.treasury) throw new Error("treasury-router 必须先于 auction-router 挂载");
  const FILE = path.join(__dirname, "auction.json");
  function load() { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return { ongoing: [], history: [] }; } }
  function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch {} }
  let data = load();
  if (!data.ongoing) data.ongoing = [];
  if (!data.history) data.history = [];
  const timers = new Map();

  function now() { return Date.now(); }
  function fmtTime(ts) { return new Date(ts).toLocaleString("zh-CN"); }

  // 结算一个拍卖
  function settle(auction) {
    const idx = data.ongoing.findIndex(a => a.id === auction.id);
    if (idx === -1) return;
    const a = data.ongoing[idx];
    let result;
    if (!a.bids || a.bids.length === 0) {
      result = { id: a.id, name: a.name, seller: a.seller, finalPrice: 0, buyer: null, sold: false, reason: "流拍", endedAt: now() };
    } else {
      const top = a.bids.slice().sort((x, y) => y.amount - x.amount)[0];
      const finalPrice = top.amount;
      const sellerShare = Math.floor(finalPrice * 0.9);
      const treasuryShare = finalPrice - sellerShare;
      const sellerUser = state.users[a.seller];
      // 先扣金库，成功才给卖家入账：避免金库不足时「钱已加、账没扣」的超发
      // 金库保留 10%（出价时已进金库，这里只扣 90% 给卖家）
      const payout = ctx.treasury.spend(sellerShare, "拍卖成交《" + a.name + "》给卖家 90%", "auction");
      if (payout.ok === false) {
        console.error('[拍卖] 金库余额不足，卖家分成挂账待补:', a.id, sellerShare);
      } else if (sellerUser) {
        const sbal = getBalance(sellerUser.id);
        sbal.oranges += sellerShare;
        addOrangeLog(sellerUser.id, sellerShare, "拍卖成交：《" + a.name + "》90%");
      }
      // 买家余额已在出价时扣了，成交后不再扣
      result = { id: a.id, name: a.name, seller: a.seller, finalPrice, buyer: top.bidder, sold: true, sellerShare, treasuryShare, endedAt: now() };
    }
    saveLobster(lobsterData);
    data.ongoing.splice(idx, 1);
    data.history.unshift(result);
    if (data.history.length > 100) data.history = data.history.slice(0, 100);
    save(data);
    timers.delete(a.id);
    io.emit("auction_sold", result);
    console.log("[拍卖] " + a.name + " 成交：" + (result.sold ? result.finalPrice + " 🍊 给 " + result.buyer : "流拍"));
  }

  function schedule(auction) {
    const remaining = auction.endAt - now();
    if (remaining <= 0) { settle(auction); return; }
    const t = setTimeout(() => settle(auction), remaining);
    t.unref && t.unref();
    timers.set(auction.id, t);
    // 最后 10 秒广播
    const lastWarn = auction.endAt - now() - 10000;
    if (lastWarn > 0) {
      const tw = setTimeout(() => {
        if (data.ongoing.find(a => a.id === auction.id)) {
          io.emit("auction_ending", { id: auction.id, name: auction.name, secondsLeft: 10 });
        }
      }, lastWarn);
      tw.unref && tw.unref();
    }
  }

  // 启动恢复
  data.ongoing.forEach(schedule);

  app.post("/api/auction", (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const { name, desc, startPrice, minutes } = req.body || {};
    const nm = String(name || "").trim();
    if (!nm || nm.length > 50) return res.json({ ok: false, msg: "物品名 1-50 字" });
    const price = Number(startPrice);
    if (isNaN(price) || price < 1) return res.json({ ok: false, msg: "起拍价最低 1🍊" });
    const mins = Number(minutes);
    if (isNaN(mins) || mins < 1 || mins > 10080) return res.json({ ok: false, msg: "时长 1 分钟 ~ 7 天" });
    const auction = {
      id: "auc-" + crypto.randomBytes(6).toString("hex"),
      name: nm, desc: String(desc || "").slice(0, 300),
      seller: username, sellerName: user.displayName || username,
      startPrice: price, endAt: now() + mins * 60000,
      createdAt: now(), bids: [], status: "ongoing"
    };
    data.ongoing.push(auction);
    save(data);
    schedule(auction);
    io.emit("auction_new", auction);
    console.log("[拍卖] " + username + " 挂拍《" + nm + "》起拍 " + price + " 🍊，时长 " + mins + " 分钟");
    res.json({ ok: true, auction });
  });

  app.get("/api/auction/list", (req, res) => {
    res.json({ ok: true, ongoing: data.ongoing, history: data.history.slice(0, 50) });
  });

  app.post("/api/auction/:id/bid", (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const a = data.ongoing.find(x => x.id === req.params.id);
    if (!a) return res.json({ ok: false, msg: "拍卖不存在或已结束" });
    if (a.seller === username) return res.json({ ok: false, msg: "卖家不能给自己出价" });
    const amount = Number((req.body || {}).amount);
    if (isNaN(amount) || amount < 1) return res.json({ ok: false, msg: "出价不合法" });
    const top = a.bids.length ? Math.max.apply(null, a.bids.map(b => b.amount)) : 0;
    if (amount <= top) return res.json({ ok: false, msg: "出价必须 > 当前最高价 " + top + " 🍊" });
    const bal = getBalance(user.id);
    if (bal.oranges < amount) return res.json({ ok: false, msg: "橘子不足（需要 " + amount + " 🍊）" });
    // 1. 扣买家橘子
    bal.oranges -= amount;
    addOrangeLog(user.id, -amount, "拍卖出价《" + a.name + "》");
    // 2. 进金库
    ctx.treasury.income(amount, "拍卖出价《" + a.name + "》by " + username, username);
    // 3. 退前最高价买家（从金库退回）
    if (a.bids.length) {
      const prevTop = a.bids.slice().sort((x, y) => y.amount - x.amount)[0];
      const prevUser = state.users[prevTop.bidder];
      if (prevUser) {
        const pbal = getBalance(prevUser.id);
        pbal.oranges += prevTop.amount;
        addOrangeLog(prevUser.id, prevTop.amount, "拍卖被超价退回《" + a.name + "》");
        ctx.treasury.spend(prevTop.amount, "拍卖退回《" + a.name + "》给 " + prevTop.bidder, "auction");
      }
    }
    a.bids.push({ bidder: username, bidderName: user.displayName || username, amount, time: now() });
    saveLobster(lobsterData);
    save(data);
    io.emit("auction_bid", { id: a.id, name: a.name, bidder: username, bidderName: user.displayName || username, amount, endAt: a.endAt });
    console.log("[拍卖] " + username + " 出价 " + amount + " 🍊 拍《" + a.name + "》");
    res.json({ ok: true, amount, oranges: bal.oranges });
  });

  console.log("[拍卖] 赛博拍卖行已挂载，进行中 " + data.ongoing.length + " 件");
};
