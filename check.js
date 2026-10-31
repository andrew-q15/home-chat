#!/usr/bin/env node
// ============ 全站自动检查程序 ============
// 用法：node check.js [--fast]   （--fast 跳过耗时的 socket 全链路测试）
// 检查项：JS 语法 / 页面可达 / 关键 API / Socket 全链路
const { execSync } = require('child_process');
const http = require('http');

const BASE = 'http://localhost:3000';
const results = [];
function report(name, ok, extra) {
  results.push(ok);
  console.log((ok ? '✅' : '❌') + ' ' + name + (extra ? '  | ' + extra : ''));
}

function get(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
  });
}

// 1. Node 文件语法
const jsFiles = ['server.js', 'lobster-bridge.js', 'lobster-runner.js', 'backup.js', 'ip-watch.js', 'morning-report.js'];
for (const f of jsFiles) {
  try { execSync(`node --check ${f}`, { stdio: 'pipe' }); report('语法 ' + f, true); }
  catch (e) { report('语法 ' + f, false, e.stderr && e.stderr.toString().split('\n')[0]); }
}

// 2. 页面 HTML 里的 <script> 语法
const fs = require('fs');
for (const page of ['index.html', 'board.html', 'vision.html', 'brightness.html', 'lobster.html']) {
  const p = 'public/' + page;
  try {
    const html = fs.readFileSync(p, 'utf8');
    if (html.trim().length === 0) { report('页面 ' + page, false, '文件是空的！'); continue; }
    const scripts = html.match(/<script>[\s\S]*?<\/script>/g) || [];
    let bad = null;
    for (const s of scripts) {
      const code = s.replace(/^<script>/, '').replace(/<\/script>$/, '');
      try { new Function(code); } catch (e) { bad = e.message; }
    }
    report('页面 ' + page + ' 内嵌 JS', !bad, bad || scripts.length + ' 段脚本');
  } catch (e) { report('页面 ' + page, false, e.message); }
}

(async () => {
  // 3. 页面可达
  for (const path of ['/', '/board.html', '/vision.html', '/brightness.html', '/lobster.html']) {
    const r = await get(BASE + path);
    report('可达 ' + path, r.status === 200 && r.body.length > 100, `HTTP ${r.status}, ${r.body.length} 字节`);
  }

  // 4. API 冒烟
  let r = await get(BASE + '/api/notexist');
  report('未知 API 返回 404 而非 HTML', r.status === 404 || !r.body.startsWith('<!DOCTYPE'), `HTTP ${r.status}`);
  r = await get(BASE + '/api/device/channels?key=wrong');
  report('设备 API 密钥校验', r.status === 403, `HTTP ${r.status}`);
  r = await get(BASE + '/api/lobster/balance');
  report('龙虾接口未登录返回 401 JSON', r.status === 401 && !r.body.startsWith('<!DOCTYPE'), `HTTP ${r.status}`);

  // 4.5 龙虾沙箱测试
  try {
    const out = execSync('node tests/sandbox-test.js', { cwd: __dirname, timeout: 60000, encoding: 'utf8' });
    const m = out.match(/===== 沙箱测试: (\d+)\/(\d+) 通过/);
    report('龙虾沙箱', !!m && m[1] === m[2], m ? `${m[1]}/${m[2]}` : '输出异常');
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const m = out.match(/===== 沙箱测试: (\d+)\/(\d+) 通过/);
    report('龙虾沙箱', false, m ? `${m[1]}/${m[2]} 通过` : out.split('\n').slice(-2).join(' | '));
  }

  // 5. Socket 全链路（可跳过）
  if (process.argv.includes('--fast')) {
    console.log('⏭ --fast：跳过 socket 全链路测试');
  } else {
    console.log('--- 运行 socket 全链路测试（含真实 AI 调用，可能需要 1-2 分钟）---');
    try {
      const out = execSync('node tests/socket-test.js', { cwd: __dirname, timeout: 240000, encoding: 'utf8' });
      const m = out.match(/===== 结果: (\d+)\/(\d+) 通过/);
      report('Socket 全链路', !!m && m[1] === m[2], m ? `${m[1]}/${m[2]}` : '输出异常');
    } catch (e) {
      const out = (e.stdout || '') + (e.stderr || '');
      const m = out.match(/===== 结果: (\d+)\/(\d+) 通过/);
      report('Socket 全链路', false, m ? `${m[1]}/${m[2]} 通过` : out.split('\n').slice(-3).join(' | '));
    }
  }

  const pass = results.filter(Boolean).length;
  console.log('\n===== 检查结果: ' + pass + '/' + results.length + ' 通过 =====');
  process.exit(pass === results.length ? 0 : 1);
})();
