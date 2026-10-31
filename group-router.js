// ============ 抽签分组 ============
module.exports = function setupGroup(app, ctx) {
  const { tokens } = ctx;

  app.post('/api/group/draw', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    
    let { names, groupCount } = req.body || {};
    if (!Array.isArray(names) || names.length < 2) return res.json({ ok: false, msg: '至少需要2个人' });
    groupCount = Math.max(2, Math.min(10, Number(groupCount) || 2)); // 限制 2-10 组

    // 打乱数组 (Fisher-Yates)
    const arr = names.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    // 分组
    const groups = Array.from({ length: groupCount }, () => []);
    arr.forEach((name, i) => {
      groups[i % groupCount].push(name);
    });

    res.json({ ok: true, groups });
  });

  console.log('[分组] 抽签分组模块已挂载');
};
