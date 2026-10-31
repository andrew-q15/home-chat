// ============ /api/wall 留言墙测试 ============
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
  const unameA = 'test_wa_' + String(Date.now()).slice(-6);
  const unameB = 'test_wb_' + String(Date.now()).slice(-6);
  const tokenA = await register(unameA);
  const tokenB = await register(unameB);
  report('A/B 都拿到 token', tokenA !== undefined && tokenB !== undefined);

  let r = await fetch(URL + '/api/wall');
  report('未登录 GET /api/wall 200', r.status === 200, 'HTTP ' + r.status);
  let d = await r.json();
  report('未登录 me=null', d.me === null);

  r = await fetch(URL + '/api/wall', { headers: { Authorization: tokenA } });
  d = await r.json();
  const meOk = d.me !== null && d.me.userId !== undefined && d.me.username === unameA;
  report('登录后 me 有值', meOk);
  report('me.isSuperAdmin 是布尔', typeof d.me.isSuperAdmin === 'boolean');

  r = await fetch(URL + '/api/wall', {
    method: 'POST', headers: { Authorization: tokenA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '自动化测试留言_' + Date.now() }),
  });
  d = await r.json();
  report('A 发留言成功', d.ok === true, d.msg || '');
  const wallId = d.item && d.item.id;
  report('返回 item.id', wallId !== undefined && wallId !== null);

  r = await fetch(URL + '/api/wall/' + wallId, {
    method: 'DELETE', headers: { Authorization: tokenB },
  });
  report('B 删 A 的 → 403', r.status === 403, 'HTTP ' + r.status);

  r = await fetch(URL + '/api/wall/' + wallId, {
    method: 'DELETE', headers: { Authorization: tokenA },
  });
  d = await r.json();
  report('A 删自己的 → 200', r.status === 200 && d.ok === true, 'HTTP ' + r.status);

  r = await fetch(URL + '/api/wall', { headers: { Authorization: tokenA } });
  d = await r.json();
  const gone = (d.wall || []).some(x => x.id === wallId) === false;
  report('删除后列表里找不到', gone);

  const pass = results.filter(r => r.ok).length;
  console.log('');
  console.log('===== wall 测试: ' + pass + '/' + results.length + ' 通过 =====');
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('测试崩溃:', e.message); process.exit(1); });
