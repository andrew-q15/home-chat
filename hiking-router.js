const path = require('path');
const fs = require('fs');

module.exports = function setupHiking(app, ctx) {
  const DATA_FILE = path.join(__dirname, 'hiking.json');
  
  // 读取用户装备
  app.get('/api/hiking', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    let data = {};
    try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}
    res.json({ ok: true, items: data[username] || [] });
  });

  // 保存装备并让 AI 分析
  app.post('/api/hiking/analyze', async (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    
    const items = req.body.items || []; // [{ name, weight, category }]
    if (!items.length) return res.json({ ok: false, msg: '请先添加装备' });

    let data = {};
    try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}
    data[username] = items;
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); } catch {}

    // 计算总重量
    let totalWeight = 0;
    let summary = '';
    items.forEach(it => {
      totalWeight += Number(it.weight);
      summary += `- ${it.name} (${it.category}): ${it.weight}g\n`;
    });

    // 调用 AI 进行轻量化分析
    const prompt = `你是一个极其专业的户外徒步装备轻量化顾问。
老板的当前总基础重量是：${totalWeight} 克（不含食物和水）。
装备清单如下：
${summary}
请给出一段不超过 150 字的专业评估：1. 是否超重 2. 指出哪件装备太重需要替换 3. 给出一个实用的减重建议。直接输出结果，不要废话。`;

    try {
      const aiReply = await ctx.callAI(ctx.config.AI1.url, ctx.config.AI1.model, [
        { role: 'system', content: '你是一个硬核的户外装备专家，说话专业且直接。' },
        { role: 'user', content: prompt }
      ], 400);

      let cleanReply = aiReply;
      const markers = ['</think', '</reasoning'];
      for (const m of markers) {
        const idx = cleanReply.toLowerCase().indexOf(m.toLowerCase());
        if (idx !== -1) cleanReply = cleanReply.slice(0, idx).trim();
      }
      res.json({ ok: true, totalWeight, analysis: cleanReply });
    } catch (err) {
      res.json({ ok: false, msg: 'AI 分析失败: ' + err.message });
    }
  });

  console.log('[徒步] 装备轻量化 AI 顾问已挂载');
};
