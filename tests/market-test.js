// ============ /api/market 跳蚤市场测试 ============
const URL = 'http://localhost:3000';
const results = [];
function report(name, ok, extra) {
  results.push({ name, ok });
  console.log((ok ? '✅' : '❌') + ' ' + name + (extra ? '  | ' + String(extra).slice(0, 120) : ''));
}

async function register(username) {
  const res = await fetch(URL + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username, password: 'test123' }),
  });
  let d = await res.json();
  if (d.ok === false) {
    const r2 = await fetch(URL + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: 'test123' }),
    });
    d = await r2.json();
  }
  return d.token;
}

async function main() {
  let r = await fetch(URL + '/api/market');
  report('未登录 GET /api/market 返回 401', r.status === 401, 'HTTP ' + r.status);

  const uname = 'test_m_' + String(Date.now()).slice(-6);
  const token = await register(uname);
  report('注册/登录拿到 token', token !== undefined && token !== null);

  r = await fetch(URL + '/api/market', { headers: { Authorization: token } });
  report('登录后 GET /api/market 返回 200', r.status === 200, 'HTTP ' + r.status);
  let d = await r.json();
  report('ok=true', d.ok === true);
  report('含 listings 数组', Array.isArray(d.listings));
  report('含 myBalance', typeof d.myBalance === 'number');

  r = await fetch(URL + '/api/market', {
    method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '测试商品_' + Date.now(), desc: '自动化测试', price: 1 }),
  });
  d = await r.json();
  report('上架成功', d.ok === true, d.msg || '');
  const itemId = d.item && d.item.id;
  report('返回 item.id', itemId !== undefined && itemId !== null);

  r = await fetch(URL + '/api/market', { headers: { Authorization: token } });
  d = await r.json();
  const found = (d.listings || []).some(x => x.id === itemId);
  report('上架后列表里能找到', found);

  r = await fetch(URL + '/api/market/' + itemId, {
    method: 'DELETE', headers: { Authorization: token },
  });
  d = await r.json();
  report('下架成功', d.ok === true, d.msg || '');

  r = await fetch(URL + '/api/market', { headers: { Authorization: token } });
  d = await r.json();
  const gone = (d.listings || []).some(x => x.id === itemId) === false;
  report('下架后列表里找不到', gone);

  const pass = results.filter(r => r.ok).length;
  console.log('');
  console.log('===== market 测试: ' + pass + '/' + results.length + ' 通过 =====');
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('测试崩溃:', e.message); process.exit(1); });
