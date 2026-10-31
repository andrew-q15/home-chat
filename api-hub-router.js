const path = require('path');
const fs = require('fs');

module.exports = function setupApiHub(app, ctx) {
  const API_FILE = path.join(__dirname, 'api-hub.json');
  
  function loadApis() {
    try { return JSON.parse(fs.readFileSync(API_FILE, 'utf8')); } catch { return []; }
  }
  function saveApis(data) {
    try { fs.writeFileSync(API_FILE, JSON.stringify(data, null, 2)); } catch {}
  }

  let apisData = loadApis();

  // 获取已接入的 API 列表
  app.get('/api/hub/list', (req, res) => {
    res.json({ ok: true, apis: apisData });
  });

  // 沙箱测试并接入 API
  app.post('/api/hub/test', async (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false, msg: '未登录' });

    const { name, url } = req.body || {};
    if (!name || !url) return res.json({ ok: false, msg: '名字和 URL 不能为空' });
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.json({ ok: false, msg: 'URL 必须以 http:// 或 https:// 开头' });
    }

    // 1. 沙箱测试连通性（最多等 5 秒，防止卡死）
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const testRes = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      const text = await testRes.text();
      
      // 2. 验证是否为 JSON 格式
      let jsonData;
      try {
        jsonData = JSON.parse(text);
      } catch (e) {
        return res.json({ ok: false, msg: '接口连通，但返回的不是合法的 JSON 数据，无法接入。' });
      }

      // 3. 测试通过，保存到情报局
      const newApi = {
        id: 'api-' + require('crypto').randomBytes(4).toString('hex'),
        name: String(name).slice(0, 30),
        url: String(url),
        author: username,
        time: Date.now(),
        sample: JSON.stringify(jsonData).slice(0, 200) + '...' // 存个样本方便日后查看
      };
      
      apisData.unshift(newApi);
      if (apisData.length > 50) apisData = apisData.slice(0, 50); // 最多存50个
      saveApis(apisData);
      
      res.json({ ok: true, msg: '✅ 连通性测试通过，已成功接入情报局！', api: newApi });

    } catch (err) {
      let errorMsg = err.message;
      if (err.name === 'AbortError') errorMsg = '请求超时（5秒），该 API 可能无法访问。';
      res.json({ ok: false, msg: '沙箱测试失败: ' + errorMsg });
    }
  });

  // 用户调用已接入的 API（由服务器代理请求，解决跨域问题）
  app.get('/api/hub/proxy', async (req, res) => {
    const { id } = req.query;
    const targetApi = apisData.find(a => a.id === id);
    if (!targetApi) return res.status(404).json({ ok: false, msg: '接口不存在' });

    try {
      const r = await fetch(targetApi.url);
      const data = await r.json();
      res.json({ ok: true, data });
    } catch (err) {
      res.json({ ok: false, msg: '调用失败: ' + err.message });
    }
  });

  console.log('[情报局] 自定义 API 沙箱接入模块已挂载');
};
