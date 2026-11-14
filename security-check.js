const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000';
let pass = 0, fail = 0, skip = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '  | ' + extra : '')); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  | ' + extra : '')); }
}
function sk(name, why) { skip++; console.log('  SKIP  ' + name + '  | ' + why); }

function req(method, url, body, token) {
  return new Promise(resolve => {
    const u = new URL(BASE + url);
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.authorization = token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: method, headers: headers,
    }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.setTimeout(6000, () => { r.destroy(new Error('timeout')); resolve({ status: 0, body: '' }); });
    r.on('error', () => resolve({ status: 0, body: '' }));
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  console.log('--- 1. 服务体检 ---');
  let r = await req('POST', '/api/verify');
  ok('POST /api/verify 返回 200', r.status === 200, 'HTTP ' + r.status);

  console.log('--- 2. 敏感接口未登录必须拒绝 ---');
  const guarded = [
    ['GET',  '/api/vault'],
    ['POST', '/api/orange/run'],
    ['GET',  '/api/hub/proxy?id=nope'],
    ['GET',  '/api/lobster/balance'],
    ['POST', '/api/upload'],
    ['POST', '/api/vision'],
  ];
  for (const [m, u] of guarded) {
    const x = await req(m, u, m === 'POST' ? { code: '打印(1);' } : null);
    ok('未登录被拒 ' + m + ' ' + u, x.status === 401 || x.status === 403, 'HTTP ' + x.status);
  }

  console.log('--- 3. 配置与密钥 ---');
  const cfg = fs.readFileSync('config.js', 'utf8');
  ok('Tailscale 密钥已移出 config.js（改环境变量）',
     !/TS_API_TOKEN:\s*'[^']+'/.test(cfg) && cfg.includes('process.env.TS_API_TOKEN'));
  ok('DEVICE_API_KEY 不再是默认弱值', !cfg.includes('change-me-to-something-random'));
  ok('原子写补丁已在 config.js 顶部加载', cfg.includes("require('./atomic-fs')"));

  console.log('--- 4. JSON 原子写单元测 ---');
  require('./atomic-fs');
  const tmp = path.join(__dirname, '.atomic-test.json');
  fs.writeFileSync(tmp, JSON.stringify({ a: 1, big: 'x'.repeat(20000) }));
  let parsed = null, parseErr = null;
  try { parsed = JSON.parse(fs.readFileSync(tmp, 'utf8')); }
  catch (e) { parseErr = e.message; }
  ok('大 JSON 写完后可完整读回', !!parsed && parsed.a === 1 && parsed.big.length === 20000, parseErr || '');
  const leftover = fs.readdirSync(__dirname).filter(f => f.startsWith('.atomic-test.json.tmp-'));
  ok('没有 .tmp 残留文件', leftover.length === 0, leftover.length + ' 个');
  try { fs.unlinkSync(tmp); } catch (e) {}

  console.log('--- 5. 橘语沙箱 ---');
  const evil = path.join(__dirname, '.orange-evil.txt');
  fs.writeFileSync(evil,
    "打印(__import__('os').system('echo PWNED_ORANGE'));\n" +
    "打印(''.__class__.__mro__);\n" +
    "打印(1+2 * 3);\n" +
    "橘子 甲 = 10;\n" +
    "打印(甲*2);\n", 'utf8');
  let out = '';
  try { out = execFileSync('python3', [path.join(__dirname, 'orange-lang.py'), evil],
                          { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { out = String(e.stdout || ''); }
  ok('沙箱逃逸被挡（无 PWNED / 无 class object）',
     !out.includes('PWNED_ORANGE') && !out.includes("<class 'object'>"),
     JSON.stringify(out.slice(0, 140)));
  ok('正常算术仍可用（7 与 20）', out.includes('7') && out.includes('20'),
     JSON.stringify(out.trim().slice(0, 160)));
  try { fs.unlinkSync(evil); } catch (e) {}

  console.log('--- 6. 全站 JS 语法 ---');
  const jsFiles = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.js') && !f.startsWith('.') && f !== 'atomic-fs.js' && f !== 'security-check.js')
    .sort();
  const bad = [];
  for (const f of jsFiles) {
    try { execFileSync(process.execPath, ['--check', path.join(__dirname, f)], { stdio: 'pipe' }); }
    catch (e) { bad.push(f); }
  }
  ok('全部 ' + jsFiles.length + ' 个 .js 通过 node --check', bad.length === 0,
     bad.length ? bad.join(', ') : '全部通过');

  console.log('--- 7. SSRF 在线拦截 ---');
  let token = null;
  try {
    const st = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    const k = Object.keys(st.tokens || {})[0];
    if (k) token = k;
  } catch (e) {}
  if (!token) sk('SSRF 内网地址拦截', 'data.json 里没有可用 token，跳过在线项');
  else {
    const x = await req('POST', '/api/hub/test',
      { name: 'probe', url: 'http://127.0.0.1:3000/api/verify' }, token);
    let j = {};
    try { j = JSON.parse(x.body); } catch (e) {}
    ok('内网/回环 URL 被安全策略拦截',
       j.ok === false && /内网|本机|拒绝|拦截|URL|不允许/.test(j.msg || ''),
       'HTTP ' + x.status + ' ' + (j.msg || ''));
    const x2 = await req('POST', '/api/hub/test',
      { name: 'probe', url: 'http://169.254.169.254/latest/meta-data/' }, token);
    let j2 = {};
    try { j2 = JSON.parse(x2.body); } catch (e) {}
    ok('云元数据地址被拦截', j2.ok === false, 'HTTP ' + x2.status + ' ' + (j2.msg || ''));
  }

  console.log('--- 8. 公开接口未被误伤 ---');
  const d = await req('GET', '/api/stats/dashboard');
  ok('数据大屏仍可访问', d.status === 200, 'HTTP ' + d.status);
  const p = await req('GET', '/api/posts');
  ok('图文广场仍可访问', p.status === 200, 'HTTP ' + p.status);
  const w = await req('GET', '/api/device/channels?key=wrong');
  ok('设备密钥错误被拒', w.status === 401 || w.status === 403, 'HTTP ' + w.status);

  console.log('');
  console.log('===== 安全回归: ' + pass + '/' + (pass + fail) + ' 通过，跳过 ' + skip + ' =====');
  if (fail) { console.log('WARN  有失败项。备份还在，先别删。'); process.exit(1); }
  console.log('ALL GREEN.');
})();
