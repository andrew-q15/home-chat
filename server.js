const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const EventEmitter = require('events');
const config = require('./config');
const multer = require('multer');

let pinnedMessages = {}; // { channel: [msgId1, msgId2] }

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// ============ Tailscale 身份识别 ============
app.use((req, res, next) => {
  const tsLogin = req.headers['tailscale-user-login'];
  if (tsLogin) req.tailscaleLogin = String(tsLogin);
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d', // 缓存静态资源 1 天
  etag: true
}));

const bus = new EventEmitter();
bus.setMaxListeners(50);

const DATA_FILE = path.join(__dirname, 'data.json');
const LOBSTER_FILE = path.join(__dirname, 'lobster.json');
const INTEL_FILE = path.join(__dirname, 'intel.json');
const FOOD_FILE = path.join(__dirname, 'food.json');
function loadFood() {
  try { return JSON.parse(fs.readFileSync(FOOD_FILE, 'utf8')); }
  catch { return { inventory: {}, recipes: {} }; }
}
function saveFood(data) {
  try { fs.writeFileSync(FOOD_FILE, JSON.stringify(data, null, 2)); } catch {}
}
let foodData = loadFood();
if (!foodData.inventory) foodData.inventory = {};
if (!foodData.recipes) foodData.recipes = {};

function loadIntel() {
  try { return JSON.parse(fs.readFileSync(INTEL_FILE, 'utf8')); }
  catch { return []; }
}
function saveIntel(data) {
  try { fs.writeFileSync(INTEL_FILE, JSON.stringify(data, null, 2)); } catch {}
}
let intelData = loadIntel();
let intelCooldowns = {};
let storyCooldowns = {};

const MARKET_FILE = path.join(__dirname, 'market.json');

function loadMarket() {
  try { return JSON.parse(fs.readFileSync(MARKET_FILE, 'utf8')); }
  catch { return { listings: [], tips: [] }; }
}
function saveMarket(data) {
  try { fs.writeFileSync(MARKET_FILE, JSON.stringify(data, null, 2)); } catch {}
}
let marketData = loadMarket();
if (!marketData.listings) marketData.listings = [];
if (!marketData.tips) marketData.tips = [];

const ORANGE_DEFAULT = 0;         // 新用户不送橘子，由超管发放
const ORANGE_MAX = 1000000;       // 单人余额上限 100 万（含打赏/市场收入）

function loadLobster() {
  try { return JSON.parse(fs.readFileSync(LOBSTER_FILE, 'utf8')); }
  catch { return { superAdminSecret: null, balances: {}, history: [] }; }
}
function saveLobster(data) {
  try { fs.writeFileSync(LOBSTER_FILE, JSON.stringify(data, null, 2)); } catch {}
}
let lobsterData = loadLobster();
let inviteCodes = {}; // { code: { createdAt, expiresAt } }
if (!lobsterData.superAdminSecret) {
  lobsterData.superAdminSecret = crypto.randomBytes(4).toString('hex');
}
if (!lobsterData.balances) lobsterData.balances = {};
if (!lobsterData.history) lobsterData.history = [];
saveLobster(lobsterData);

function addOrangeLog(userId, amount, reason) {
  const bal = getBalance(userId);
  if (!bal.ledger) bal.ledger = [];
  bal.ledger.unshift({ time: Date.now(), amount: amount, reason: reason });
  if (bal.ledger.length > 100) bal.ledger = bal.ledger.slice(0, 100); // 只留最近100条
  saveLobster(lobsterData);
}

function getBalance(userId) {
  if (!lobsterData.balances[userId]) {
    lobsterData.balances[userId] = { oranges: ORANGE_DEFAULT, totalSpent: 0 };
    saveLobster(lobsterData);
  }
  return lobsterData.balances[userId];
}

const LISTS_FILE = path.join(__dirname, 'lists.json');
const BOARD_FILE = path.join(__dirname, 'board.json');

// 白板：strokes 是笔画数组（最多 1000 笔）
// undoneStack：用户ID -> 被撤销的笔画栈（用于重做）
let board = { strokes: [] };
let boardUndone = {};  // { userId: [stroke, ...] }
try { board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8')); } catch {}
if (!board.strokes) board.strokes = [];

let boardDirty = false;
function saveBoardSoon() { boardDirty = true; }
setInterval(function() {
  if (!boardDirty) return;
  boardDirty = false;
  try { fs.writeFileSync(BOARD_FILE, JSON.stringify(board)); } catch {}
}, 5000);

// 清空投票状态
let boardClearVote = null;

const LIST_ICON_DIR = path.join(__dirname, 'public', 'list-icons');
if (!fs.existsSync(LIST_ICON_DIR)) fs.mkdirSync(LIST_ICON_DIR, { recursive: true });

function loadLists() {
  try { return JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8')); }
  catch { return { lists: {} }; }
}
function saveLists(data) {
  try { fs.writeFileSync(LISTS_FILE, JSON.stringify(data, null, 2)); } catch {}
}
let listData = loadLists();
if (!listData.lists) listData.lists = {};

const OBS_FILE = path.join(__dirname, 'observations.json');
const MEMORY_FILE = path.join(__dirname, 'memory.json');

function loadMemories() {
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); }
  catch { return []; }
}
function saveMemories() {
  try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2)); } catch {}
}
let memories = loadMemories();

const MEMORY_TTL = 4 * 60 * 60 * 1000; // 记忆保留 4 小时

function addMemory(text) {
  if (!text) return;
  const t = String(text).slice(0, 200);
  // 去重：同一条记忆在 4 小时内不重复写入
  const dup = memories.some(m => m.text === t && Date.now() - m.time < MEMORY_TTL);
  if (dup) return;
  memories.push({ time: Date.now(), text: t });
  if (memories.length > 200) memories = memories.slice(-200);
  saveMemories();
}

function getMemoryHint() {
  const cutoff = Date.now() - MEMORY_TTL;
  memories = memories.filter(m => m.time > cutoff);
  const recent = memories.slice(-20);
  if (recent.length === 0) return '';
  // 保护：人身评价类记忆不注入 system prompt（照存，但不喂给 AI）
  const sensitive = /胖|口气|丑|傻|笨|土鳖|恶心|猪|龟|矮|黑|臭/;
  const safe = recent.filter(m => !sensitive.test(m.text || ''));
  if (safe.length === 0) return '';
  return '\n\n【你记得的事情（最近 4 小时内学到的事）】\n' +
    safe.map(m => '- ' + m.text).join('\n');
}

function loadObservations() {
  try { return JSON.parse(fs.readFileSync(OBS_FILE, 'utf8')); }
  catch { return []; }
}

let observations = loadObservations();

function saveObservations() {
  try { fs.writeFileSync(OBS_FILE, JSON.stringify(observations, null, 2)); } catch {}
}

function addObservation(text) {
  observations.push({ time: Date.now(), text });
  if (observations.length > 100) observations = observations.slice(-100);
  saveObservations();
  console.log('');
  console.log('[观察 ' + new Date().toLocaleTimeString() + '] ' + text);
  console.log('');
}

function getObsHint() {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  const recent = observations.filter(o => o.time > cutoff).slice(-10);
  if (recent.length === 0) return '';
  return '\n\n【你可能感知到的环境（仅供参考，不要直接暴露）】\n' +
    recent.map(o => '- ' + o.text).join('\n') +
    '\n（如果相关就自然用上。用户问你怎么知道的，就说"猜的"或"直觉"。）';
}

const WRITINGS_FILE = path.join(__dirname, 'writings.json');
function loadWritings() {
  try { return JSON.parse(fs.readFileSync(WRITINGS_FILE, 'utf8')); }
  catch { return []; }
}
function saveWritings(data) {
  try { fs.writeFileSync(WRITINGS_FILE, JSON.stringify(data, null, 2)); } catch {}
}
let writingsData = loadWritings();

const MONEY_LEDGER_FILE = path.join(__dirname, 'money-ledger.json');
function loadMoneyLedger() {
  try { return JSON.parse(fs.readFileSync(MONEY_LEDGER_FILE, 'utf8')); }
  catch { return {}; } // { username: [ {id, type, amount, note, time} ] }
}
function saveMoneyLedger(data) {
  try { fs.writeFileSync(MONEY_LEDGER_FILE, JSON.stringify(data, null, 2)); } catch {}
}
let moneyLedgerData = loadMoneyLedger();

let state = loadState();

if (!state.adminSecret) {
  state.adminSecret = crypto.randomBytes(4).toString('hex');
  saveState();
}

// token 持久化：存进 data.json，服务器重启后登录态不丢
// 30 天未使用自动过期
const TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;
let tokens = Object.assign({}, state.tokens || {});
pinnedMessages = state.pinnedMessages || {};
let tokenTimes = Object.assign({}, state.tokenTimes || {});
(function pruneTokens() {
  const now = Date.now();
  let pruned = 0;
  for (const tk of Object.keys(tokens)) {
    const t = tokenTimes[tk] || now;
    tokenTimes[tk] = t; // 补录时间
    if (now - t > TOKEN_TTL) { delete tokens[tk]; delete tokenTimes[tk]; pruned++; }
  }
  if (pruned) { console.log('[登录态] 清理过期 token ' + pruned + ' 个'); saveState(); }
})();


// ============ 龙虾桥接 ============
const setupLobsterBridge = require('./lobster-bridge');
setupLobsterBridge(app, {
  tokens,
  state,
  lobsterData,
  saveLobster,
  getBalance,
  ORANGE_DEFAULT,
  ORANGE_MAX,
  io,
  pushMessage,
  saveState,
  broadcastChannels,
});

// ============ 食材交易行 ============
const setupMarket = require('./market-router');
setupMarket(app, { tokens, state, foodData, saveFood, getBalance, saveLobster, lobsterData });




// ============ 组队邀请 ============
const setupInvite = require('./invite-router');
setupInvite(io, { state, pushMessage, channelsFor });

// ============ 徒步装备 ============
const setupHiking = require('./hiking-router');
setupHiking(app, { tokens, callAI, config });

// ============ 火柴人对决 ============
const setupDuel = require('./duel-router');
setupDuel(io, {});

// ============ 上线雷达 ============
const setupRadar = require('./radar-router');
setupRadar(io, {
  tokens, state, getBalance, saveLobster, lobsterData, saveState, io, pushMessage, channelsFor
});

// ============ 活动中心 ============
const setupEventsRouter = require('./events-router');
setupEventsRouter(app, { tokens, state, getBalance, saveLobster, lobsterData, saveState, io, pushMessage });

// ============ 龙虾技能中心 ============
const setupSkillRouter = require('./skill-router');
setupSkillRouter(app, {
  tokens, state, getBalance, saveLobster, lobsterData, callAI, config
});

// ============ 龙虾运行器 ============
const setupLobsterRunner = require('./lobster-runner');
setupLobsterRunner(app, {
  tokens,
  state,
  lobsterData,
  saveLobster,
  getBalance,
  foodData,
  saveFood,
});
let nameToSockets = {};
let userMsgCounts = {};
let isChecking = false;

let chatState = {
  running: false,
  channel: null,
  round: 0,
  maxRounds: config.AI.maxRounds,
  timer: null,
};

function loadState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      users: parsed.users || {},
      channels: parsed.channels || ['日常'],
      histories: parsed.histories || {},
      adminSecret: parsed.adminSecret || null,
      tokens: parsed.tokens || {},
      tokenTimes: parsed.tokenTimes || {},
      pinnedMessages: parsed.pinnedMessages || {},
    };
  } catch {
    return {
      users: {},
      channels: ['日常'],
      histories: { '日常': [] },
      adminSecret: null,
      tokens: {},
      tokenTimes: {},
      pinnedMessages: {},
    };
  }
}

let saveStateTimer = null;
function saveState() {
  // 强制同步最新的 token 到 state 里
  state.tokens = tokens;
  state.tokenTimes = tokenTimes;
  if (saveStateTimer) clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2)); } catch (e) { console.error('saveState error:', e); }
  }, 2000); // 2 秒防抖，防高频写盘
}

function ensureChannel(channel) {
  if (!state.channels.includes(channel)) return false;
  if (!state.histories[channel]) state.histories[channel] = [];
  return true;
}

state.channels.forEach(ensureChannel);

// ============ 头像目录 ============
const AVATAR_DIR = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

// ============ 老数据补字段 ============
for (const uname of Object.keys(state.users)) {
  const u = state.users[uname];
  if (!u.id) u.id = 'u-' + crypto.randomBytes(4).toString('hex');
  if (!u.displayName) u.displayName = uname;
  if (u.avatar === undefined) u.avatar = null;
  if (!Array.isArray(u.blocked)) u.blocked = [];
}

// 老消息补 userId（按名字匹配）
for (const ch of state.channels) {
  if (!state.histories[ch]) continue;
  for (const m of state.histories[ch]) {
    if (!m.userId && m.name && state.users[m.name]) {
      m.userId = state.users[m.name].id;
    }
  }
}
saveState();


// 给老消息补 ID（首次启动时执行一次）
for (const ch of state.channels) {
  if (!state.histories[ch]) continue;
  for (const m of state.histories[ch]) {
    if (!m.id) m.id = m.time.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
}


// ============ 文件上传 ============
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIMES = [
  'image/', 'text/', 'application/pdf',
  'application/zip', 'application/x-zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'audio/', 'video/',
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // 不再拦截，所有类型都放行
    cb(null, true);
  },
});


function pushMessage(channel, name, text, options = {}) {
  const senderUser = state.users[name];
  const msg = {
    id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    userId: senderUser ? senderUser.id : null,
    name,
    text: text || '',
    time: Date.now(),
    channel,
    kind: options.kind || 'user',
    type: options.type || 'text',
    url: options.url || null,
    fileName: options.fileName || null,
    fileSize: options.fileSize || null,
    lat: options.lat || null,
    lng: options.lng || null,
    place: options.place || null,
    dice: options.dice || null,
    poll: options.poll || null,
    redPacket: options.redPacket || null,
    replyTo: options.replyTo || null,
    duration: options.duration || null,
    reactions: {},
  };
  state.histories[channel].push(msg);
  if (state.histories[channel].length > 2000) state.histories[channel].shift();
  saveState();
  io.to(channel).emit('message', msg);
  bus.emit('message', msg);
  return msg;
}

function broadcastUserUpdate(username) {
  const u = state.users[username];
  if (!u) return;
  io.emit('user_updated', {
    id: u.id,
    name: username,
    displayName: u.displayName || username,
    avatar: u.avatar || null,
    title: u.title || null,
  });
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, user) {
  const h = hashPassword(password, user.salt);
  const a = Buffer.from(h, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ============ HTTP ============
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.json({ ok: false, msg: '用户名和密码不能为空' });
  if (username.length > 20 || password.length < 3) return res.json({ ok: false, msg: '用户名最多 20 字，密码至少 3 位' });
  if (state.users[username]) return res.json({ ok: false, msg: '用户名已存在' });

  const salt = crypto.randomBytes(16).toString('hex');
  state.users[username] = {
    id: 'u-' + crypto.randomBytes(4).toString('hex'),
    displayName: username,
    avatar: null,
    blocked: [],
    salt,
    hash: hashPassword(password, salt),
    isAdmin: false,
    banned: false,
    mutedUntil: 0,
  };
  saveState();

  const token = crypto.randomBytes(32).toString('hex');
  tokens[token] = username;
  saveState();
  tokenTimes[token] = Date.now();
  saveState();
  res.json({ ok: true, token, username, isAdmin: false });
});

app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    console.log('[登录] 尝试登录:', username);
    
    const user = state.users[username];
    if (!user) {
      console.log('[登录] 失败：用户不存在');
      return res.json({ ok: false, msg: '用户名或密码错误' });
    }
    
    if (!verifyPassword(password, user)) {
      console.log('[登录] 失败：密码错误');
      return res.json({ ok: false, msg: '用户名或密码错误' });
    }
    
    if (user.banned) {
      console.log('[登录] 失败：账号被封禁');
      return res.json({ ok: false, msg: '账号已被封禁' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    tokens[token] = username;
  saveState();
    tokenTimes[token] = Date.now();
    saveState();
    
    console.log('[登录] 成功:', username);
    res.json({ ok: true, token, username, isAdmin: !!user.isAdmin, isElderMode: !!user.isElderMode });
  } catch (err) {
    console.error('[登录] 崩溃:', err.message);
    res.status(500).json({ ok: false, msg: '服务器内部错误' });
  }
});

// Tailscale 免密登录
app.post('/api/tailscale-login', (req, res) => {
  const tsLogin = req.tailscaleLogin;
  if (!tsLogin) return res.json({ ok: false, msg: '不是通过 Tailscale 访问' });

  // 🚨 安全锁：必须是本机发来的（Tailscale Serve 转发），防止通过 https-proxy 伪造头
  const remote = req.socket.remoteAddress;
  if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
    console.warn('[安全] 拦截伪造的 Tailscale 登录请求，来源:', remote);
    return res.status(403).json({ ok: false, msg: '拒绝非受信任来源' });
  }

  const username = tsLogin.split('@')[0];

  if (!state.users[username]) {
    const salt = crypto.randomBytes(16).toString('hex');
    const randomPwd = crypto.randomBytes(16).toString('hex');
    state.users[username] = {
      salt, hash: hashPassword(randomPwd, salt),
      isAdmin: false, isSuperAdmin: false, banned: false, mutedUntil: 0,
      id: 'u-' + crypto.randomBytes(4).toString('hex'),
    };
    saveState();
    if (typeof lobsterData !== 'undefined' && lobsterData.balances) {
      lobsterData.balances[state.users[username].id] = { oranges: ORANGE_DEFAULT, totalSpent: 0 };
      saveLobster(lobsterData);
    }
    console.log('[Tailscale] 自动创建用户: ' + username);
  }

  const user = state.users[username];
  if (user.banned) return res.json({ ok: false, msg: '账号已被封禁' });

  const token = crypto.randomBytes(32).toString('hex');
  tokens[token] = username;
  saveState();
  res.json({ ok: true, token, username, isAdmin: !!user.isAdmin, isSuperAdmin: !!user.isSuperAdmin });
});

app.post('/api/forgot-password', (req, res) => {
  const { username } = req.body || {};
  if (!state.users[username]) return res.json({ ok: false, msg: '用户不存在' });
  const adminName = Object.keys(state.users).find(n => state.users[n].isSuperAdmin) || 'mac';
  const channel = 'DM:' + [username, adminName].sort().join('|');
  if (!state.channels.includes(channel)) {
    state.channels.push(channel);
    state.histories[channel] = [];
  }
  pushMessage(channel, '系统', '🔐 用户 ' + username + ' 申请重置密码，请超管在后台处理。', { kind: 'system' });
  saveState();
  broadcastChannels();
  res.json({ ok: true, msg: '申请已发送给管理员，请等待回复' });
});

app.post('/api/verify', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.json({ ok: false });
  
  // 内存里找，或者 state 里找
  const username = tokens[token] || (state.tokens && state.tokens[token]);
  
  if (!username) return res.json({ ok: false });
  const user = state.users[username];
  if (!user || user.banned) return res.json({ ok: false });
  
  // 如果内存里没有，顺手补进内存
  if (!tokens[token]) {
    tokens[token] = username;
    if (!tokenTimes[token]) tokenTimes[token] = Date.now();
  }
  
  res.json({ ok: true, username, isAdmin: !!user.isAdmin, isSuperAdmin: !!user.isSuperAdmin, isElderMode: !!user.isElderMode, lockElderMode: !!user.lockElderMode });
});


app.post('/api/device/say', (req, res) => {
  const { key, channel, name, text } = req.body || {};
  if (key !== config.DEVICE_API_KEY) return res.status(403).json({ ok: false, msg: '密钥错误' });
  if (!channel || !name || !text) return res.status(400).json({ ok: false, msg: '缺少参数' });
  if (!ensureChannel(channel)) return res.status(400).json({ ok: false, msg: '频道不存在' });

  pushMessage(channel, name, text, { kind: 'device' });
  res.json({ ok: true });
});


app.get('/api/device/channels', (req, res) => {
  const { key } = req.query;
  if (key !== config.DEVICE_API_KEY) return res.status(403).json({ ok: false, msg: '密钥错误' });
  res.json({ ok: true, channels: state.channels });
});

// 分页历史
app.get('/api/history', (req, res) => {
  const { channel, before, limit } = req.query;
  if (!channel || !ensureChannel(channel)) return res.status(400).json({ ok: false, msg: '频道不存在' });
  const lim = Math.min(Number(limit) || 30, 100);
  const list = state.histories[channel];
  let endIdx = list.length;
  if (before) {
    const idx = list.findIndex(m => m.id === before);
    if (idx === -1) return res.json({ ok: true, messages: [], hasMore: false });
    endIdx = idx;
  }
  const startIdx = Math.max(0, endIdx - lim);
  const slice = list.slice(startIdx, endIdx);
  res.json({ ok: true, messages: slice, hasMore: startIdx > 0 });
});

// 搜索
app.get('/api/search', (req, res) => {
  const { q, channel } = req.query;
  if (!q) return res.json({ ok: true, messages: [] });
  const query = q.toLowerCase();
  const results = [];
  const chs = channel ? [channel] : state.channels;
  for (const ch of chs) {
    if (!state.histories[ch]) continue;
    const list = state.histories[ch];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if ((m.text || '').toLowerCase().includes(query)) {
        results.push(Object.assign({}, m, { channel: ch }));
        if (results.length >= 100) break;
      }
    }
    if (results.length >= 100) break;
  }
  res.json({ ok: true, messages: results });
});

app.get('/api/device/latest', (req, res) => {
  const { key, channel, since } = req.query;
  if (key !== config.DEVICE_API_KEY) return res.status(403).json({ ok: false });
  if (!channel || !ensureChannel(channel)) return res.status(400).json({ ok: false });
  const sinceTs = Number(since) || 0;
  const list = state.histories[channel].filter(m => m.time > sinceTs);
  res.json({ ok: true, messages: list });
});

// ============ Tailscale 外网接入 ============
// 查询是否已配置 API 令牌（用于引导页显示状态）
app.get('/api/ts/status', (req, res) => {
  res.json({ ok: true, configured: !!config.TS_API_TOKEN });
});

// 领取一次性入网密钥（需要聊天室登录；单次有效，90 天过期，自动预授权）
app.get('/api/ts/join-key', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  if (!config.TS_API_TOKEN) {
    return res.status(503).json({ ok: false, msg: '服务器还没配置 Tailscale API 令牌，请联系管理员（mac）' });
  }
  fetch('https://api.tailscale.com/api/v2/tailnet/-/keys', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + config.TS_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reusable: false,          // 单次有效，防止被转发滥用
      ephemeral: false,         // 家人设备长期在线
      expirySeconds: 90 * 24 * 3600,
      description: 'home-chat join key for ' + username,
      capabilities: { devices: { create: { preauthorized: true } } },
    }),
  }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.key) {
      console.error('[Tailscale] 发钥失败:', r.status, JSON.stringify(data).slice(0, 200));
      return res.status(502).json({ ok: false, msg: '发钥失败（' + r.status + '），检查 API 令牌是否有效' });
    }
    console.log('[Tailscale] 已给 ' + username + ' 发放入网密钥');
    res.json({ ok: true, key: data.key, expires: data.expires || null });
  }).catch((err) => {
    console.error('[Tailscale] 发钥出错:', err.message);
    res.status(502).json({ ok: false, msg: '网络错误' });
  });
});


// ============ 每日分享（故事） ============
app.post('/api/story', async (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  
  const now = Date.now();
  const lastTime = storyCooldowns[user.id] || 0;
  if (now - lastTime < 5 * 60 * 1000) {
    const left = Math.ceil((5 * 60 * 1000 - (now - lastTime)) / 1000);
    return res.status(400).json({ ok: false, msg: `分享冷却中，请等 ${left} 秒后再发` });
  }

  const { text } = req.body || {};
  const storyText = String(text || '').trim();
  if (!storyText) return res.status(400).json({ ok: false, msg: '内容不能为空' });

  let score = 0;
  try {
    const prompt = `极其严格评估：“${storyText}”。重要事实给 8-10 分，一般事实给 3-5 分，废话/重复给 0 分。只输出数字。`;
    const reply = await callAI(config.AI1.url, config.AI1.model, [
      { role: 'system', content: '冷酷审核员。只输出数字。' }, { role: 'user', content: prompt }
    ], 20);
    let aiScore = parseInt((reply || '').trim(), 10);
    if (!isNaN(aiScore)) score = Math.max(0, Math.min(10, aiScore));
    if (storyText.length < 5) score = 0;
  } catch (e) { score = 0; }

  storyCooldowns[user.id] = now;
  if (score > 0) { getBalance(user.id).oranges += score; saveLobster(lobsterData); }

  const channel = req.body.channel || state.channels[0];
  pushMessage(channel, username, storyText, { kind: 'user', type: 'story', score: score });
  res.json({ ok: true, score: score });
});

// ============ 跳蚤市场 ============
app.get('/api/market', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  const bal = getBalance(user.id);

  res.json({
    ok: true,
    myBalance: bal.oranges,
    listings: marketData.listings,
  });
});

app.post('/api/market', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];

  const { title, desc, price, image } = req.body || {};
  if (!title || isNaN(price) || price < 0) return res.json({ ok: false, msg: '参数错误' });

  const item = {
    id: 'm-' + crypto.randomBytes(4).toString('hex'),
    seller: username,
    sellerName: user.displayName || username,
    sellerId: user.id,
    title: String(title).slice(0, 30),
    desc: String(desc || '').slice(0, 300),
    price: Number(price),
    image: image || null,
    time: Date.now(),
    sold: false,
    soldTo: null,
  };
  marketData.listings.unshift(item);
  saveMarket(marketData);
  res.json({ ok: true, id: item.id });
});

app.delete('/api/market/:id', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  
  const idx = marketData.listings.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '不存在' });
  if (marketData.listings[idx].seller !== username) return res.json({ ok: false, msg: '无权下架' });
  if (marketData.listings[idx].sold) return res.json({ ok: false, msg: '已售出无法下架' });

  marketData.listings.splice(idx, 1);
  saveMarket(marketData);
  res.json({ ok: true });
});

app.post('/api/market/:id/buy', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const buyer = state.users[username];
  if (debtLocked(buyer.id)) return debtBlock(res);
  
  const item = marketData.listings.find(x => x.id === req.params.id);
  if (!item) return res.json({ ok: false, msg: '商品不存在' });
  if (item.sold) return res.json({ ok: false, msg: '商品已售出' });
  if (item.seller === username) return res.json({ ok: false, msg: '不能买自己的东西' });

  const buyerBal = getBalance(buyer.id);
  const seller = state.users[item.seller];
  if (!seller) return res.json({ ok: false, msg: '卖家已注销' });
  const sellerBal = getBalance(seller.id);

  if (buyerBal.oranges < item.price) {
    return res.json({ ok: false, msg: '余额不足' });
  }

  // 扣款、加款
  buyerBal.oranges -= item.price;
  sellerBal.oranges += item.price;
  saveLobster(lobsterData);

  // 标记已售
  item.sold = true;
  item.soldTo = username;
  saveMarket(marketData);

  // 自动建立私聊
  const chName = 'DM:' + [username, item.seller].sort().join('|');
  if (!state.channels.includes(chName)) {
    state.channels.push(chName);
    state.histories[chName] = [];
    saveState();
    broadcastChannels();
  }
  
  // 往私聊里发一条提示
  pushMessage(chName, '系统', `🛒 交易达成！${username} 用 ${item.price} 🍊 买下了「${item.title}」。请线下当面交易。`);

  res.json({
    ok: true,
    oranges: buyerBal.oranges,
    sellerName: item.sellerName
  });
});

app.post('/api/market/tip', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  if (debtLocked(user.id)) return debtBlock(res);
  const amount = Number(req.body && req.body.amount);
  if (isNaN(amount) || amount <= 0) return res.json({ ok: false, msg: '金额无效' });

  const bal = getBalance(user.id);
  if (bal.oranges < amount) return res.json({ ok: false, msg: '余额不足' });

  // 找超级管理员（收取打赏）
  const adminName = Object.keys(state.users).find(n => state.users[n].isSuperAdmin) || 'mac';
  const admin = state.users[adminName];
  if (!admin) return res.json({ ok: false, msg: '找不到开发者账号' });

  bal.oranges -= amount;
  const adminBal = getBalance(admin.id);
  adminBal.oranges += amount;
  saveLobster(lobsterData);

  marketData.tips.push({ from: username, amount: amount, time: Date.now() });
  if (marketData.tips.length > 100) marketData.tips.shift();
  saveMarket(marketData);

  res.json({ ok: true, oranges: bal.oranges });
});

app.get('/api/market/tip-info', (req, res) => {
  const total = marketData.tips.reduce((sum, t) => sum + t.amount, 0);
  const recent = marketData.tips.slice().reverse();
  
  const adminName = Object.keys(state.users).find(n => state.users[n].isSuperAdmin) || 'mac';
  const admin = state.users[adminName];
  const developer = admin ? (admin.displayName || adminName) : adminName;

  res.json({ ok: true, available: true, developer, total, recent });
});

// ============ 食材结算与厨房 ============
app.post('/api/food/cook', async (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false });
  const user = state.users[username];
  
  const { ingredients, saltScore, soyScore } = req.body || {};
  if (!ingredients || ingredients.length === 0) return res.json({ ok: false, msg: '请选择食材' });

  const inv = foodData.inventory[user.id] || {};
  
  // 校验食材够不够
  const counts = {};
  ingredients.forEach(i => counts[i] = (counts[i] || 0) + 1);
  for (const emoji in counts) {
    if (!inv[emoji] || inv[emoji] < counts[emoji]) {
      return res.json({ ok: false, msg: emoji + ' 数量不足' });
    }
  }

  // 扣除食材
  for (const emoji in counts) {
    inv[emoji] -= counts[emoji];
    if (inv[emoji] <= 0) delete inv[emoji];
  }
  saveFood(foodData);

  // 根据火候评分判断味道
  let taste = '味道刚刚好，堪称绝味！';
  if (saltScore < 30) taste = '淡出个鸟，一点盐味都没有。';
  else if (saltScore > 70) taste = '齁死人了，你打死卖盐的了？';
  
  if (soyScore < 30) taste = '毫无酱香，像是在吃白水煮草。';
  else if (soyScore > 70) taste = '黑乎乎的，酱油味直冲脑门。';

  const emojiNames = {};
  for (const k in FOOD_DICT) { emojiNames[k] = FOOD_DICT[k].name; }
  const ingredientNames = ingredients.map(i => emojiNames[i] || i).join('、');
  
  let dishName = ingredientNames + '大乱炖';
  let description = taste;
  
  try {
    const prompt = '我用了这些食材做菜：' + ingredientNames + '。调味情况：' + taste + '。请给这道菜起一个简短搞笑的名字（不超过10个字），并写一句不超过30字的食评。直接输出JSON格式：{"name":"菜名", "desc":"食评"}';

    const reply = await callAI(config.AI1.url, config.AI1.model, [
      { role: 'system', content: '幽默的黑暗料理厨师。只输出JSON。' },
      { role: 'user', content: prompt },
    ], 200);

    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.name) dishName = parsed.name;
      if (parsed.desc) description = parsed.desc;
    }
  } catch (err) {}

  if (!foodData.recipes[user.id]) foodData.recipes[user.id] = [];
  const newRecipe = {
    id: 'dish-' + crypto.randomBytes(4).toString('hex'),
    name: dishName,
    desc: description,
    ingredients: ingredients,
    time: Date.now()
  };
  foodData.recipes[user.id].unshift(newRecipe);
  saveFood(foodData);

  res.json({ ok: true, recipe: newRecipe });
});

app.get('/api/food/recipes', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false });
  const user = state.users[username];
  res.json({ ok: true, recipes: foodData.recipes[user.id] || [] });
});

app.get('/api/food/channels', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false });
  // 只返回非私聊频道
  const list = state.channels.filter(c => !c.startsWith('DM:'));
  res.json({ ok: true, channels: list });
});

app.post('/api/food/share', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false });
  const user = state.users[username];
  
  const { recipeId, channel } = req.body || {};
  const recipes = foodData.recipes[user.id] || [];
  const recipe = recipes.find(r => r.id === recipeId);
  
  if (!recipe) return res.json({ ok: false, msg: '菜谱不存在' });
  
  const ch = channel || state.channels[0];
  // 把菜谱作为一条特殊消息发到聊天室
  pushMessage(ch, username, '', {
    kind: 'user',
    type: 'dish',
    dish: recipe
  });
  
  res.json({ ok: true });
});

app.get('/api/food/inventory', (req, res) => {
  try {
    const username = tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false, msg: '用户不存在' });
    
    // 防御性获取
    let inv = {};
    if (foodData && foodData.inventory && foodData.inventory[user.id]) {
      inv = foodData.inventory[user.id];
    }
    
    res.json({ ok: true, inventory: inv });
  } catch (err) {
    console.error('库存接口报错:', err.message);
    res.status(500).json({ ok: false, msg: err.message });
  }
});

app.post('/api/food/sell', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false });
  const user = state.users[username];
  if (debtLocked(user.id)) return debtBlock(res);
  const { emoji } = req.body || {};
  const count = Math.max(0, Math.floor(Number(req.body && req.body.count) || 0));
  if (count <= 0) return res.json({ ok: false, msg: '数量不合法' });
  
  const inv = foodData.inventory[user.id] || {};
  if (!inv[emoji] || inv[emoji] < count) return res.json({ ok: false, msg: '数量不足' });
  
  // 映射卖价
  const prices = {
    '🥩': 10, '🐟': 15, '🍫': 12, '🦞': 25, '🍖': 20,
    '🍗': 5, '🍤': 6, '🥓': 5, '🍜': 5, '🥤': 6, '🧋': 3,
    '🥦': 4, '🍄': 4, '🍪': 4, '🌽': 3, '🥚': 2, '🧅': 2,
    '🥒': 2, '🥔': 5, '🥬': 2, '🌿': 1, '🫚': -20
  };
  const unitPrice = prices[emoji] || 1;
  const total = unitPrice * count;
  
  inv[emoji] -= count;
  if (inv[emoji] <= 0) delete inv[emoji];
  saveFood(foodData);
  
  const bal = getBalance(user.id);
  bal.oranges += total;
  saveLobster(lobsterData);
  
  res.json({ ok: true, oranges: bal.oranges, earned: total });
});

// ============ 沸腾火锅游戏 ============
const FOOD_DICT = {
  '🥚': { name: '鸡蛋', score: 2 }, '🧅': { name: '洋葱', score: 2 }, '🥬': { name: '生菜', score: 1 },
  '🥔': { name: '土豆', score: 2 }, '🥒': { name: '黄瓜', score: 2 }, '🌽': { name: '玉米', score: 3 },
  '🍗': { name: '鸡腿', score: 5 }, '🍤': { name: '虾滑', score: 6 }, '🥓': { name: '培根', score: 5 },
  '🍄': { name: '金针菇', score: 4 }, '🥦': { name: '西兰花', score: 4 }, '🍜': { name: '方便面', score: 5 },
  '🍪': { name: '干脆面', score: 4 }, '🥤': { name: '奶茶', score: 6 }, '🧋': { name: '黑珍珠', score: 3 },
  '🥩': { name: '顶级牛肉', score: 15 },  '🐟': { name: '三文鱼', score: 18 },
  '🍫': { name: '巧克力', score: 12 }, '🫚': { name: '生姜', score: -20 }, '🌿': { name: '香菜', score: 1 },
  '🦞': { name: '龙虾', score: 15 }, '🍖': { name: '高级和牛', score: 20 },
  '🦞': { name: '龙虾', score: 15 }
};
const HOTPOT_POOL = [];
for(let i=0;i<60;i++) HOTPOT_POOL.push('🥚','🧅','🥬','🥔','🥒','🌽');
for(let i=0;i<30;i++) HOTPOT_POOL.push('🍗','🍤','🥓','🍄','🥦','🍜','🍪','🥤','🧋');
for(let i=0;i<10;i++) HOTPOT_POOL.push('🥩','🥩','🐟','🍫');
HOTPOT_POOL.push('🫚','🌿');

// ============ 吃 🦞：获得 1 小时抽奖好运 buff ============
app.post('/api/food/eat-lobster', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  if (!user) return res.status(401).json({ ok: false, msg: '用户不存在' });

  const inv = foodData.inventory[user.id] || {};
  if (!inv['🦞'] || inv['🦞'] <= 0) {
    return res.json({ ok: false, msg: '你没有 🦞，跑 10 次龙虾任务才能获得' });
  }

  inv['🦞']--;
  if (inv['🦞'] <= 0) delete inv['🦞'];
  saveFood(foodData);

  const now = Date.now();
  const HOUR = 3600 * 1000;
  let buff = user.lobsterBuff || { stack: 0, expiresAt: 0 };
  if (buff.expiresAt > now) {
    buff.stack = Math.min(2, (buff.stack || 0) + 1);
    buff.expiresAt = buff.expiresAt + HOUR;
  } else {
    buff = { stack: 1, expiresAt: now + HOUR };
  }
  user.lobsterBuff = buff;
  saveState();

  console.log('[龙虾] ' + username + ' 吃了 🦞，buff 层数 ' + buff.stack);
  res.json({
    ok: true,
    stack: buff.stack,
    expiresAt: buff.expiresAt,
    remainMin: Math.round((buff.expiresAt - now) / 60000),
    msg: '🦞 真香！抽奖好运 +' + (buff.stack * 20) + '%，持续 ' + Math.round((buff.expiresAt - now) / 60000) + ' 分钟',
  });
});

// ============ 橘子抽奖机 ============
const LOTTERY_PRICE = 50;
const LOTTERY_TEN_PRICE = 450;

// 奖池（基础概率，和 = 100%）
// buff 生效时：谢谢惠顾 -20%（每层），好食材 +20%（每层），从谢谢惠顾挪
const LOTTERY_POOL = [
  { id: 'none',      name: '谢谢惠顾',   emoji: '💨', p: 29.5,   type: 'none' },
  { id: 'food_common', name: '普通食材', emoji: '🥬', p: 35,   type: 'food_common' },
  { id: 'orange20',  name: '橘子 ×20',   emoji: '🍊', p: 15,   type: 'orange', value: 20 },
  { id: 'orange50',  name: '橘子 ×50',   emoji: '🍊', p: 10,   type: 'orange', value: 50 },
  { id: 'orange100', name: '橘子 ×100',  emoji: '🍊', p: 6,    type: 'orange', value: 100 },
  { id: 'food_good', name: '好食材',     emoji: '🥩', p: 3,    type: 'food_good' },
  { id: 'wagyu',     name: '高级和牛',   emoji: '🍖', p: 0.5,  type: 'food_good' },
  { id: 'orange500', name: '橘子 ×500',  emoji: '💰', p: 0.8,  type: 'orange', value: 500 },
  { id: 'legend',    name: '👑 传说 ×2000', emoji: '👑', p: 0.2, type: 'orange', value: 2000 },
];

const COMMON_FOODS = ['🥚','🧅','🥒','🌽','🥦','🥔','🥬','🍄'];
const GOOD_FOODS = ['🥩','🐟','🍫','🦞','🍖','🥦','🌽'];

function getLotteryBuff(user) {
  const now = Date.now();
  const b = user.lobsterBuff;
  if (!b || !b.expiresAt || b.expiresAt <= now) return { stack: 0, expiresAt: 0 };
  return { stack: Math.min(2, b.stack || 0), expiresAt: b.expiresAt };
}

function buildWeights(buffStack) {
  // 谢谢惠顾 -20% * stack（最低 0），好食材 +20% * stack（从谢谢惠顾挪，挪不够从普通食材挪）
  let noneP = 30, goodP = 3, commonP = 35;
  const shift = 20 * buffStack;
  let take = Math.min(shift, noneP);
  noneP -= take;
  goodP += take;
  const rest = shift - take;
  if (rest > 0) {
    const takeCommon = Math.min(rest, commonP - 5); // 普通食材至少留 5%
    commonP -= takeCommon;
    goodP += takeCommon;
  }
  const weights = LOTTERY_POOL.map(x => {
    if (x.id === 'none') return noneP;
    if (x.id === 'food_good') return goodP;
    if (x.id === 'food_common') return commonP;
    return x.p;
  });
  return { weights, noneP, goodP, commonP };
}

function drawOne(user, isFree) {
  const buff = getLotteryBuff(user);
  const { weights } = buildWeights(buff.stack);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let idx = 0;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) { idx = i; break; }
  }
  const prize = LOTTERY_POOL[idx];
  const result = { ...prize };

  if (isFree && (prize.id === 'legend' || prize.id === 'orange500')) {
    // 免费抽大奖概率减半：按比例换成 orange100
    return { ...LOTTERY_POOL[4], name: '橘子 ×100（免费抽）', value: 100 };
  }

  if (prize.type === 'food_common') {
    const e = COMMON_FOODS[Math.floor(Math.random() * COMMON_FOODS.length)];
    result.emoji = e;
    result.foodEmoji = e;
    result.name = '食材 ' + e;
  } else if (prize.type === 'food_good') {
    const e = GOOD_FOODS[Math.floor(Math.random() * GOOD_FOODS.length)];
    result.emoji = e;
    result.foodEmoji = e;
    result.name = '好食材 ' + e;
  }
  return result;
}

function applyPrize(user, prize) {
  const uid = user.id;
  if (prize.type === 'orange') {
    const b = getBalance(uid);
    b.oranges = Math.min(ORANGE_MAX, b.oranges + prize.value);
    saveLobster(lobsterData);
  } else if (prize.foodEmoji) {
    if (!foodData.inventory[uid]) foodData.inventory[uid] = {};
    const inv = foodData.inventory[uid];
    inv[prize.foodEmoji] = (inv[prize.foodEmoji] || 0) + 1;
    saveFood(foodData);
  }
}

app.get('/api/lottery/info', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  const buff = getLotteryBuff(user);
  const today = new Date().toISOString().slice(0, 10);
  const freeAvailable = user.lastFreeDraw !== today;
  res.json({
    ok: true,
    price: LOTTERY_PRICE,
    tenPrice: LOTTERY_TEN_PRICE,
    oranges: getBalance(user.id).oranges,
    buff: buff.stack > 0 ? { stack: buff.stack, remainMin: Math.round((buff.expiresAt - Date.now()) / 60000) } : null,
    freeAvailable,
    pool: LOTTERY_POOL.map(x => ({ name: x.name, emoji: x.emoji, p: x.p })),
  });
});

app.post('/api/lottery/draw', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  if (!user) return res.status(401).json({ ok: false, msg: '用户不存在' });

  const mode = String((req.body && req.body.mode) || 'single'); // single | ten | free
  if (debtLocked(user.id)) return res.status(403).json({ ok: false, msg: '欠账中，先还清债务再抽奖' });

  const today = new Date().toISOString().slice(0, 10);
  const isFree = mode === 'free';

  if (isFree) {
    if (user.lastFreeDraw === today) return res.json({ ok: false, msg: '今天的免费抽已经用过了' });
    user.lastFreeDraw = today;
    saveState();
  } else {
    const cost = mode === 'ten' ? LOTTERY_TEN_PRICE : LOTTERY_PRICE;
    const count = mode === 'ten' ? 10 : 1;
    const bal = getBalance(user.id);
    if (bal.oranges < cost) return res.json({ ok: false, msg: '橘子不够（需要 ' + cost + ' 🍊）' });
    bal.oranges -= cost;
    saveLobster(lobsterData);

    // 保底：连续 10 次没抽到 >=100，第 10 次必出
    const results = [];
    for (let i = 0; i < count; i++) {
      let prize = drawOne(user, false);
      user.lotteryPity = user.lotteryPity || 0;
      if (prize.type === 'orange' && prize.value >= 100) user.lotteryPity = 0;
      else user.lotteryPity++;

      if (user.lotteryPity >= 10) {
        prize = { ...LOTTERY_POOL[4], name: '橘子 ×100（保底）', value: 100 };
        user.lotteryPity = 0;
      }
      applyPrize(user, prize);
      results.push(prize);

      if (prize.id === 'legend' || prize.id === 'orange500') {
        io.emit('lottery_win', { username, displayName: user.displayName || username, prize });
      }
    }
    saveState();
    return res.json({ ok: true, results, oranges: getBalance(user.id).oranges, pity: user.lotteryPity });
  }

  // 免费一抽
  const prize = drawOne(user, true);
  applyPrize(user, prize);
  saveState();
  res.json({ ok: true, results: [prize], oranges: getBalance(user.id).oranges });
});

// ============ 3D 食材峡谷：扣 100 🍊 抽 1 个食材 ============
app.post('/api/food/loot', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  if (!user) return res.status(401).json({ ok: false, msg: '用户不存在' });
  if (debtLocked(user.id)) return debtBlock(res);

  const cost = Number(req.body && req.body.cost);
  if (cost !== 100) return res.json({ ok: false, msg: '门票价格不合法' });

  const bal = getBalance(user.id);
  if (bal.oranges < cost) return res.json({ ok: false, msg: '橘子不够（需要 100 🍊）' });

  // 扣门票
  bal.oranges -= cost;
  bal.totalSpent = (bal.totalSpent || 0) + cost;
  saveLobster(lobsterData);

  // 从火锅池抽 1 个食材（含生姜坑）
  const r = HOTPOT_POOL[Math.floor(Math.random() * HOTPOT_POOL.length)];
  const info = FOOD_DICT[r] || { name: '未知食材', score: 0 };
  const emoji = r === '🥩2' ? '🥩' : r;  // 🥩2 是羊肉占位，库存按 🥩 存

  if (!foodData.inventory[user.id]) foodData.inventory[user.id] = {};
  const inv = foodData.inventory[user.id];
  inv[emoji] = (inv[emoji] || 0) + 1;
  saveFood(foodData);

  // 生姜额外惩罚：与火锅一致，踩雷扣 10 🍊
  let penalty = 0;
  if (emoji === '🫚') {
    bal.oranges -= 10;
    saveLobster(lobsterData);
    penalty = 10;
  }

  res.json({
    ok: true,
    emoji: emoji,
    name: info.name,
    score: info.score,
    penalty: penalty,
    orangesLeft: bal.oranges,
  });
});
let hotpotState = { active: [], timer: null, running: false };
const hotpotItems = [
  { type: 'beef', emoji: '🥩', score: 10 },
  { type: 'potato', emoji: '🥔', score: 5 },
  { type: 'lettuce', emoji: '🥬', score: 2 },
  { type: 'mushroom', emoji: '🍄', score: 2 },
  { type: 'ginger', emoji: '🫚', score: -20 },
];
function startHotpot() {
  if (hotpotState.running) return;
  hotpotState.running = true;
  hotpotState.active = [];
  io.emit('hotpot_update', hotpotState.active);
  hotpotState.timer = setInterval(() => {
    const now = Date.now();
    hotpotState.active = hotpotState.active.filter(i => i.expire > now);
    if (hotpotState.active.length < 3) {
      const r = HOTPOT_POOL[Math.floor(Math.random() * HOTPOT_POOL.length)];
      const info = FOOD_DICT[r] || {name:'未知', score:0};
      hotpotState.active.push({ id: crypto.randomBytes(4).toString('hex'), x: Math.floor(Math.random()*16), y: Math.floor(Math.random()*16), emoji: r,
        name: info.name, score: info.score, expire: now + 5000 });
    }
    io.emit('hotpot_update', hotpotState.active);
  }, 2000);
}
app.post('/api/hotpot/grab', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false });
  const idx = hotpotState.active.findIndex(i => i.id === req.body.itemId);
  if (idx === -1) return res.json({ ok: false, msg: '手慢了' });
  const item = hotpotState.active.splice(idx, 1)[0];
  const user = state.users[username];
  
  // 存入食材库存
  if (!foodData.inventory[user.id]) foodData.inventory[user.id] = {};
  const inv = foodData.inventory[user.id];
  inv[item.emoji] = (inv[item.emoji] || 0) + 1;
  saveFood(foodData);

  let penaltyMsg = '';
  let currentOranges = getBalance(user.id).oranges;

  // 如果抢到的是生姜，立刻扣除 10 个橘子
  if (item.emoji === '🫚') {
    const bal = getBalance(user.id);
    bal.oranges -= 10;
    saveLobster(lobsterData);
    currentOranges = bal.oranges;
    penaltyMsg = '（踩雷了，扣除 10 🍊）';
  }

  io.emit('hotpot_grabbed', { username, item });
  io.emit('hotpot_update', hotpotState.active);
  
  res.json({ ok: true, score: item.score, msg: '已存入库存 ' + penaltyMsg, oranges: currentOranges });
});
setTimeout(startHotpot, 3000);

// ============ Socket.IO ============
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('未登录'));
  
  const username = tokens[token] || (state.tokens && state.tokens[token]);
  
  if (!username) return next(new Error('未登录'));
  const user = state.users[username];
  if (!user || user.banned) return next(new Error('未登录'));
  
  // 顺手补进内存
  if (!tokens[token]) {
    tokens[token] = username;
    if (!tokenTimes[token]) tokenTimes[token] = Date.now();
  }
  
  socket.data.name = username;
  next();
});

io.on('connection', (socket) => {
  const name = socket.data.name;

  if (!nameToSockets[name]) nameToSockets[name] = new Set();
  nameToSockets[name].add(socket);

  socket.emit('channels', channelsFor(name));
  {
    const info = {};
    for (const [un, u] of Object.entries(state.users)) {
      info[u.id] = { name: un, displayName: u.displayName || un, avatar: u.avatar || null };
    }
    socket.emit('users_info', info);
  }
  const u_ = state.users[name];
  socket.emit('me', {
    name,
    isAdmin: !!u_?.isAdmin,
    isSuperAdmin: !!u_?.isSuperAdmin,
    oranges: u_ ? getBalance(u_.id).oranges : 0,
  });
  socket.emit('blocked_list', state.users[name].blocked || []);

  // 拉黑 / 取消拉黑
  socket.on('block_user', ({ target }) => {
    if (!target || !state.users[target] || target === name) return;
    const me = state.users[name];
    if (!me.blocked.includes(target)) me.blocked.push(target);
    saveState();
    broadcastToUser(name, 'blocked_list', me.blocked);
    socket.emit('system', `已拉黑 ${target}，对方无法再私聊你`);
  });

  socket.on('unblock_user', ({ target }) => {
    const me = state.users[name];
    if (!me || !Array.isArray(me.blocked)) return;
    const idx = me.blocked.indexOf(target);
    if (idx === -1) return;
    me.blocked.splice(idx, 1);
    saveState();
    broadcastToUser(name, 'blocked_list', me.blocked);
    socket.emit('system', `已取消拉黑 ${target}`);
  });

  // 私聊：开启或回到两人的私聊频道
  socket.on('open_dm', ({ target }) => {
    if (!target || !state.users[target] || target === name) {
      socket.emit('error_msg', '无法开启私聊');
      return;
    }
    if (isBlockedBy(name, target)) {
      socket.emit('error_msg', '你已拉黑对方，无法发起私聊');
      return;
    }
    if (isBlockedBy(target, name)) {
      socket.emit('error_msg', '你已被对方拉黑');
      return;
    }
    const chName = 'DM:' + [name, target].sort().join('|');
    if (!state.channels.includes(chName)) {
      state.channels.push(chName);
      state.histories[chName] = [];
      saveState();
    }
    socket.emit('dm_opened', { channel: chName, target });
    broadcastChannels();
  });

  socket.on('join', ({ channel }) => {
    if (isDmChannel(channel) && !dmAllowed(channel, name)) {
      socket.emit('error_msg', '无法加入私聊频道');
      return;
    }
    if (!ensureChannel(channel)) { socket.emit('error_msg', `频道 #${channel} 不存在`); return; }
    if (socket.data.channel && socket.data.channel !== channel) {
      socket.leave(socket.data.channel);
      io.to(socket.data.channel).emit('system', `${name} 离开了`);
      io.to(socket.data.channel).emit('users', getUsers(socket.data.channel));
    }
    socket.data.channel = channel;
    socket.join(channel);
    const _h = state.histories[channel];
    socket.emit('history', _h.slice(-50));
    socket.emit('pinned_updated', { channel, pinned: pinnedMessages[channel] || [] });
    socket.emit('history_more', { hasMore: _h.length > 50 });
    socket.to(channel).emit('system', `${name} 进来了`);
    io.to(channel).emit('users', getUsers(channel));
  });

  socket.on('message', async (text, opts) => {
    const channel = socket.data.channel;
    if (!channel) return;

    if (text.startsWith('/')) { handleCommand(socket, text.trim()); return; }
    if (dmSendBlocked(channel, name)) {
      socket.emit('error_msg', '私聊已被拉黑，消息未发送');
      return;
    }

    const user = state.users[name];
    if (user?.mutedUntil && user.mutedUntil > Date.now()) {
      const left = Math.ceil((user.mutedUntil - Date.now()) / 60000);
      socket.emit('error_msg', `你被禁言了，还剩约 ${left} 分钟`);
      return;
    }
    
    // 简单防刷屏：如果 1 秒内发超过 3 条，直接拦截
    if (!socket._lastMsgs) socket._lastMsgs = [];
    const now = Date.now();
    socket._lastMsgs = socket._lastMsgs.filter(t => now - t < 1000);
    if (socket._lastMsgs.length >= 3) {
      socket.emit('error_msg', '发送太快啦，休息一下再发吧！');
      return;
    }
    socket._lastMsgs.push(now);

    pushMessage(channel, name, text, { kind: 'user', replyTo: opts && opts.replyTo || null });

    if (/@ai\b/i.test(text)) {
      userMsgCounts[channel] = 0;
      if (!chatState.running) triggerCheck(channel);
      return;
    }

    userMsgCounts[channel] = (userMsgCounts[channel] || 0) + 1;
    if (userMsgCounts[channel] >= config.AI.triggerEvery) {
      userMsgCounts[channel] = 0;
      if (!chatState.running) triggerCheck(channel);
    }
  });

  // 表情反应
  socket.on('toggle_reaction', ({ messageId, emoji }) => {
    const channel = socket.data.channel;
    if (!channel || !messageId || !emoji) return;
    const list = state.histories[channel];
    const msg = list.find(m => m.id === messageId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const arr = msg.reactions[emoji];
    const idx = arr.indexOf(name);
    if (idx === -1) {
      arr.push(name);
    } else {
      arr.splice(idx, 1);
      if (arr.length === 0) delete msg.reactions[emoji];
    }
    saveState();
    io.to(channel).emit('reaction_update', { messageId, reactions: msg.reactions });
  });

  // 撤回消息
  socket.on('delete_message', ({ messageId }) => {
    const channel = socket.data.channel;
    if (!channel || !messageId) return;

    const list = state.histories[channel];
    const idx = list.findIndex(m => m.id === messageId);
    if (idx === -1) return;

    const msg = list[idx];
    const user = state.users[name];
    // 只有消息作者本人或管理员能撤回
    if (msg.name !== name && !user?.isAdmin) {
      socket.emit('error_msg', '你只能撤回自己的消息');
      return;
    }

    const removedName = msg.name;
    list.splice(idx, 1);
    saveState();

    // 广播"撤回"事件
    io.to(channel).emit('message_deleted', { messageId, name: removedName });
  });

  socket.on('audio_message', ({ url, duration }) => {
    const channel = socket.data.channel;
    if (!channel || !url) return;
    if (isDmChannel(channel) && !dmAllowed(channel, name)) return;
    const user = state.users[name];
    if (user && user.mutedUntil && user.mutedUntil > Date.now()) {
      socket.emit('error_msg', '你被禁言了');
      return;
    }
    pushMessage(channel, name, '', { kind: 'user', type: 'audio', url, duration: Number(duration) || null });
  });

  socket.on('image_message', ({ url }) => {
    const channel = socket.data.channel;
    if (!channel || !url) return;
    const user = state.users[name];
    if (user && user.mutedUntil && user.mutedUntil > Date.now()) {
      socket.emit('error_msg', '你被禁言了');
      return;
    }
    pushMessage(channel, name, '', { kind: 'user', type: 'image', url });
  });

  socket.on('file_message', ({ url, fileName, fileSize }) => {
    const channel = socket.data.channel;
    if (!channel || !url) return;
    const user = state.users[name];
    if (user && user.mutedUntil && user.mutedUntil > Date.now()) {
      socket.emit('error_msg', '你被禁言了');
      return;
    }
    pushMessage(channel, name, '', { kind: 'user', type: 'file', url, fileName, fileSize });
  });

  socket.on('location_message', ({ lat, lng, place }) => {
    const channel = socket.data.channel;
    if (!channel) return;
    const user = state.users[name];
    if (user && user.mutedUntil && user.mutedUntil > Date.now()) {
      socket.emit('error_msg', '你被禁言了');
      return;
    }
    pushMessage(channel, name, '', { kind: 'user', type: 'location', lat, lng, place });
  });

  // ============ 白板 ============
  socket.on('dice_message', ({ sides, result }) => {
    const channel = socket.data.channel;
    if (!channel) return;
    const user = state.users[name];
    if (user && user.mutedUntil && user.mutedUntil > Date.now()) {
      socket.emit('error_msg', '你被禁言了');
      return;
    }
    const s = Math.max(2, Math.min(1000, Number(sides) || 6));
    const r = Math.max(1, Math.min(s, Number(result) || 1));
    pushMessage(channel, name, '', {
      kind: 'user', type: 'dice',
      dice: { sides: s, result: r },
    });
  });

  socket.on('create_channel', (rawName) => {
    const nm = String(rawName || '').trim();
    if (!nm || nm.length > 20 || isDmChannel(nm)) return;
    if (state.channels.includes(nm)) return;
    state.channels.push(nm);
    state.histories[nm] = [];
    saveState();
    broadcastChannels();
    io.emit('system_all', `${name} 创建了频道 #${nm}`);
  });

  socket.on('delete_channel', (nm) => {
    // 私聊频道：参与者随时可删；普通频道：至少保留一个
    if (isDmChannel(nm)) {
      if (!dmAllowed(nm, name)) return;
    } else if (state.channels.length <= 1) {
      return;
    }
    const idx = state.channels.indexOf(nm);
    if (idx === -1) return;
    io.to(nm).emit('channel_deleted', nm);

    const room = io.sockets.adapter.rooms.get(nm);
    if (room) {
      for (const id of room) {
        const s = io.sockets.sockets.get(id);
        if (s) { s.leave(nm); s.data.channel = null; }
      }
    }
    state.channels.splice(idx, 1);
    delete state.histories[nm];
    saveState();
    broadcastChannels();
    io.emit('system_all', `${name} 删除了频道 #${nm}`);
  });

  socket.on('disconnect', () => {
    if (socket.data.inBoard) {
      io.to('__board__').emit('board_users', getBoardUsers());
    }
    nameToSockets[name]?.delete(socket);
    if (nameToSockets[name]?.size === 0) delete nameToSockets[name];

    const channel = socket.data.channel;
    if (channel && name) {
      io.to(channel).emit('system', `${name} 离开了`);
      io.to(channel).emit('users', getUsers(channel));
    }
  });
});


// ============ 赛博捞鱼场 API ============


// ============ 英文情报局 ============
let enIntelData = [];
try { enIntelData = JSON.parse(fs.readFileSync(path.join(__dirname, 'intel-en.json'), 'utf8')); } catch { enIntelData = []; }

async function fetchEnglishNews() {
  try {
    console.log('[英文情报局] 开始抓取 CGTN 全球新闻...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://www.cgtn.com/subscribe/rss/section/world.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    const text = await res.text();
    const items = [...text.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<description>(.*?)<\/description>/g)];
    if (items.length === 0) return;

    const newIntel = items.slice(0, 4).map(m => {
      let title = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
      let desc = m[2].replace(/<!\[CDATA\[|\]\]>|<[^>]+>/g, '').trim();
      return { id: 'en-' + crypto.randomBytes(4).toString('hex'), title: title, text: desc || 'Read more...', author: 'CGTN World', time: Date.now(), isAuto: true };
    }).filter(i => i.title);

    const existingTitles = enIntelData.map(i => i.title);
    const freshNews = newIntel.filter(i => !existingTitles.includes(i.title));
    if (freshNews.length > 0) {
      enIntelData = [...freshNews, ...enIntelData].slice(0, 100);
      fs.writeFileSync(path.join(__dirname, 'intel-en.json'), JSON.stringify(enIntelData, null, 2));
      console.log('[英文情报局] ✅ 成功抓取到 ' + freshNews.length + ' 条新闻');
    }
  } catch (err) {
    // console.error('[英文情报局] ❌ 抓取失败:', err.message);
  }
}
setInterval(fetchEnglishNews, 30 * 60 * 1000);
setTimeout(fetchEnglishNews, 3000);

app.get('/api/intel/en', (req, res) => {
  res.json({ ok: true, intel: enIntelData });
});

app.post('/api/intel/en', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  
  const { title, text } = req.body || {};
  const t = String(title || '').trim();
  const txt = String(text || '').trim();
  if (!t || !txt) return res.status(400).json({ ok: false, msg: '标题和正文不能为空' });

  const item = {
    id: 'en-' + crypto.randomBytes(4).toString('hex'),
    title: t.slice(0, 100), text: txt.slice(0, 500),
    author: user.displayName || username, time: Date.now(), isAuto: false
  };
  
  enIntelData.unshift(item);
  if (enIntelData.length > 100) enIntelData = enIntelData.slice(0, 100);
  try { fs.writeFileSync(path.join(__dirname, 'intel-en.json'), JSON.stringify(enIntelData, null, 2)); } catch {}
  io.emit('intel_en_updated', item);
  res.json({ ok: true, intel: item });
});

// ============ 管理员命令 ============
function handleCommand(socket, text) {
  const parts = text.slice(1).trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const args = parts.slice(1);
  const name = socket.data.name;
  const user = state.users[name];

  if (cmd === 'admin') {
    if (args[0] === state.adminSecret) {
      user.isAdmin = true;
      saveState();
      socket.emit('system', '你已成为管理员');
      socket.emit('me', { name, isAdmin: true });
    } else socket.emit('error_msg', '口令错误');
    return;
  }

  if (cmd === 'help') {
    socket.emit('system', [
      '/admin <口令>     成为管理员',
      '/kick <用户>      踢出',
      '/mute <用户> [分]  禁言',
      '/unmute <用户>    解除禁言',
      '/ban <用户>       封禁',
      '/unban <用户>     解封',
      '/delete <用户>    删号',
      '/whoami           查看身份',
      '/myoranges        查看我的橘子',
      '/admin2 <口令>    成为超级管理员',
      '/addorange <用户> <数量>  加橘子（超管）',
      '/setorange <用户> <数量>  设橘子（超管）',
      '/block <用户>     拉黑（对方无法私聊你）',
      '/unblock <用户>   取消拉黑',
      '/blocklist        查看拉黑名单',
      '/remember <内容>  教 AI 记住一件事（4 小时）',
      '/memory           查看 AI 目前的记忆',
    ].join('\n'));
    return;
  }

  if (cmd === 'admin2') {
    if (args[0] === lobsterData.superAdminSecret) {
      user.isSuperAdmin = true;
      saveState();
      socket.emit('system', '你已成为超级管理员');
      console.log('[超管] ' + name + ' 成为超级管理员');
    } else {
      socket.emit('error_msg', '口令错误');
    }
    return;
  }

  if (cmd === 'myoranges') {
    const bal = getBalance(user.id);
    if (bal.oranges < 0) {
      socket.emit('system', '你欠 ' + (-bal.oranges).toFixed(2) + ' 🍊（无利息，跑任务自动偿还或找超管销账）· 累计消耗 ' + bal.totalSpent.toFixed(2));
    } else {
      socket.emit('system', '你当前有 ' + bal.oranges.toFixed(2) + ' 🍊（累计消耗 ' + bal.totalSpent.toFixed(2) + '）');
    }
    return;
  }

  if (cmd === 'addorange') {
    if (!user.isSuperAdmin) { socket.emit('error_msg', '只有超级管理员能加橘子'); return; }
    const targetName = args[0];
    const amount = Number(args[1]);
    if (!targetName || !state.users[targetName] || isNaN(amount)) {
      socket.emit('error_msg', '用法：/addorange <用户名> <数量>');
      return;
    }
    const target = state.users[targetName];
    const bal = getBalance(target.id);
    // 超管受信任：允许负数（帮家人销账）
    bal.oranges = Math.min(ORANGE_MAX, bal.oranges + amount);
    saveLobster(lobsterData);
    socket.emit('system', '已给 ' + targetName + ' 加 ' + amount + ' 🍊，当前 ' + bal.oranges.toFixed(2) + '（上限 ' + ORANGE_MAX + '）');
    console.log('[橘子] ' + name + ' 给 ' + targetName + ' 加 ' + amount);
    return;
  }

  if (cmd === 'setorange') {
    if (!user.isSuperAdmin) { socket.emit('error_msg', '只有超级管理员能设置橘子'); return; }
    const targetName = args[0];
    const amount = Number(args[1]);
    if (!targetName || !state.users[targetName] || isNaN(amount)) {
      socket.emit('error_msg', '用法：/setorange <用户名> <数量>');
      return;
    }
    const target = state.users[targetName];
    const bal = getBalance(target.id);
    // 超管受信任：允许设为负数（直接销账）
    bal.oranges = Math.min(ORANGE_MAX, amount);
    saveLobster(lobsterData);
    socket.emit('system', '已将 ' + targetName + ' 的橘子设为 ' + bal.oranges.toFixed(2) + '（上限 ' + ORANGE_MAX + '）');
    console.log('[橘子] ' + name + ' 设置 ' + targetName + ' 为 ' + amount);
    return;
  }

  if (cmd === 'clearintel') {
    if (!user.isSuperAdmin) { socket.emit('error_msg', '只有超级管理员能清空情报'); return; }
    
    let refundCount = 0;
    // 遍历所有情报，把奖励的橘子扣回来
    for (const item of intelData) {
      if (item.reward > 0 && item.author) {
        const author = state.users[item.author];
        if (author) {
          const bal = getBalance(author.id);
          bal.oranges -= item.reward;
          refundCount += item.reward;
        }
      }
    }
    saveLobster(lobsterData);
    
    intelData = [];
    saveIntel(intelData);
    io.emit('intel_updated', { reset: true });
    socket.emit('system', `已清空所有情报！并追回了 ${refundCount} 个被刷的橘子。`);
    return;
  }

  if (cmd === 'delintel') {
    if (!user.isSuperAdmin) { socket.emit('error_msg', '只有超级管理员能删情报'); return; }
    
    const keyword = args.join(' ');
    if (!keyword) { socket.emit('error_msg', '用法：/delintel 关键词'); return; }

    let deletedCount = 0;
    let refundCount = 0;
    
    // 倒序遍历，方便删除
    for (let i = intelData.length - 1; i >= 0; i--) {
      const item = intelData[i];
      if (item.text.includes(keyword) || (item.author && item.author.includes(keyword))) {
        // 追回橘子
        if (item.reward > 0 && item.author) {
          const author = state.users[item.author];
          if (author) {
            const bal = getBalance(author.id);
            bal.oranges -= item.reward;
            refundCount += item.reward;
          }
        }
        intelData.splice(i, 1);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      saveLobster(lobsterData);
      saveIntel(intelData);
      io.emit('intel_updated', { reset: true });
      socket.emit('system', `已删除 ${deletedCount} 条包含「${keyword}」的情报，并追回 ${refundCount} 个橘子。`);
    } else {
      socket.emit('system', `没有找到包含「${keyword}」的情报。`);
    }
    return;
  }

  if (cmd === 'whoami') {
    socket.emit('system', `你是 ${name}${user.isAdmin ? '（管理员）' : ''}`);
    return;
  }

  if (cmd === 'block') {
    const target = args[0];
    if (!target || !state.users[target]) { socket.emit('error_msg', '目标用户不存在'); return; }
    if (target === name) { socket.emit('error_msg', '不能拉黑自己'); return; }
    if (!user.blocked.includes(target)) user.blocked.push(target);
    saveState();
    broadcastToUser(name, 'blocked_list', user.blocked);
    socket.emit('system', `已拉黑 ${target}`);
    return;
  }

  if (cmd === 'unblock') {
    const target = args[0];
    const idx = (user.blocked || []).indexOf(target);
    if (idx === -1) { socket.emit('error_msg', '你没有拉黑这个用户'); return; }
    user.blocked.splice(idx, 1);
    saveState();
    broadcastToUser(name, 'blocked_list', user.blocked);
    socket.emit('system', `已取消拉黑 ${target}`);
    return;
  }

  if (cmd === 'blocklist') {
    const list = user.blocked || [];
    socket.emit('system', list.length ? '你的拉黑名单：' + list.join('、') : '拉黑名单是空的');
    return;
  }

  if (cmd === 'remember') {
    const text = args.join(' ').trim();
    if (!text) { socket.emit('error_msg', '用法：/remember 要记住的事'); return; }
    addMemory(text);
    socket.emit('system', `已记住了：「${text}」（保留 4 小时）`);
    return;
  }

  if (cmd === 'memory') {
    const cutoff = Date.now() - MEMORY_TTL;
    const recent = memories.filter(m => m.time > cutoff).slice(-10);
    if (recent.length === 0) { socket.emit('system', '目前没有任何记忆。用 /remember <内容> 教 AI 记住事情。'); }
    else socket.emit('system', 'AI 目前的记忆：\n' + recent.map(m => '- ' + m.text).join('\n'));
    return;
  }

  if (!user?.isAdmin) { socket.emit('error_msg', '没有管理员权限'); return; }
  const target = args[0];
  if (!target) { socket.emit('error_msg', '请指定目标用户'); return; }
  if (!state.users[target]) { socket.emit('error_msg', '目标用户不存在'); return; }
  if (target === name) { socket.emit('error_msg', '不能操作自己'); return; }

  const t = state.users[target];

  switch (cmd) {
    case 'kick': kickUser(target); io.emit('system_all', `${name} 踢出了 ${target}`); break;
    case 'mute': {
      const mins = Number(args[1]) || 5;
      t.mutedUntil = Date.now() + mins * 60000;
      saveState();
      io.emit('system_all', `${name} 禁言 ${target} ${mins} 分钟`);
      broadcastToUser(target, 'error_msg', `你被禁言了 ${mins} 分钟`);
      break;
    }
    case 'unmute': t.mutedUntil = 0; saveState(); io.emit('system_all', `${name} 解除了 ${target} 的禁言`); break;
    case 'ban':
      t.banned = true; saveState();
      for (const [tk, un] of Object.entries(tokens)) if (un === target) { delete tokens[tk]; delete tokenTimes[tk]; }
      kickUser(target);
      io.emit('system_all', `${name} 封禁了 ${target}`);
      break;
    case 'unban': t.banned = false; saveState(); io.emit('system_all', `${name} 解除了 ${target} 的封禁`); break;
    case 'delete':
      for (const [tk, un] of Object.entries(tokens)) if (un === target) { delete tokens[tk]; delete tokenTimes[tk]; }
      kickUser(target);
      delete state.users[target]; saveState();
      io.emit('system_all', `${name} 删除了账户 ${target}`);
      break;
    default: socket.emit('error_msg', `未知命令 /${cmd}`);
  }
}

function kickUser(username) {
  const sockets = nameToSockets[username];
  if (!sockets) return;
  for (const s of sockets) { s.emit('error_msg', '你被踢出了聊天室'); s.disconnect(true); }
  delete nameToSockets[username];
}

function broadcastToUser(username, event, payload) {
  const sockets = nameToSockets[username];
  if (!sockets) return;
  for (const s of sockets) s.emit(event, payload);
}

// ============ AI 调用 ============
async function callAI(url, model, messages, maxTokens) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.AI.fetchTimeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages,
        temperature: 0.5,
        max_tokens: maxTokens,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const msgObj = data.choices?.[0]?.message || {};
    let content = (msgObj.content || '').trim();

    // 截掉推理模型残留的思考标记
    const markers = ['</think', '</reasoning', '[/think]', '[end of thought]'];
    let cutAt = content.length;
    for (const m of markers) {
      const idx = content.toLowerCase().indexOf(m.toLowerCase());
      if (idx !== -1 && idx < cutAt) cutAt = idx;
    }
    content = content.slice(0, cutAt).trim();

    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function isAI2Online() {
  const modelsUrl = config.AI2.url.replace('/chat/completions', '/models');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(modelsUrl, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============ 严格判定 SKIP ============
function isSkipReply(reply) {
  if (!reply) return true;
  const t = reply.trim();
  if (t.length === 0) return true;
  if (t.toUpperCase().startsWith("SKIP")) return true;
  return false;
}

// ============ 检测 ============
async function triggerCheck(channel) {
  if (chatState.running) return;
  if (isChecking) return;
  isChecking = true;

  try {
    const recent = state.histories[channel].slice(-10)
      .filter(m => m.text)
      .map(m => `${m.name}: ${m.text}`).join('\n');

    let reply;
    try {
      reply = await callAI(config.AI1.url, config.AI1.model, [
        { role: 'system', content: `你是聊天室助手。
注意系统规则：本聊天室使用“橘子(🍊)”作为虚拟货币。橘子只能通过系统打赏、发红包、发情报获得，或由超级管理员发放。你作为 AI，没有权限发放或扣除橘子。如果有人向你索要橘子，请直接回 SKIP，不要理他。
只要有人提问（正经问题、玩笑问题、求助、请教），就直接用一句话回答，不超过30字。完全不是提问时才回SKIP。不要输出其他任何内容。` + getMemoryHint() },
        { role: 'user', content: `最近消息：\n${recent}\n\n按规则回答。` },
      ], config.AI.tokensCheck);
    } catch (err) {
      console.error('检测失败:', err.message);
      return;
    }

    console.log(`[${new Date().toLocaleTimeString()}] AI-1 返回:`, JSON.stringify(reply));

    if (isSkipReply(reply)) {
      console.log(`[${new Date().toLocaleTimeString()}] 判定为 SKIP，不触发`);
      return;
    }

    pushMessage(channel, config.AI1.name, reply, { kind: 'ai' });

    // 背景抽取记忆（不阻塞聊天）
    extractMemories(channel);

    const ai2Online = await isAI2Online();
    if (!ai2Online) {
      console.log(`[${new Date().toLocaleTimeString()}] AI-2 离线，跳过链式对话`);
      return;
    }

    chatState = {
      running: true,
      channel,
      round: 1,
      maxRounds: config.AI.maxRounds,
      timer: null,
    };
    chatState.timer = setTimeout(runChatChain, config.AI.delayBetween);
  } finally {
    isChecking = false;
  }
}

async function runChatChain() {
  if (!chatState.running) return;
  if (chatState.round >= chatState.maxRounds) { chatState.running = false; return; }

  const channel = chatState.channel;
  const isAI2Turn = chatState.round % 2 === 1;
  const cfg = isAI2Turn ? config.AI2 : config.AI1;
  const otherCfg = isAI2Turn ? config.AI1 : config.AI2;

  const recent = state.histories[channel].slice(-10)
    .filter(m => m.text)
    .map(m => `${m.name}: ${m.text}`).join('\n');

  try {
    const reply = await callAI(cfg.url, cfg.model, [
      { role: 'system', content: `你是 ${cfg.name}。直接说一句话，禁止思考过程，不超过 30 字。` + getObsHint() + getMemoryHint() },
      { role: 'user', content: `${recent}\n\n你是 ${cfg.name}，一句话回应 ${otherCfg.name}。` },
    ], config.AI.tokensChat);

    if (reply) pushMessage(channel, cfg.name, reply, { kind: 'ai' });
    chatState.round++;

    if (chatState.running && chatState.round < chatState.maxRounds) {
      chatState.timer = setTimeout(runChatChain, config.AI.delayBetween);
    } else {
      chatState.running = false;
    }
  } catch (err) {
    if (isAI2Turn) console.log(`[${new Date().toLocaleTimeString()}] AI-2 掉线，链式对话提前结束`);
    else console.error('AI-1 出错:', err.message);
    chatState.running = false;
  }
}

function isDmChannel(ch) {
  return typeof ch === 'string' && ch.startsWith('DM:');
}
function isBlockedBy(a, b) {
  const u = state.users[a];
  return !!(u && Array.isArray(u.blocked) && u.blocked.includes(b));
}
// 私聊频道的另一个人
function dmOther(ch, me) {
  const parts = ch.slice(3).split('|');
  return parts.find(n => n !== me);
}
// 消息类事件通用的私聊检查：不在频道里或被拉黑都拦截
function dmSendBlocked(channel, name) {
  if (!isDmChannel(channel)) return false;
  if (!dmAllowed(channel, name)) return true;
  const other = dmOther(channel, name);
  return isBlockedBy(name, other) || isBlockedBy(other, name);
}
function dmAllowed(ch, username) {
  const parts = ch.slice(3).split('|');
  return parts.includes(username);
}
function channelsFor(username) {
  return state.channels.filter(c => !isDmChannel(c) || dmAllowed(c, username));
}
function broadcastChannels() {
  for (const [id, sock] of io.sockets.sockets) {
    sock.emit('channels', channelsFor(sock.data.name));
  }
}

// 背景抽取记忆：让 AI-1 从最近的对话中挑出值得记住的事实
async function extractMemories(channel) {
  try {
    const recent = state.histories[channel].slice(-10)
      .filter(m => m.text && m.kind === 'user')
      .map(m => `${m.name}: ${m.text}`).join('\n');
    if (!recent) return;
    const reply = await callAI(config.AI1.url, config.AI1.model, [
      { role: 'system', content: '从对话中抽取值得记住的事实（例如：喜好、名字、约定、重要事件）。每行一条，每条不超过 20 字。如果没有值得记的事，只输出「无」。不要输出其他内容。' + getMemoryHint() },
      { role: 'user', content: `对话：\n${recent}\n\n抽取记忆。` },
    ], 200);
    if (!reply || reply.toUpperCase().startsWith('无') || reply.toUpperCase().startsWith('SKIP')) return;
    for (const line of reply.split('\n')) {
      const t = line.replace(/^[-•\d.\s]+/, '').trim();
      if (t && t.length >= 2 && !t.toUpperCase().startsWith('无')) addMemory(t);
    }
  } catch (err) {
    console.error('记忆抽取失败:', err.message);
  }
}

function getBoardUsers() {
  const room = io.sockets.adapter.rooms.get('__board__');
  if (!room) return [];
  return Array.from(room)
    .map(id => io.sockets.sockets.get(id)?.data.name)
    .filter(Boolean);
}

function getUsers(channel) {
  const room = io.sockets.adapter.rooms.get(channel);
  if (!room) return [];
  return Array.from(room).map(id => io.sockets.sockets.get(id)?.data.name).filter(Boolean);
}


// 全局错误处理：永远返回 JSON


app.use((err, req, res, next) => {
  console.error('服务端错误:', err.message);
  res.status(err.status || 500).json({ ok: false, msg: err.message || '服务器错误' });
});

// ============ 家庭情报局 ============
// ============ 情报局 KPI ============
const INTEL_MEMBERS_FILE = path.join(__dirname, 'intel-members.json');
function loadIntelMembers() {
  try { return JSON.parse(fs.readFileSync(INTEL_MEMBERS_FILE, 'utf8')); }
  catch { return { members: {}, lastSettleDate: null }; }
}
function saveIntelMembers(d) {
  try { fs.writeFileSync(INTEL_MEMBERS_FILE, JSON.stringify(d, null, 2)); } catch {}
}
let intelMembers = loadIntelMembers();
if (!intelMembers.members) intelMembers.members = {};

// 欠账锁：余额 < 0 时禁止花钱/转出
function debtLocked(userId) {
  return getBalance(userId).oranges < 0;
}
function debtBlock(res) {
  res.status(403).json({ ok: false, msg: '欠账中，先还清债务再用橘子功能' });
  return true;
}

const INTEL_DAILY_QUOTA = 10;       // 第 8 天起的每日配额
const INTEL_NEWBIE_QUOTA = 5;       // 前 7 天的每日配额
const INTEL_NEWBIE_DAYS = 7;
function getIntelQuota(m) {
  if (!m || !m.joinedAt) return INTEL_DAILY_QUOTA;
  const days = Math.floor((Date.now() - m.joinedAt) / 86400000);
  return days < INTEL_NEWBIE_DAYS ? INTEL_NEWBIE_QUOTA : INTEL_DAILY_QUOTA;
}
const INTEL_PENALTY = 10;
const INTEL_STREAK_REWARD = 5000;
const INTEL_STREAK_DAYS = 30;
const INTEL_VALID_SCORE = 4;

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function yesterdayStr() {
  const d = new Date(Date.now() - 86400000);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// 加入
app.post('/api/intel/join', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  if (!user) return res.status(401).json({ ok: false, msg: '用户不存在' });
  if (intelMembers.members[user.id]) return res.json({ ok: false, msg: '你已经在情报局了' });
  intelMembers.members[user.id] = {
    joinedAt: Date.now(),
    lastSubmitDate: todayStr(),
    todayCount: 0,
    streak: 0,
    lastRewardStreak: 0,
    debt: 0,
  };
  saveIntelMembers(intelMembers);
  console.log('[情报局] ' + username + ' 加入');
  res.json({ ok: true, member: intelMembers.members[user.id] });
});

// 退出
app.post('/api/intel/leave', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  if (!user) return res.status(401).json({ ok: false, msg: '用户不存在' });
  if (!intelMembers.members[user.id]) return res.json({ ok: false, msg: '你不在情报局' });
  delete intelMembers.members[user.id];
  saveIntelMembers(intelMembers);
  console.log('[情报局] ' + username + ' 退出');
  res.json({ ok: true });
});

// 我的状态
app.get('/api/intel/status', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  if (!user) return res.status(401).json({ ok: false, msg: '用户不存在' });
  const m = intelMembers.members[user.id];
  const bal = getBalance(user.id);
  if (!m) return res.json({ ok: true, joined: false, oranges: bal.oranges, debtLocked: bal.oranges < 0 });
  // 跨天重置 todayCount（不结算，结算由定时器做）
  if (m.lastSubmitDate !== todayStr()) {
    // 只重置计数，不在这里扣款
  }
  res.json({
    ok: true, joined: true,
    todayCount: m.todayCount,
    todayQuota: getIntelQuota(m),
    streak: m.streak,
    debt: m.debt || 0,
    oranges: bal.oranges,
    debtLocked: bal.oranges < 0,
  });
});

// ============ 情报局每日结算 ============
function settleIntelDaily() {
  const today = todayStr();
  const yesterday = yesterdayStr();
  if (intelMembers.lastSettleDate === today) return;  // 今天已结算过

  let settled = 0, penalized = 0, rewarded = 0;
  for (const uid of Object.keys(intelMembers.members)) {
    const m = intelMembers.members[uid];
    if (!m) continue;

    // 判断昨天是否达标（lastSubmitDate 应为昨天，且 todayCount >= 10）
    const metQuota = (m.lastSubmitDate === yesterday) && ((m.todayCount || 0) >= getIntelQuota(m));

    if (metQuota) {
      m.streak = (m.streak || 0) + 1;
      // 每满 30 天发一次 5000
      const canReward = (m.streak - (m.lastRewardStreak || 0)) >= INTEL_STREAK_DAYS;
      if (canReward) {
        const b = getBalance(uid);
        b.oranges = Math.min(ORANGE_MAX, b.oranges + INTEL_STREAK_REWARD);
        m.lastRewardStreak = m.streak;
        saveLobster(lobsterData);
        rewarded++;
        console.log('[情报局] ' + uid + ' 连续 ' + m.streak + ' 天达标，奖励 ' + INTEL_STREAK_REWARD + ' 🍊');
      }
    } else {
      // 未达标：扣 100，可负，streak 归零
      const b = getBalance(uid);
      b.oranges -= INTEL_PENALTY;
      m.debt = (m.debt || 0) + INTEL_PENALTY;
      m.streak = 0;
      m.lastRewardStreak = 0;
      saveLobster(lobsterData);
      penalized++;
      console.log('[情报局] ' + uid + ' 昨日未达标，扣 ' + INTEL_PENALTY + ' 🍊，当前余额 ' + b.oranges);
    }

    // 重置今日计数
    m.todayCount = 0;
    m.lastSubmitDate = today;
    settled++;
  }

  intelMembers.lastSettleDate = today;
  saveIntelMembers(intelMembers);
  if (settled > 0) {
    console.log('[情报局] 结算完成：' + settled + ' 人，惩罚 ' + penalized + '，奖励 ' + rewarded);
  }
}

// 临时测试路由：仅超管可调，测完删
app.post('/api/intel/settle-test', (req, res) => {
  const username = tokens[req.headers.authorization];
  if (!username) return res.status(401).json({ ok: false });
  const user = state.users[username];
  if (!user || !user.isSuperAdmin) return res.status(403).json({ ok: false, msg: '仅超管' });
  settleIntelDaily();
  res.json({ ok: true, members: intelMembers.members, lastSettleDate: intelMembers.lastSettleDate });
});

// 每 30 秒检查一次，到 0:05 就结算
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 5) {
    settleIntelDaily();
  }
}, 30 * 1000);



// ============ 万能数据站 /api/hub/* ============


// ============ 自动情报爬虫 (最终稳定版) ============
let recentIntelTitles = new Set();
async function fetchIntelFromInternet() {
  try {
    // 使用 60s API 提供的知乎热榜（国内直连非常快，且不会封 IP）
    const res = await fetch('https://60s.viki.moe/v2/zhihu');
    const ct = res.headers.get('content-type');
    if (!ct || !ct.includes('application/json')) throw new Error('60s API returned non-JSON');
    const data = await res.json();
    
    if (!data || !data.data || data.data.length === 0) return;

    // 随机挑一条热搜
    const randomItem = data.data[Math.floor(Math.random() * data.data.length)];
    const hotTitle = randomItem.title || randomItem.name;

    if (!hotTitle) return;

    // 防止抓到相同的标题
    if (recentIntelTitles.has(hotTitle)) return;
    recentIntelTitles.add(hotTitle);
    if (recentIntelTitles.size > 50) {
      const first = recentIntelTitles.values().next().value;
      recentIntelTitles.delete(first);
    }

    // 为了省算力，直接贴热搜，不调 AI 改写了
    let intelText = hotTitle;
    let authorName = '📡 热搜速递';

    const intelItem = {
      id: 'intel-' + crypto.randomBytes(4).toString('hex'),
      text: intelText,
      type: 'gossip',
      author: authorName,
      authorName: authorName,
      time: Date.now(),
      reward: 0
    };
    
    intelData.unshift(intelItem);
    if (intelData.length > 100) intelData = intelData.slice(0, 100);
    saveIntel(intelData);

    io.emit('intel_updated', intelItem);
    console.log(`[情报局] 自动贴上：${intelText}`);
  } catch (err) {
    // 静默失败，防止刷屏报错
    if (err.message !== 'fetch failed' && !err.message.includes('timeout')) {
      // console.error('[情报局] 抓取异常:', err.message);
    }
  }
}

// 启动 5 秒后抓第一次，之后每 2 分钟抓一次（降低频率防封）
setTimeout(fetchIntelFromInternet, 5000);
setInterval(fetchIntelFromInternet, 2 * 60 * 1000);

// ============ 老板总控台 API ============





// ============ 贪吃蛇挂载 ============

// ============ 贪吃蛇唯一挂载 ============
const setupSnakeRouter = require('./snake-router');
setupSnakeRouter(io, {});

const isAIBusy = () => !!(chatState.running || isChecking);
const mountAllFeatures = require('./center');
mountAllFeatures(app, io, {
  tokens, state, saveState, tokenTimes,
  lobsterData, saveLobster, getBalance, addOrangeLog, ORANGE_DEFAULT, ORANGE_MAX,
  foodData, saveFood, intelData, saveIntel, marketData, saveMarket,
  listData, saveLists, writingsData, saveWritings, moneyLedgerData, saveMoneyLedger,
  pushMessage, broadcastUserUpdate, broadcastChannels, channelsFor, ensureChannel,
  callAI, io, bus, addObservation,
  AVATAR_DIR, UPLOAD_DIR,
  handleCommand, kickUser, broadcastToUser, nameToSockets,
  FOOD_DICT,
  isAIBusy,
  callAI,
  config,
});
const PORT = 3000;
server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('========================================');
  console.log(`  聊天服务跑在 http://0.0.0.0:${PORT}`);
  console.log('');
  console.log(`  管理员口令: ${state.adminSecret}`);
  console.log(`  超级管理员口令: ${lobsterData.superAdminSecret}`);
  console.log('  在聊天框输入 /admin <口令> 即可成为管理员');
  console.log('');
  console.log(`  设备 API 密钥: ${config.DEVICE_API_KEY}`);
  console.log('  设备推送: POST /api/device/say');
  console.log('========================================');
  console.log('');
});


// ============ 图文广场 API (紧急修复) ============