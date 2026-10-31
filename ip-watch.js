const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '.last-ip');
const CHAT_URL = 'http://127.0.0.1:3000';
const config = require('./config');
const DEVICE_KEY = config.DEVICE_API_KEY;
const CHANNEL = 'hjm';           // 通知发到这个频道
const PROXY_FILE = path.join(__dirname, 'https-proxy.js');

function getCurrentIP() {
  try {
    // 优先 en1（Wi-Fi），其次 en0（以太网）
    for (const iface of ['en1', 'en0']) {
      try {
        const ip = execSync(`ipconfig getifaddr ${iface} 2>/dev/null`).toString().trim();
        if (ip) return ip;
      } catch {}
    }
  } catch {}
  return null;
}

function getLastIP() {
  try {
    return fs.readFileSync(STATE_FILE, 'utf8').trim();
  } catch {
    return null;
  }
}

function setLastIP(ip) {
  fs.writeFileSync(STATE_FILE, ip);
}

async function notify(text) {
  try {
    await fetch(`${CHAT_URL}/api/device/say`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: DEVICE_KEY,
        channel: CHANNEL,
        name: 'IP 守护',
        text,
      }),
    });
  } catch (err) {
    console.error('通知失败:', err.message);
  }
}

function regenerateCert(ip) {
  const cmd = `mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1 ${ip} ::1`;
  console.log('  执行:', cmd);
  execSync(cmd, { cwd: __dirname, stdio: 'inherit' });
}

function updateProxyText(ip) {
  let src = fs.readFileSync(PROXY_FILE, 'utf8');
  src = src.replace(/https:\/\/\d+\.\d+\.\d+\.\d+:\$\{PORT\}/g, `https://${ip}:\${PORT}`);
  fs.writeFileSync(PROXY_FILE, src);
}

function restartProxy() {
  try {
    execSync('pm2 restart https-proxy', { stdio: 'inherit' });
  } catch (err) {
    console.error('  重启 https-proxy 失败:', err.message);
  }
}

async function check() {
  const now = getCurrentIP();
  if (!now) return;

  const last = getLastIP();

  if (last === now) return;

  if (!last) {
    // 首次运行，只记录，不做事
    setLastIP(now);
    console.log(`[${new Date().toLocaleString()}] 首次记录 IP: ${now}`);
    return;
  }

  // IP 变了
  console.log(`[${new Date().toLocaleString()}] IP 变化: ${last} → ${now}`);

  try {
    regenerateCert(now);
    updateProxyText(now);
    restartProxy();
    setLastIP(now);
    await notify(`Mac IP 变了：${last} → ${now}。新的访问地址：https://${now}:8443`);
    console.log('  已处理完毕');
  } catch (err) {
    console.error('  处理失败:', err.message);
    await notify(`Mac IP 变了：${last} → ${now}，但自动处理失败：${err.message}`);
  }
}

// 每 5 分钟检查一次
setInterval(check, 5 * 60 * 1000);
check();

console.log('');
console.log('========================================');
console.log('  IP 守护已启动');
console.log('  每 5 分钟检查一次 IP');
console.log('  IP 变化时自动重签证书 + 重启代理 + 通知聊天室');
console.log('========================================');
console.log('');
