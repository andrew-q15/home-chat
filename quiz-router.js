// ============ 每日一题 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function setupQuiz(app, ctx) {
  const QUIZ_FILE = path.join(__dirname, 'quiz.json');
  function loadQuiz() {
    try { return JSON.parse(fs.readFileSync(QUIZ_FILE, 'utf8')); }
    catch { return { today: null, history: [] }; }
  }
  function saveQuiz(d) {
    try { fs.writeFileSync(QUIZ_FILE, JSON.stringify(d, null, 2)); } catch {}
  }
  let quizData = loadQuiz();

  const QUIZ_POOL = [
    { q: '什么东西越洗越脏？', a: '水' },
    { q: '什么门永远关不上？', a: '球门' },
    { q: '什么东西有头无脚？', a: '砖头' },
    { q: '什么布剪不断？', a: '瀑布' },
    { q: '什么东西天气越热爬得越高？', a: '温度计' },
    { q: '什么蛋打不烂煮不熟？', a: '脸蛋' },
    { q: '什么车子寸步难行？', a: '风车' },
    { q: '什么书在书店买不到？', a: '秘书' },
    { q: '什么东西打破了才能用？', a: '鸡蛋' },
    { q: '什么路最窄？', a: '冤家路' },
    { q: '什么东西晚上才会长出尾巴？', a: '流星' },
    { q: '什么水永远用不完？', a: '泪水' },
    { q: '什么东西有眼睛却看不见？', a: '针' },
    { q: '什么动物最没有方向感？', a: '麋鹿' },
    { q: '什么东西越分享越多？', a: '快乐' },
    { q: '什么花不能摘？', a: '火花' },
    { q: '什么马不会跑？', a: '木马' },
    { q: '什么帽子不能戴？', a: '螺丝帽' },
    { q: '什么东西越擦越小？', a: '橡皮擦' },
    { q: '什么衣服永远穿不上？', a: '画上的衣服' },
  ];

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function newQuiz() {
    // 去重：排除最近 5 个不同日期出过的所有题面（严格按「5 天」语义）
    const hist = quizData.history || [];
    const seenDates = [];
    for (const h of hist) {
      if (h.date && !seenDates.includes(h.date)) seenDates.push(h.date);
      if (seenDates.length >= 5) break;
    }
    const recent5Days = new Set(seenDates);
    const excludeSet = new Set(
      hist.filter(h => recent5Days.has(h.date)).map(h => h.question)
    );
    const pool = QUIZ_POOL.filter(item => !excludeSet.has(item.q));
    const candidates = pool.length > 0 ? pool : QUIZ_POOL;
    const q = candidates[Math.floor(Math.random() * candidates.length)];
    quizData.today = {
      id: 'quiz-' + crypto.randomBytes(4).toString('hex'),
      date: todayStr(), question: q.q, answer: q.a,
      winner: null, winnerAt: null, createdAt: Date.now(),
    };
    quizData.history.unshift({ ...quizData.today });
    if (quizData.history.length > 30) quizData.history = quizData.history.slice(0, 30);
    saveQuiz(quizData);
    ctx.io.emit('quiz_new', { question: q.q, date: quizData.today.date });
    console.log('[每日一题] 今日题目：' + q.q);
  }

  app.get('/api/quiz/today', (req, res) => {
    if (!quizData.today) return res.json({ ok: true, quiz: null });
    const t = quizData.today;
    res.json({ ok: true, quiz: {
      id: t.id, date: t.date, question: t.question,
      answered: !!t.winner, winner: t.winner,
      winnerName: t.winner ? ((ctx.state.users[t.winner] || {}).displayName || t.winner) : null,
    }});
  });

  app.post('/api/quiz/answer', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
    const user = ctx.state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    if (!quizData.today) return res.json({ ok: false, msg: '今天还没出题' });
    if (quizData.today.winner) return res.json({ ok: false, msg: '已经有人答对了' });
    const ans = String((req.body || {}).answer || '').trim();
    if (!ans) return res.json({ ok: false, msg: '答案不能为空' });
    if (!ans.includes(quizData.today.answer) && !quizData.today.answer.includes(ans)) {
      return res.json({ ok: false, msg: '答错啦，再想想' });
    }
    quizData.today.winner = username;
    quizData.today.winnerAt = Date.now();
    saveQuiz(quizData);
    const bal = ctx.getBalance(user.id);
    bal.oranges += 100;
    ctx.saveLobster(ctx.lobsterData);
    if (ctx.addOrangeLog) ctx.addOrangeLog(user.id, 100, '每日一题答对');
    ctx.io.emit('quiz_won', { username, displayName: user.displayName || username, answer: quizData.today.answer, reward: 100 });
    console.log('[每日一题] ' + username + ' 答对，+100🍊');
    res.json({ ok: true, reward: 100, oranges: bal.oranges });
  });

  app.post('/api/quiz/new', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = ctx.state.users[username];
    if (!user || !(user.isSuperAdmin || username === 'mac')) return res.json({ ok: false, msg: '只有老板能出题' });
    newQuiz();
    res.json({ ok: true });
  });

  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 7 && now.getMinutes() === 0) {
      if (!quizData.today || quizData.today.date !== todayStr()) newQuiz();
    }
  }, 30 * 1000);

  setTimeout(() => {
    if (!quizData.today || quizData.today.date !== todayStr()) newQuiz();
  }, 5000);

  console.log('[每日一题] 每日一题模块已挂载');
};
