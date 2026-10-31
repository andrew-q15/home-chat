// ============ /api/stats/dashboard 数据大屏测试 ============
const URL = 'http://localhost:3000';
const results = [];
function report(name, ok, extra) {
  results.push({ name, ok });
  console.log((ok ? '✅' : '❌') + ' ' + name + (extra ? '  | ' + String(extra).slice(0, 120) : ''));
}

async function main() {
  let r = await fetch(URL + '/api/stats/dashboard');
  report('GET /api/stats/dashboard 返回 200', r.status === 200, 'HTTP ' + r.status);
  let d = await r.json();
  report('ok=true', d.ok === true);

  for (const k of ['users','oranges','messages','intel','stocks','koi','quiz','lottery']) {
    report('顶层含 ' + k, d[k] !== undefined);
  }
  report('兼容 stats', d.stats && d.stats.users !== undefined);
  report('兼容 focus', d.focus && d.focus.koi !== undefined);
  report('users.total 是数字', typeof d.users.total === 'number');
  report('users.online 是数字', typeof d.users.online === 'number');
  report('oranges.total 是数字', typeof d.oranges.total === 'number');
  report('messages.total 是数字', typeof d.messages.total === 'number');
  report('messages.last24Buckets 长度 24', Array.isArray(d.messages.last24Buckets) && d.messages.last24Buckets.length === 24);
  report('intel.cn 是数字', typeof d.intel.cn === 'number');
  report('intel.en 是数字', typeof d.intel.en === 'number');
  report('stocks 是数组', Array.isArray(d.stocks));
  if (Array.isArray(d.stocks) && d.stocks.length > 0) {
    const s = d.stocks[0];
    const okTrend = s.code && s.name && typeof s.price === 'number' && ['up','down','stable'].indexOf(s.trend) !== -1;
    report('股票含 code/name/price/trend', okTrend);
  }

  const pass = results.filter(r => r.ok).length;
  console.log('');
  console.log('===== stats 测试: ' + pass + '/' + results.length + ' 通过 =====');
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('测试崩溃:', e.message); process.exit(1); });
