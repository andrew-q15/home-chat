const https = require('https');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');

const CERT_DIR = path.join(__dirname, 'certs');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');

if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH)) {
  console.error('找不到证书文件，请先运行 mkcert 生成');
  process.exit(1);
}

const proxy = httpProxy.createProxyServer({
  target: 'http://localhost:3000',
  ws: true,
  changeOrigin: true,
  xfwd: true,
});

proxy.on('error', (err, req, res) => {
  console.error('代理错误:', JSON.stringify({ code: err.code, errno: err.errno, syscall: err.syscall, message: err.message, url: req && req.url, method: req && req.method }));
  if (res && res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('代理错误: ' + err.message);
  }
});

const server = https.createServer({
  key: fs.readFileSync(KEY_PATH),
  cert: fs.readFileSync(CERT_PATH),
}, (req, res) => {
  proxy.web(req, res);
});

server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head);
});

const PORT = 8443;
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('========================================');
  console.log(`  HTTPS 代理跑在 https://192.168.1.240:${PORT}`);
  console.log('');
  console.log(`  Mac 本机:     https://localhost:${PORT}`);
  console.log(`  局域网访问:   https://192.168.1.240:${PORT}`);
  console.log('========================================');
  console.log('');
});
