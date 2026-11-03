// ============ 夜间 AI 调度框架 ============
const path = require('path');
const fs = require('fs');

module.exports = function setupNightAI(app, ctx) {
  const { tokens, state, callAI, config, io } = ctx;
  if (!callAI) throw new Error('night-ai-router 需要 ctx.callAI，请检查 server.js 是否传入');
  if (!config) throw new Error('night-ai-router 需要 ctx.config，请检查 server.js 是否传入');

  const FILE = path.join(__dirname, 'night-ai.json');
  const OUT_DIR = path.join(__dirname, 'night-outputs');
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

  function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { tasks: [], history: [] }; } }
  function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch {} }
  let data = load();
  if (!data.tasks) data.tasks = [];
  if (!data.history) data.history = [];

  const inNightWindow = () => {
    const h = new Date().getHours();
    return h >= 23 || h < 7;
  };
  const isAIBusy = () => typeof ctx.isAIBusy === 'function' ? ctx.isAIBusy() : false;

  async function runOneTask(task) {
    console.log('[夜间AI] 开始执行任务:', task.id);
    try {
      const reply = await callAI(config.AI1.url, config.AI1.model, [
        { role: 'system', content: '你是一个批量内容生成器。只输出内容，不要解释。' },
        { role: 'user', content: task.prompt }
      ], task.maxTokens || 1000);

      if (!reply) throw new Error('AI 返回空');
      const lines = reply.split('\n').map(l => l.trim()).filter(Boolean).slice(0, task.count || 10);

      if (lines.length === 0) throw new Error('解析后无内容');

      const outFile = path.join(OUT_DIR, task.outputFile);
      let outData = [];
      try { outData = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch {}
      if (!Array.isArray(outData)) outData = [];
      outData.unshift({ time: Date.now(), task: task.id, items: lines });
      if (outData.length > 100) outData = outData.slice(0, 100);
      fs.writeFileSync(outFile, JSON.stringify(outData, null, 2));

      task.lastRun = Date.now();
      task.lastResult = '成功生成 ' + lines.length + ' 条';
      task.lastError = null;
      data.history.unshift({ time: Date.now(), taskId: task.id, result: task.lastResult });
      if (data.history.length > 100) data.history = data.history.slice(0, 100);
      save(data);
      console.log('[夜间AI] 任务完成:', task.id, task.lastResult);
    } catch (e) {
      task.lastError = e.message;
      task.lastRun = Date.now();
      data.history.unshift({ time: Date.now(), taskId: task.id, error: e.message });
      if (data.history.length > 100) data.history = data.history.slice(0, 100);
      save(data);
      console.error('[夜间AI] 任务失败:', task.id, e.message);
    }
  }

  // 定时调度器：每 5 分钟检查一次
  setInterval(async () => {
    if (!inNightWindow()) return;
    if (isAIBusy()) return;
    if (data.tasks.length === 0) return;

    for (const task of data.tasks) {
      if (task.lastRun && Date.now() - task.lastRun < 60 * 60 * 1000) continue;
      await runOneTask(task);
      await new Promise(r => setTimeout(r, 2000));
    }
  }, 5 * 60 * 1000).unref();

  // 超管注册任务接口
  app.post('/api/night-ai/register-task', (req, res) => {
    const username = tokens[req.headers.authorization];
    const user = username ? state.users[username] : null;
    if (!user || !user.isSuperAdmin) return res.status(403).json({ ok: false, msg: '仅超管' });

    const { adminSecret, id, name, prompt, outputFile, count, maxTokens } = req.body || {};
    if (adminSecret !== ctx.lobsterData.superAdminSecret) {
      return res.status(403).json({ ok: false, msg: '超管密码错误' });
    }

    if (!id || !/^[a-z0-9_-]{1,30}$/.test(id)) return res.json({ ok: false, msg: 'id 格式错误' });
    if (!name || name.length > 50) return res.json({ ok: false, msg: 'name 1-50 字' });
    if (!prompt || prompt.length > 500) return res.json({ ok: false, msg: 'prompt 1-500 字' });
    if (!outputFile || !/^[a-z0-9_-]{1,50}\.json$/.test(outputFile)) return res.json({ ok: false, msg: 'outputFile 格式错误，只允许 xxx.json' });

    const c = Number(count) || 10;
    const mt = Number(maxTokens) || 1000;
    if (c < 1 || c > 100) return res.json({ ok: false, msg: 'count 1-100' });
    if (mt < 100 || mt > 2000) return res.json({ ok: false, msg: 'maxTokens 100-2000' });

    const existingIdx = data.tasks.findIndex(t => t.id === id);
    const newTask = { id, name, prompt, outputFile, count: c, maxTokens: mt, lastRun: null, lastResult: null, lastError: null };
    if (existingIdx >= 0) {
      data.tasks[existingIdx] = newTask;
    } else {
      if (data.tasks.length >= 20) return res.json({ ok: false, msg: '任务队列已达上限 20 个' });
      data.tasks.push(newTask);
    }
    save(data);
    res.json({ ok: true, msg: '任务已注册' });
  });

  // 查看状态
  app.get('/api/night-ai/status', (req, res) => {
    const username = tokens[req.headers.authorization];
    const user = username ? state.users[username] : null;
    if (!user || !user.isSuperAdmin) return res.status(403).json({ ok: false, msg: '仅超管' });
    res.json({ ok: true, tasks: data.tasks, history: data.history.slice(0, 30) });
  });

  // 手动触发
  app.post('/api/night-ai/run', async (req, res) => {
    const username = tokens[req.headers.authorization];
    const user = username ? state.users[username] : null;
    if (!user || !user.isSuperAdmin) return res.status(403).json({ ok: false, msg: '仅超管' });
    
    if (isAIBusy()) return res.json({ ok: false, msg: 'AI 正在忙碌中，稍后再试' });
    
    res.json({ ok: true, msg: '任务已开始执行，请查看日志或稍后刷新状态' });
    
    (async () => {
      for (const task of data.tasks) {
        await runOneTask(task);
        await new Promise(r => setTimeout(r, 2000));
      }
    })();
  });

  // 暴露给外部注册（供其他 router 调用）
  ctx.registerNightTask = (task) => {
    if (!task.id || !task.prompt || !task.outputFile) return false;
    data.tasks.push(task);
    save(data);
    return true;
  };

  console.log('[夜间AI] 夜间调度器已挂载，队列长度 ' + data.tasks.length);
};
