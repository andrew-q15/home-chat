// drawguess-router.js —— 你画我猜擂台
// 纪律：不动 server.js；自带 Socket 监听；AI 复审失败静默降级，绝不阻塞游戏
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'drawguess.json');
const LOBSTER_FILE = path.join(__dirname, 'lobster.json');
const ROUND_MS = 90 * 1000;
const NEXT_DELAY = 3000;
const REWARD_GUESS = 8;
const REWARD_DRAWER = 3;
const MAX_STROKES = 800;

const BASE_WORDS = ['雨伞','自行车','西瓜','长颈鹿','火锅','电风扇','熊猫','吉他','冰淇淋','洗衣机',
  '彩虹','火箭','螃蟹','台灯','风筝','沙发','牙刷','蛋糕','企鹅','望远镜',
  '蘑菇','闹钟','拖鞋','篮球','热气球','章鱼','口红','梯子','椰子','显微镜',
  '斑马','吸尘器','耳机','跷跷板','向日葵','邮筒','乌龟','爆米花','磁铁','灯笼'];

const BAD_WORDS = ['傻逼','操你','妈的','去死','杀人','色情','裸照','毒品','身份证','银行卡',
  '密码','家庭住址','手机号','电话号码','真实姓名','自杀','炸弹','枪支','约炮','强奸'];

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return { customWords: [], stats: {} }; }
}
function writeData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ''); }
function localBad(s) {
  const t = norm(s);
  return BAD_WORDS.some(function (b) { return t.indexOf(norm(b)) >= 0; });
}

// config.AI1.url 拿不到就当没有 AI；夜间 AI 的教训：AI 不可用不能拖垮主流程
let AI_URL = process.env.AI_URL || null;
try {
  const c = require('./config');
  AI_URL = process.env.AI_URL || (c.AI1 && c.AI1.url) || (c.ai && c.ai.url) || (c.AI && c.AI.url) || null;
} catch (e) { AI_URL = process.env.AI_URL || null; }

// true=通过 / false=拒绝 / null=AI 不可用（降级为仅本地黑名单）
async function aiReview(word) {
  if (!AI_URL) return null;
  try {
    const url = String(AI_URL).replace(/\/+$/, '') + '/v1/chat/completions';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'local',
        messages: [{ role: 'user', content:
          '判断这个词能否作为「你画我猜」题词：要求具体可画，不含真人姓名、隐私信息、色情、暴力、辱骂。只回答 OK 或 NO。词：' + word }],
        temperature: 0, max_tokens: 8, stream: false,
        chat_template_kwargs: { enable_thinking: false }
      }),
      signal: AbortSignal.timeout(10000)
    });
    const j = await r.json();
    const t = String(((((j.choices || [])[0] || {}).message || {}).content) || '');
    if (/NO/i.test(t)) return false;
    if (/OK/i.test(t)) return true;
    return null;
  } catch (e) { return null; }
}

module.exports = function setupDrawGuess(app, ctx) {
  const io = ctx.io;
  const tokens = ctx.tokens || {};
  const data = readData();
  if (!Array.isArray(data.customWords)) data.customWords = [];
  if (!data.stats) data.stats = {};

  const room = {
    players: new Map(), drawerId: null, word: '', roundNo: 0, endsAt: 0,
    timer: null, nextTimer: null, strokes: [], order: []
  };

  function nameOf(id) { const p = room.players.get(id); return p ? p.name : '某人'; }
  function userIdOf(username) {
    const st = (ctx && (ctx.state || ctx.store || ctx.data)) || {};
    const u = (st.users || {})[username];
    return (u && u.id) || username;
  }
  // 对齐全站：主 server.js 可能已在 io.use / connection 里挂了用户名，三路都认
  function resolveUser(socket, payload) {
    const tk = (payload && payload.token) ||
               (socket.handshake && socket.handshake.auth && socket.handshake.auth.token) || '';
    const d = socket.data || {};
    return tokens[tk] || d.username || d.user || d.name || null;
  }
  function broadcast(ev, payload) { io.to('drawguess').emit(ev, payload); }

  function publicState() {
    return {
      roundNo: room.roundNo,
      drawerId: room.drawerId,
      drawerName: room.drawerId ? nameOf(room.drawerId) : null,
      endsAt: room.endsAt,
      wordLen: room.word ? room.word.length : 0,
      hint: room.word ? room.word.charAt(0) + '＿'.repeat(Math.max(0, room.word.length - 1)) : '',
      players: Array.from(room.players.values()).map(function (p) {
        return { id: p.id, name: p.name, wins: p.wins || 0 };
      })
    };
  }

  // 先扣金库、成功再写余额：沿用拍卖「先扣后发」口径。
  // fs.writeFileSync 已被 config.js 顶部的 atomic-fs.js 全局兜成原子写（security-check 第 3/4 节验证）。
  function pay(username, amount, desc) {
    const id = userIdOf(username);
    try {
      if (ctx.treasury && typeof ctx.treasury.spend === 'function') {
        const r = ctx.treasury.spend(amount, desc, 'drawguess');
        if (r && r.ok === false) { console.error('[你画我猜] 金库不足，赏金挂账:', desc); return false; }
      }
    } catch (e) { console.error('[你画我猜] 金库扣款异常，不发钱:', e.message); return false; }
    try {
      const lob = JSON.parse(fs.readFileSync(LOBSTER_FILE, 'utf8'));   // 写前重读最新盘
      lob.balances = lob.balances || {};
      const key = lob.balances[id] ? id : (lob.balances[username] ? username : id);
      const b = lob.balances[key] || (lob.balances[key] = { oranges: 0 });
      b.oranges = (Number(b.oranges) || 0) + amount;
      fs.writeFileSync(LOBSTER_FILE, JSON.stringify(lob, null, 2));
      const back = JSON.parse(fs.readFileSync(LOBSTER_FILE, 'utf8'));  // 写后校验落盘
      const got = (back.balances && back.balances[key]) ? Number(back.balances[key].oranges) : 0;
      if (got !== b.oranges) {
        console.error('[你画我猜] 余额落盘校验不一致:', username, b.oranges, got);
        return false;
      }
      return true;
    } catch (e) { console.error('[你画我猜] 写余额失败:', e.message); return false; }
  }

  function bump(username, wins, oranges) {
    const id = userIdOf(username);
    const s = data.stats[id] || (data.stats[id] = { name: username, wins: 0, oranges: 0 });
    s.name = username; s.wins += wins; s.oranges += oranges;
    writeData(data);
  }

  function pickWord() {
    const pool = BASE_WORDS.concat(data.customWords.map(function (x) { return x.word; }));
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function clearTimers() {
    if (room.timer) { clearTimeout(room.timer); room.timer = null; }
    if (room.nextTimer) { clearTimeout(room.nextTimer); room.nextTimer = null; }
  }

  function nextRound() {
    clearTimers();
    room.strokes = [];
    if (room.players.size === 0) {
      room.drawerId = null; room.word = ''; room.endsAt = 0;
      broadcast('dg:state', publicState());
      return;
    }
    room.order = Array.from(room.players.keys());
    const idx = room.drawerId ? room.order.indexOf(room.drawerId) : -1;
    room.drawerId = room.order[(idx + 1) % room.order.length];
    room.word = pickWord();
    room.roundNo += 1;
    room.endsAt = Date.now() + ROUND_MS;
    broadcast('dg:round', publicState());
    const drawer = room.players.get(room.drawerId);
    if (drawer) io.to(drawer.sockId).emit('dg:youDraw', { word: room.word, roundNo: room.roundNo });
    broadcast('dg:chat', { type: 'sys', text: '第 ' + room.roundNo + ' 轮开始，画手：' + drawer.name + '，90 秒内猜中！' });
    room.timer = setTimeout(function () { finishRound(null); }, ROUND_MS);
  }

  function finishRound(winnerId) {
    if (room.nextTimer) return;                 // 防重复结算 / 重复发钱
    clearTimers();
    let msg;
    if (winnerId && room.players.has(winnerId)) {
      const w = room.players.get(winnerId);
      const gotG = pay(w.username, REWARD_GUESS, '你画我猜第' + room.roundNo + '轮猜中');
      const d = room.players.get(room.drawerId);
      let gotD = false;
      if (d && d.id !== w.id) gotD = pay(d.username, REWARD_DRAWER, '你画我猜第' + room.roundNo + '轮画手');
      w.wins = (w.wins || 0) + 1;
      bump(w.username, 1, gotG ? REWARD_GUESS : 0);
      if (d && d.id !== w.id) bump(d.username, 0, gotD ? REWARD_DRAWER : 0);
      msg = '🎉 ' + w.name + ' 猜中了「' + room.word + '」，+' + REWARD_GUESS + '🍊' +
            (d && d.id !== w.id ? '；画手 ' + d.name + ' +' + REWARD_DRAWER + '🍊' : '');
    } else {
      msg = '⏰ 时间到，答案是「' + room.word + '」，本轮无人猜中';
    }
    broadcast('dg:win', { text: msg, word: room.word, roundNo: room.roundNo });
    broadcast('dg:chat', { type: 'sys', text: msg });
    room.nextTimer = setTimeout(function () { room.nextTimer = null; nextRound(); }, NEXT_DELAY);
  }

  io.on('connection', function (socket) {
    socket.on('dg:join', function (payload) {
      const username = resolveUser(socket, payload);
      if (!username) { socket.emit('dg:error', { msg: '未登录，先去首页登录' }); return; }
      socket.join('drawguess');
      room.players.set(socket.id, { id: socket.id, sockId: socket.id, username: username, name: username, wins: 0 });
      socket.data.dgUser = username;
      socket.emit('dg:snapshot', { strokes: room.strokes, state: publicState() });
      if (room.drawerId === socket.id) socket.emit('dg:youDraw', { word: room.word, roundNo: room.roundNo });
      broadcast('dg:state', publicState());
      broadcast('dg:chat', { type: 'sys', text: username + ' 进了擂台' });
      if (!room.drawerId && !room.timer && !room.nextTimer) nextRound();
    });

    socket.on('dg:stroke', function (s) {
      if (socket.id !== room.drawerId || !s) return;
      const seg = {
        x1: Number(s.x1) || 0, y1: Number(s.y1) || 0,
        x2: Number(s.x2) || 0, y2: Number(s.y2) || 0,
        color: String(s.color || '#e67e22').slice(0, 20),
        width: Math.min(20, Math.max(1, Number(s.width) || 3))
      };
      room.strokes.push(seg);
      if (room.strokes.length > MAX_STROKES) room.strokes.shift();   // 防只增不减
      socket.to('drawguess').emit('dg:stroke', seg);
    });

    socket.on('dg:clear', function () {
      if (socket.id !== room.drawerId) return;
      room.strokes = [];
      socket.to('drawguess').emit('dg:clear');
    });

    socket.on('dg:guess', function (payload) {
      const username = socket.data.dgUser;
      if (!username) return;
      const text = String((payload && payload.text) || '').slice(0, 60);
      if (!text.trim()) return;
      broadcast('dg:chat', { type: 'user', name: username, text: text });
      if (localBad(text)) { socket.emit('dg:error', { msg: '文明发言 🍊' }); return; }
      if (!room.word || socket.id === room.drawerId) return;
      if (norm(text) === norm(room.word)) finishRound(socket.id);
    });

    socket.on('disconnect', function () {
      if (!room.players.has(socket.id)) return;
      const p = room.players.get(socket.id);
      room.players.delete(socket.id);
      broadcast('dg:chat', { type: 'sys', text: p.name + ' 离开了擂台' });
      if (socket.id === room.drawerId) {
        clearTimers();
        room.nextTimer = setTimeout(function () { room.nextTimer = null; nextRound(); }, 1200);
      }
      broadcast('dg:state', publicState());
    });
  });

  app.get('/api/drawguess/state', function (req, res) {
    if (!tokens[req.headers.authorization]) return res.status(401).json({ ok: false, msg: '未登录' });
    res.json({ ok: true, state: publicState() });
  });

  app.get('/api/drawguess/rank', function (req, res) {
    if (!tokens[req.headers.authorization]) return res.status(401).json({ ok: false, msg: '未登录' });
    const list = Object.keys(data.stats).map(function (k) {
      return { name: data.stats[k].name, wins: data.stats[k].wins, oranges: data.stats[k].oranges };
    }).sort(function (a, b) { return b.wins - a.wins || b.oranges - a.oranges; }).slice(0, 10);
    res.json({ ok: true, rank: list });
  });

  app.post('/api/drawguess/custom', async function (req, res) {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
    const word = String((req.body || {}).word || '').trim().slice(0, 12);
    if (!word) return res.json({ ok: false, msg: '词不能为空' });
    if (localBad(word)) return res.json({ ok: false, msg: '这个词不合适，换一个' });
    if (data.customWords.some(function (x) { return x.word === word; }))
      return res.json({ ok: false, msg: '词库里已有这个词了' });
    const ai = await aiReview(word);
    if (ai === false) return res.json({ ok: false, msg: 'AI 判定不适合做题词' });
    data.customWords.push({ word: word, by: username, time: Date.now(),
      ai: ai === true ? 'ai-passed' : 'ai-unavailable' });
    writeData(data);
    res.json({ ok: true, word: word,
      msg: ai === null ? '本地审核通过（AI 暂不可用，已降级）' : 'AI 审核通过' });
  });

  console.log('  🎨 你画我猜擂台已挂载：/drawguess.html');
  console.log('  ⚠️ [你画我猜] 赏金直接写 lobster.json（atomic-fs 已兜底原子写）；若 lobster-router 持有内存副本，其下次 save 可能覆盖本次发放 —— 需把 center.js 的 ctx 构造贴出来改走统一 balance 接口');
};
