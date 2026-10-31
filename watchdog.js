const { execSync } = require('child_process');

setInterval(() => {
  try {
    // 探测本地的 3000 端口是否正常响应
    execSync('curl -s -f -m 5 -X POST http://127.0.0.1:3000/api/verify > /dev/null');
  } catch (err) {
    console.log(`[${new Date().toLocaleTimeString()}] 探测到聊天服务无响应，尝试重启...`);
    try {
      execSync('pm2 restart chat');
    } catch (e) {}
  }
}, 5 * 60 * 1000); // 每 5 分钟检查一次

console.log('✓ 看门狗已启动，每 5 分钟检查一次服务状态');
