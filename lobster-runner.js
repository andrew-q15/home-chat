// ============ 龙虾任务运行器 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const LOBSTER_LIB = require('/Users/jianmingqu/codepilot/lib.js');

const running = new Map();
const queue = [];
let currentTask = null;

const WORK_ROOT = '/Users/jianmingqu/localaiwork';
if (!fs.existsSync(WORK_ROOT)) fs.mkdirSync(WORK_ROOT, { recursive: true });

function userWorkDir(userId) {
  const d = path.join(WORK_ROOT, userId);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  if (!fs.existsSync(path.join(d, '.git'))) {
    try {
      const { execSync } = require('child_process');
      execSync('git init', { cwd: d, stdio: 'pipe' });
      execSync('git config user.email "lobster@local"', { cwd: d, stdio: 'pipe' });
      execSync('git config user.name "Lobster"', { cwd: d, stdio: 'pipe' });
      execSync('git commit --allow-empty -m "init"', { cwd: d, stdio: 'pipe' });
    } catch (e) {}
  }
  return d;
}

module.exports = function setupLobsterRunner(app, ctx) {
  // 拦截并防止 ctx.saveState 报错
  const safeSaveState = typeof ctx.saveState === 'function' ? ctx.saveState : () => {};
  ctx.saveState = safeSaveState;
  function auth(req, res, next) {
    // EventSource 不能带 header，允许 query 传 token（仅用于 SSE）
    const token = req.headers.authorization || req.query.token;
    const username = ctx.tokens[token];
    if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
    req.username = username;
    req.user = ctx.state.users[username];
    next();
  }

  app.post('/api/lobster/run', auth, async (req, res) => {
    const task = String((req.body && req.body.task) || '').trim();
    if (!task) return res.status(400).json({ ok: false, msg: '任务不能为空' });
    if (task.length > 500) return res.status(400).json({ ok: false, msg: '任务太长' });

    // 欠账锁：余额 < 0 时不能跑龙虾
    if (ctx.getBalance(req.user.id).oranges < 0) {
      return res.status(403).json({ ok: false, msg: '欠账中，先还清债务再用橘子功能' });
    }

    // 余额不够也能跑：自动欠账，无利息（购物市场不适用，买货必须真金白银）
    const bal = ctx.getBalance(req.user.id);
    if (bal.oranges < 0) return res.status(403).json({ ok: false, msg: '欠账中，先还清债务再跑龙虾' });

    const taskId = 'lt-' + crypto.randomBytes(6).toString('hex');
    const entry = {
      taskId, userId: req.user.id, username: req.username, task,
      steps: [], tokens: 0, status: 'queued', clients: [],
      createdAt: Date.now(), startedAt: null, finishedAt: null, result: null,
    };
    running.set(taskId, entry);
    queue.push(taskId);
    if (!currentTask) runNext();
    res.json({ ok: true, taskId, position: queue.indexOf(taskId) + 1 });
  });

  app.get('/api/lobster/stream/:taskId', auth, (req, res) => {
    const entry = running.get(req.params.taskId);
    if (!entry) return res.status(404).json({ ok: false, msg: '任务不存在' });
    if (entry.userId !== req.user.id && !req.user.isSuperAdmin) {
      return res.status(403).json({ ok: false, msg: '无权查看' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    entry.steps.forEach(s => res.write('data: ' + JSON.stringify(s) + '\n\n'));
    res.write('data: ' + JSON.stringify({ type: 'status', status: entry.status, tokens: entry.tokens }) + '\n\n');

    if (entry.pendingApproval) {
      res.write('data: ' + JSON.stringify({ type: 'approval_request', kind: 'network', cmd: entry.pendingApproval.cmd }) + '\n\n');
    }

    if (entry.status === 'done' || entry.status === 'error') {
      res.write('data: ' + JSON.stringify({ type: 'finish', result: entry.result }) + '\n\n');
      return res.end();
    }

    const client = { res };
    entry.clients.push(client);
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (e) {} }, 15000);

    req.on('close', () => {
      clearInterval(hb);
      entry.clients = entry.clients.filter(c => c !== client);
    });
  });

  // 用户审批任务中的联网请求
  app.post('/api/lobster/approve/:taskId', auth, (req, res) => {
    const entry = running.get(req.params.taskId);
    if (!entry) return res.status(404).json({ ok: false, msg: '任务不存在' });
    if (entry.userId !== req.user.id && !req.user.isSuperAdmin) {
      return res.status(403).json({ ok: false, msg: '无权审批' });
    }
    if (!entry.pendingApproval) return res.status(400).json({ ok: false, msg: '当前没有待审批的请求' });
    const approve = !!(req.body && req.body.approve);
    entry.pendingApproval.resolve(approve);
    entry.pendingApproval = null;
    broadcast(entry, { type: 'approval_result', approved: approve });
    res.json({ ok: true });
  });

  app.get('/api/lobster/task/:taskId', auth, (req, res) => {
    const entry = running.get(req.params.taskId);
    if (!entry) return res.status(404).json({ ok: false });
    if (entry.userId !== req.user.id && !req.user.isSuperAdmin) return res.status(403).json({ ok: false });
    res.json({ ok: true, taskId: entry.taskId, status: entry.status, steps: entry.steps, tokens: entry.tokens, result: entry.result });
  });

  function broadcast(entry, msg) {
    entry.clients.forEach(c => { try { c.res.write('data: ' + JSON.stringify(msg) + '\n\n'); } catch (e) {} });
  }

  function finishTask(entry, status, result) {
    entry.status = status;
    entry.result = result;
    entry.finishedAt = Date.now();
    broadcast(entry, { type: 'finish', result: result });
    entry.clients.forEach(c => { try { c.res.end(); } catch (e) {} });
    entry.clients = [];
  }

  async function runNext() {
    if (queue.length === 0) { currentTask = null; return; }
    const taskId = queue.shift();
    const entry = running.get(taskId);
    if (!entry) return runNext();

    currentTask = taskId;
    entry.status = 'running';
    entry.startedAt = Date.now();
    broadcast(entry, { type: 'status', status: 'running' });

    const workDir = userWorkDir(entry.userId);
    console.log('[龙虾] 开始 ' + taskId + ' 用户 ' + entry.username + '：' + entry.task);

    try {
      // 1. 发起任务前，先向用户申请授权
      broadcast(entry, { type: 'approval_request', kind: 'task', msg: '龙虾请求调用工具和扣除橘子来执行此任务，是否同意？' });
      
      const approved = await new Promise(resolve => {
        entry.pendingApproval = { resolve };
        setTimeout(() => {
          if (entry.pendingApproval) {
            entry.pendingApproval = null;
            broadcast(entry, { type: 'approval_result', approved: false, msg: '审批超时，任务已取消。' });
            resolve(false);
          }
        }, 5 * 60 * 1000);
      });

      if (!approved) {
        throw new Error('用户拒绝了龙虾的调用请求');
      }

      broadcast(entry, { type: 'approval_result', approved: true, msg: '老板已同意，开始执行！' });

      // 2. 开始执行任务
      const result = await LOBSTER_LIB.runTask(entry.task, {
        workDir, autoApprove: true, maxSteps: 20, maxTokens: 500000,
        onStep: (s) => { entry.steps.push(s); broadcast(entry, { type: 'step', step: s }); },
        // 联网审批：向任务发起人推送请求，等他点击同意/拒绝（10 分钟超时自动拒绝）
        approveNetwork: ({ cmd }) => new Promise((resolve) => {
          entry.pendingApproval = { cmd, resolve, timer: null };
          broadcast(entry, { type: 'approval_request', kind: 'network', cmd });
          console.log('[龙虾] 联网审批请求 ' + entry.username + '：' + cmd.slice(0, 100));
          entry.pendingApproval.timer = setTimeout(() => {
            if (entry.pendingApproval && entry.pendingApproval.resolve === resolve) {
              entry.pendingApproval = null;
              broadcast(entry, { type: 'approval_result', approved: false, timeout: true });
              resolve(false);
            }
          }, 10 * 60 * 1000);
        }),
      });

      const used = result.tokens || 0;
      // 计费：100 token = 1 🍊（不足 100 也按 1 🍊 起）
      const charged = Math.max(1, Math.ceil(used / 100));
      const bal = ctx.getBalance(entry.userId);
      bal.oranges -= charged;
      bal.totalSpent = (bal.totalSpent || 0) + charged;
      entry.tokens = used;

      // ===== 累计 10 次成功任务送 1 个 🦞 =====
      if (result.ok) {
        const u = ctx.state.users[entry.username];
        if (u) {
          u.lobsterTaskCount = (u.lobsterTaskCount || 0) + 1;
          if (u.lobsterTaskCount % 10 === 0) {
            if (!ctx.foodData.inventory[u.id]) ctx.foodData.inventory[u.id] = {};
            const inv = ctx.foodData.inventory[u.id];
            inv['🦞'] = (inv['🦞'] || 0) + 1;
            ctx.saveFood(ctx.foodData);
            ctx.saveState();
            console.log('[龙虾] ' + entry.username + ' 累计 ' + u.lobsterTaskCount + ' 次成功任务，送 1 个 🦞');
          } else {
            ctx.saveState();
          }
        }
      }


      // 安全写入历史记录，防止因为缺少函数导致任务崩溃
      try {
        ctx.lobsterData.history.push({
          time: Date.now(), taskId: entry.taskId, userId: entry.userId, username: entry.username,
          task: entry.task, tokens: used, charged: charged, ok: result.ok, balanceAfter: bal.oranges,
        });
        if (ctx.lobsterData.history.length > 1000) ctx.lobsterData.history = ctx.lobsterData.history.slice(-1000);
        ctx.saveLobster(ctx.lobsterData);
        if (typeof ctx.saveState === 'function') ctx.saveState();
      } catch (e) {
        console.error('记录历史失败:', e.message);
      }

      console.log('[龙虾] 完成 ' + taskId + '，' + used + ' token = ' + charged + ' 🍊' + (bal.oranges < 0 ? '（欠款 ' + (-bal.oranges) + ' 🍊）' : ''));
      finishTask(entry, result.ok ? 'done' : 'error', {
        ok: result.ok, msg: result.msg, tokens: used, charged: charged, orangesLeft: bal.oranges,
        debt: bal.oranges < 0 ? -bal.oranges : 0,
      });
    } catch (err) {
      console.error('[龙虾] 失败 ' + taskId + '：', err.message);
      finishTask(entry, 'error', { ok: false, msg: err.message, tokens: entry.tokens });
    }

    currentTask = null;
    setImmediate(runNext);
  }

  console.log('[龙虾] 运行器已挂载');
};
