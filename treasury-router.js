// ============ 中央金库（央行）============
const path = require("path");
const fs = require("fs");

module.exports = function setupTreasury(app, ctx) {
  const { tokens, state, getBalance, saveLobster, lobsterData, io } = ctx;
  const FILE = path.join(__dirname, "treasury.json");
  function load() { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return { oranges: 0, items: {}, stocks: {}, stickers: [], loans: [], receivables: [], history: [] }; } }
  function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch {} }
  let treasury = load();
  if (!treasury.history) treasury.history = [];

  function addHistory(type, amount, reason, by) {
    treasury.history.unshift({ time: Date.now(), type, amount, reason: reason || "", by: by || "system" });
    if (treasury.history.length > 200) treasury.history = treasury.history.slice(0, 200);
    save(treasury);
  }

  // 通用支出：金库扣减，返回是否成功
  function spend(amount, reason, by) {
    const a = Number(amount);
    if (isNaN(a) || a <= 0) return { ok: false, msg: "金额不合法" };
    if (treasury.oranges < a) return { ok: false, msg: "金库余额不足（当前 " + treasury.oranges + " 🍊）" };
    treasury.oranges -= a;
    addHistory("spend", -a, reason, by);
    return { ok: true, oranges: treasury.oranges };
  }

  // 通用收入：金库增加
  function income(amount, reason, by) {
    const a = Number(amount);
    if (isNaN(a) || a <= 0) return { ok: false, msg: "金额不合法" };
    treasury.oranges += a;
    addHistory("income", a, reason, by);
    return { ok: true, oranges: treasury.oranges };
  }

  ctx.treasury = { spend, income, getOranges: () => treasury.oranges, load: () => treasury };

  app.get("/api/treasury", (req, res) => {
    const username = tokens[req.headers.authorization];
    const user = username ? state.users[username] : null;
    const isSuper = !!(user && user.isSuperAdmin);
    res.json({
      ok: true,
      oranges: treasury.oranges,
      items: isSuper ? treasury.items : {},
      stocks: isSuper ? treasury.stocks : {},
      stickers: isSuper ? treasury.stickers : [],
      loans: isSuper ? treasury.loans : [],
      receivables: isSuper ? treasury.receivables : [],
      history: isSuper ? treasury.history.slice(0, 50) : [],
      isSuper
    });
  });

  app.post("/api/treasury/deposit", (req, res) => {
    const username = tokens[req.headers.authorization];
    const user = username ? state.users[username] : null;
    if (!user || !user.isSuperAdmin) return res.status(403).json({ ok: false, msg: "仅超管可操作" });
    const amount = Number((req.body || {}).amount);
    if (isNaN(amount) || amount <= 0) return res.json({ ok: false, msg: "金额不合法" });
    const r = income(amount, (req.body || {}).reason || "超管充值", username);
    if (r.ok && io) io.emit("treasury_updated", { oranges: treasury.oranges });
    res.json(r);
  });

  app.post("/api/treasury/withdraw", (req, res) => {
    const username = tokens[req.headers.authorization];
    const user = username ? state.users[username] : null;
    if (!user || !user.isSuperAdmin) return res.status(403).json({ ok: false, msg: "仅超管可操作" });
    const amount = Number((req.body || {}).amount);
    const r = spend(amount, (req.body || {}).reason || "超管提取", username);
    if (r.ok && io) io.emit("treasury_updated", { oranges: treasury.oranges });
    res.json(r);
  });

  console.log("[金库] 中央金库模块已挂载，当前余额 " + treasury.oranges + " 🍊");
};
