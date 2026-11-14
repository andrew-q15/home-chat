// ============ 万能数据站 ============
const path = require('path');
const fs = require('fs');

module.exports = function setupHub(app, ctx) {
  const { tokens, state } = ctx;

const HUB_CACHE = new Map();
const HUB_TTL = 10 * 60 * 1000; // 10 分钟缓存

function hubCached(key, fn) {
  // joke 接口每 30 秒换一个 key，Map 只增不减会内存泄漏，超限先清过期项
  if (HUB_CACHE.size > 100) {
    for (const [k, v] of HUB_CACHE) {
      if (Date.now() - v.time >= HUB_TTL) HUB_CACHE.delete(k);
    }
  }
  const hit = HUB_CACHE.get(key);
  if (hit && Date.now() - hit.time < HUB_TTL) {
    return Promise.resolve(hit.data);
  }
  return fn().then(data => {
    HUB_CACHE.set(key, { data, time: Date.now() });
    return data;
  });
}

// 天气（西安固定）
app.get('/api/hub/weather', async (req, res) => {
  try {
    const data = await hubCached('weather', async () => {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=34.34&longitude=108.94&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia/Shanghai&forecast_days=1');
      const j = await r.json();
      const codeMap = {0:'晴',1:'晴',2:'多云',3:'阴',45:'雾',48:'雾',51:'小雨',53:'雨',55:'大雨',61:'小雨',63:'雨',65:'大雨',71:'小雪',73:'雪',75:'大雪',80:'阵雨',81:'阵雨',82:'暴雨',95:'雷雨',96:'雷雨',99:'雷雨'};
      return {
        temp: j.current.temperature_2m,
        text: codeMap[j.current.weather_code] || '未知',
        min: j.daily.temperature_2m_min[0],
        max: j.daily.temperature_2m_max[0],
      };
    });
    res.json({ ok: true, weather: data });
  } catch (e) {
    res.json({ ok: false, msg: '天气暂时不可用' });
  }
});

// 诗词
app.get('/api/hub/poem', async (req, res) => {
  try {
    const data = await hubCached('poem', async () => {
      const r = await fetch('https://v2.jinrishici.com/one.json');
      const j = await r.json();
      return { content: j.data.content, origin: j.data.origin && j.data.origin.title };
    });
    res.json({ ok: true, poem: data });
  } catch (e) {
    res.json({ ok: false, msg: '诗词暂时不可用' });
  }
});

// 新闻（知乎热榜前 10）
app.get('/api/hub/news', async (req, res) => {
  try {
    const data = await hubCached('news', async () => {
      const r = await fetch('https://60s.viki.moe/v2/zhihu');
      const j = await r.json();
      return (j.data || []).slice(0, 10).map(x => x.title || x.name).filter(Boolean);
    });
    res.json({ ok: true, news: data });
  } catch (e) {
    res.json({ ok: false, msg: '新闻暂时不可用' });
  }
});

// 汇率（1 CNY = ? USD/EUR/JPY/HKD）
app.get('/api/hub/rate', async (req, res) => {
  try {
    const data = await hubCached('rate', async () => {
      const r = await fetch('https://open.er-api.com/v6/latest/CNY');
      const j = await r.json();
      return {
        base: 'CNY',
        USD: j.rates && j.rates.USD,
        EUR: j.rates && j.rates.EUR,
        JPY: j.rates && j.rates.JPY,
        HKD: j.rates && j.rates.HKD,
        GBP: j.rates && j.rates.GBP,
      };
    });
    res.json({ ok: true, rate: data });
  } catch (e) {
    res.json({ ok: false, msg: '汇率暂时不可用' });
  }
});

// 笑话
app.get('/api/hub/joke', async (req, res) => {
  try {
    const data = await hubCached('joke' + Math.floor(Date.now() / 30000), async () => {
      const r = await fetch('https://cn.apihz.cn/api/zici/xiaohua.php?id=88888888&key=88888888');
      const j = await r.json();
      if (j.code !== 200 || !j.content) throw new Error('no joke');
      return j.content;
    });
    res.json({ ok: true, joke: data });
  } catch (e) {
    res.json({ ok: false, msg: '笑话暂时不可用' });
  }
});

// 星座（全部 12 个）
app.get('/api/hub/horoscope', (req, res) => {
  return res.json({ ok: false, msg: '星座数据源暂时不可用，等找到稳定源再上线' });
});

// 一键刷新全部
app.get('/api/hub/all', async (req, res) => {
  HUB_CACHE.clear();
  res.json({ ok: true, msg: '缓存已清空' });
});

  console.log('[数据站] 万能数据站模块已挂载');
};
