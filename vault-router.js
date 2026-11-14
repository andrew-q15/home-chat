const path = require('path');
const fs = require('fs');

module.exports = function setupVault(app, ctx) {
  const VAULT_FILE = path.join(__dirname, 'vault.json');
  
  function loadVault() {
    try { return JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8')); } catch { return []; }
  }
  function saveVault(data) {
    try { fs.writeFileSync(VAULT_FILE, JSON.stringify(data, null, 2)); } catch {}
  }

  let vaultData = loadVault();

  // 获取所有记忆（分页/最新）
  app.get('/api/vault', (req, res) => {
    if (!ctx.tokens[req.headers.authorization]) return res.status(401).json({ ok: false, msg: '未登录' });
    res.json({ ok: true, vault: vaultData.slice(0, 100) });
  });

  // 添加记忆
  app.post('/api/vault', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
    
    const { title, content } = req.body || {};
    if (!title || !content) return res.json({ ok: false, msg: '标题和内容不能为空' });

    const user = ctx.state.users[username];
    const item = {
      id: 'v-' + require('crypto').randomBytes(4).toString('hex'),
      title: String(title).slice(0, 50),
      content: String(content).slice(0, 5000),
      author: user.displayName || username,
      time: Date.now()
    };
    
    vaultData.unshift(item);
    saveVault(vaultData);
    
    // 广播给其他人（如果有开着的页面）
    ctx.io.emit('vault_updated', item);
    res.json({ ok: true, item });
  });

  // 语义搜索（极简版：使用 AI 提取关键词，然后在本地做相关度匹配）
  app.post('/api/vault/search', async (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });

    const query = String(req.body.query || '').trim();
    if (!query) return res.json({ ok: false, msg: '搜索内容不能为空' });

    // 1. 让本地 AI 先把问题提炼成关键词（解决长句匹配不准的问题）
    let keywords = query;
    try {
      const kwReply = await ctx.callAI(ctx.config.AI1.url, ctx.config.AI1.model, [
        { role: 'system', content: '你是一个搜索引擎。请从用户的提问中提取 2-3 个核心关键词，用空格隔开。不要输出任何多余的解释。' },
        { role: 'user', content: query }
      ], 50);
      if (kwReply && kwReply.trim()) keywords = kwReply.trim();
    } catch(e) {}

    const kwArray = keywords.toLowerCase().split(/[\s,，]+/).filter(k => k.length > 0);

    // 2. 在本地进行“向量化打分”（基于关键词出现频率）
    let scored = vaultData.map(item => {
      let score = 0;
      const text = (item.title + ' ' + item.content).toLowerCase();
      
      kwArray.forEach(kw => {
        // 标题里出现，权重给 5 分
        if (item.title.toLowerCase().includes(kw)) score += 5;
        // 内容里出现，权重给 2 分
        const count = (text.split(kw).length - 1);
        score += count * 2;
      });
      
      return { item, score };
    });

    // 3. 过滤掉 0 分的，按分数降序排列，取前 3 条送给 AI 总结
    scored = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, 3).map(s => s.item);

    if (topResults.length === 0) {
      return res.json({ ok: true, answer: '记忆库中没有找到相关的记录哦。你可以第一个把它存进去！', results: [] });
    }

    // 4. 把检索到的相关记忆喂给 AI，让 AI 融合生成最终回答
    let contextText = topResults.map((r, i) => `【记忆${i+1}】标题: ${r.title}\n内容: ${r.content}`).join('\n\n');
    
    let finalAnswer = '';
    try {
      const aiReply = await ctx.callAI(ctx.config.AI1.url, ctx.config.AI1.model, [
        { role: 'system', content: '你是一个记忆库助手。请根据检索到的记忆内容回答用户的问题。如果记忆中有答案，就总结出来；如果不够明确，就直接列出相关记忆。保持回答简短。' },
        { role: 'user', content: `用户问题：${query}\n\n检索到的记忆：\n${contextText}` }
      ], 600);
      
      finalAnswer = aiReply;
      const markers = ['</think', '</reasoning'];
      for (const m of markers) {
        const idx = finalAnswer.toLowerCase().indexOf(m.toLowerCase());
        if (idx !== -1) finalAnswer = finalAnswer.slice(0, idx).trim();
      }
    } catch(e) {
      finalAnswer = '找到了一些相关记忆，但 AI 大脑暂时卡壳了。你可以直接查看下方的相关记录。';
    }

    res.json({ ok: true, answer: finalAnswer, results: topResults });
  });

  console.log('[仓储] 共享记忆库模块已挂载');
};
