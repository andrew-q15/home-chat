// ============ 贷款系统（金库放贷，利息进金库）============
// 所有 treasury 访问走 ctx.treasury.load() / save()，避免和 treasury-router 内存不同步
const crypto = require('crypto');

module.exports = function setupLoan(app, ctx) {
  const { tokens, state, getBalance, saveLobster, lobsterData, addOrangeLog, io } = ctx;
  if (!ctx.treasury) throw new Error('treasury-router 必须先于 loan-router 挂载');

  const MAX_AMOUNT = 50000;
  const DAILY_RATE = 0.001;
  const OVERDUE_RATE = 0.005;
  const DAY_MS = 24 * 3600 * 1000;

  function calcTermDays(amount) {
    return 3 + (amount * 27) / 50000;
  }

  function calcOwed(loan, now) {
    const actualMs = now - loan.startAt;
    const actualDays = actualMs / DAY_MS;
    const termDays = loan.termDays;
    const interest = loan.amount * DAILY_RATE * actualDays;
    let overdueDays = 0;
    let overduePenalty = 0;
    if (actualDays > termDays) {
      overdueDays = actualDays - termDays;
      overduePenalty = loan.amount * OVERDUE_RATE * overdueDays;
    }
    const owed = loan.amount + interest + overduePenalty;
    return { interest, overdueDays, overduePenalty, owed, actualDays, termDays };
  }

  function fmtLoan(loan, now) {
    const c = calcOwed(loan, now);
    return {
      id: loan.id,
      username: loan.username,
      displayName: loan.displayName,
      amount: loan.amount,
      termDays: Math.round(c.termDays * 100) / 100,
      actualDays: Math.round(c.actualDays * 100) / 100,
      interest: Math.round(c.interest * 100) / 100,
      overdueDays: Math.round(c.overdueDays * 100) / 100,
      overduePenalty: Math.round(c.overduePenalty * 100) / 100,
      owed: Math.round(c.owed * 100) / 100,
      startAt: loan.startAt,
      dueAt: loan.startAt ? loan.startAt + loan.termDays * DAY_MS : null,
      status: loan.status,
      reason: loan.reason,
      createdAt: loan.createdAt,
    };
  }

  // 申请贷款
  app.post('/api/loan/apply', (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const amount = Number((req.body || {}).amount);
    if (isNaN(amount) || amount < 1 || amount > MAX_AMOUNT) return res.json({ ok: false, msg: '借款额 1-50000🍊' });
    const reason = String((req.body || {}).reason || '').slice(0, 200);
    const t = ctx.treasury.load();
    if (!t.loans) t.loans = [];
    const existing = t.loans.find(l => l.userId === user.id && (l.status === 'pending' || l.status === 'active'));
    if (existing) return res.json({ ok: false, msg: '你已有一笔未结清的贷款，先还清再借' });
    const loan = {
      id: 'loan-' + crypto.randomBytes(6).toString('hex'),
      userId: user.id,
      username,
      displayName: user.displayName || username,
      amount,
      termDays: calcTermDays(amount),
      rate: DAILY_RATE,
      overdueRate: OVERDUE_RATE,
      startAt: null,
      status: 'pending',
      reason,
      createdAt: Date.now(),
    };
    t.loans.unshift(loan);
    ctx.treasury.save();
    io.emit('loan_applied', { id: loan.id, username, displayName: loan.displayName, amount });
    console.log('[贷款] ' + username + ' 申请借 ' + amount + '🍊，期限 ' + loan.termDays.toFixed(2) + ' 天');
    res.json({ ok: true, loan: fmtLoan(loan, Date.now()) });
  });

  // 超管审批放款
  app.post('/api/loan/approve/:id', (req, res) => {
    const username = tokens[req.headers.authorization];
    const user = username ? state.users[username] : null;
    if (!user || !user.isSuperAdmin) return res.status(403).json({ ok: false, msg: '仅超管' });
    const t = ctx.treasury.load();
    const loan = (t.loans || []).find(l => l.id === req.params.id);
    if (!loan) return res.status(404).json({ ok: false, msg: '贷款不存在' });
    if (loan.status !== 'pending') return res.json({ ok: false, msg: '已审批过' });
    const target = state.users[loan.username];
    if (!target) return res.json({ ok: false, msg: '借款人不存在' });
    // 放款是金库「支出」，原来写成 income 会让金库凭空多出一笔等于贷款额的钱
    const out = ctx.treasury.spend(loan.amount, '贷款放款《' + loan.id + '》by ' + username, 'loan');
    if (out.ok === false) return res.json({ ok: false, msg: '金库余额不足，无法放款' });
    const bal = getBalance(target.id);
    bal.oranges += loan.amount;
    addOrangeLog(target.id, loan.amount, '贷款放款');
    loan.startAt = Date.now();
    loan.status = 'active';
    saveLobster(lobsterData);
    ctx.treasury.save();
    io.emit('loan_approved', { id: loan.id, username: loan.username, amount: loan.amount });
    console.log('[贷款] 超管 ' + username + ' 批准放款 ' + loan.username + ' ' + loan.amount + '🍊');
    res.json({ ok: true, loan: fmtLoan(loan, Date.now()), oranges: bal.oranges });
  });

  // 拒绝贷款
  app.post('/api/loan/reject/:id', (req, res) => {
    const username = tokens[req.headers.authorization];
    const user = username ? state.users[username] : null;
    if (!user || !user.isSuperAdmin) return res.status(403).json({ ok: false, msg: '仅超管' });
    const t = ctx.treasury.load();
    const loan = (t.loans || []).find(l => l.id === req.params.id);
    if (!loan) return res.status(404).json({ ok: false, msg: '贷款不存在' });
    if (loan.status !== 'pending') return res.json({ ok: false, msg: '已审批过' });
    loan.status = 'rejected';
    ctx.treasury.save();
    io.emit('loan_rejected', { id: loan.id, username: loan.username });
    res.json({ ok: true });
  });

  // 还款
  app.post('/api/loan/repay/:id', (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const t = ctx.treasury.load();
    const loan = (t.loans || []).find(l => l.id === req.params.id);
    if (!loan) return res.status(404).json({ ok: false, msg: '贷款不存在' });
    if (loan.userId !== user.id) return res.status(403).json({ ok: false, msg: '不是你的贷款' });
    if (loan.status !== 'active') return res.json({ ok: false, msg: '贷款状态不对' });
    const now = Date.now();
    const c = calcOwed(loan, now);
    const payAmount = Math.ceil(c.owed);
    const bal = getBalance(user.id);
    if (bal.oranges < payAmount) return res.json({ ok: false, msg: '橘子不足，应还 ' + payAmount + '🍊' });
    bal.oranges -= payAmount;
    addOrangeLog(user.id, -payAmount, '还贷款《' + loan.id + '》本息 ' + payAmount);
    ctx.treasury.income(payAmount, '还贷款《' + loan.id + '》by ' + username + '，利息 ' + c.interest.toFixed(2), 'loan');
    loan.status = 'repaid';
    loan.repaidAt = now;
    loan.repaidAmount = payAmount;
    saveLobster(lobsterData);
    ctx.treasury.save();
    io.emit('loan_repaid', { id: loan.id, username, owed: payAmount, interest: c.interest });
    console.log('[贷款] ' + username + ' 还贷款 ' + payAmount + '🍊（利息 ' + c.interest.toFixed(2) + '，逾期罚息 ' + c.overduePenalty.toFixed(2) + '）');
    res.json({ ok: true, owed: payAmount, interest: c.interest, overduePenalty: c.overduePenalty, oranges: bal.oranges });
  });

  // 我的贷款
  app.get('/api/loan/my', (req, res) => {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const t = ctx.treasury.load();
    const now = Date.now();
    const mine = (t.loans || []).filter(l => l.userId === user.id).map(l => fmtLoan(l, now));
    res.json({ ok: true, loans: mine, balance: getBalance(user.id).oranges });
  });

  // 超管看全部
  app.get('/api/loan/list', (req, res) => {
    const username = tokens[req.headers.authorization];
    const user = username ? state.users[username] : null;
    if (!user || !user.isSuperAdmin) return res.status(403).json({ ok: false, msg: '仅超管' });
    const t = ctx.treasury.load();
    const now = Date.now();
    const all = (t.loans || []).map(l => fmtLoan(l, now)).sort((a, b) => b.createdAt - a.createdAt);
    res.json({ ok: true, loans: all, treasuryOranges: t.oranges });
  });

  // 超管核销坏账
  app.post('/api/loan/writeoff/:id', (req, res) => {
    const username = tokens[req.headers.authorization];
    const user = username ? state.users[username] : null;
    if (!user || !user.isSuperAdmin) return res.status(403).json({ ok: false, msg: '仅超管' });
    const t = ctx.treasury.load();
    const loan = (t.loans || []).find(l => l.id === req.params.id);
    if (!loan) return res.status(404).json({ ok: false, msg: '贷款不存在' });
    if (loan.status === 'written_off') return res.json({ ok: false, msg: '已核销' });
    if (loan.status !== 'active') return res.json({ ok: false, msg: '只有放款中的贷款才能核销' });
    const now = Date.now();
    const c = calcOwed(loan, now);
    loan.status = 'written_off';
    loan.writtenOffAt = now;
    loan.writtenOffBy = username;
    loan.writtenOffOwed = Math.ceil(c.owed);
    if (!t.receivables) t.receivables = [];
    t.receivables.push({
      id: loan.id,
      userId: loan.userId,
      username: loan.username,
      amount: Math.ceil(c.owed),
      writtenOffAt: now,
      writtenOffBy: username,
      note: String((req.body || {}).note || '').slice(0, 200),
    });
    ctx.treasury.save();
    io.emit('loan_written_off', { id: loan.id, username: loan.username, amount: Math.ceil(c.owed) });
    console.log('[贷款] 超管 ' + username + ' 核销坏账 ' + loan.username + ' ' + Math.ceil(c.owed) + '🍊');
    res.json({ ok: true, owed: Math.ceil(c.owed) });
  });

  console.log('[贷款] 贷款系统已挂载（treasury 内存同步版），金库余额 ' + ctx.treasury.getOranges() + ' 🍊');
};
