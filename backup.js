const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'data.json');
const DIR = path.join(__dirname, 'backups');
const KEEP = 30;

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

function backup() {
  try {
    if (!fs.existsSync(SRC)) {
      console.log(`[${new Date().toLocaleString()}] data.json 不存在，跳过`);
      return;
    }
    const d = new Date();
    const stamp = d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0') +
      String(d.getSeconds()).padStart(2, '0');
    const dest = path.join(DIR, `data-${stamp}.json`);
    fs.copyFileSync(SRC, dest);
    console.log(`[${d.toLocaleString()}] 备份 → ${path.basename(dest)}`);

    // 清理旧备份，只留最近 KEEP 份
    const files = fs.readdirSync(DIR)
      .filter(f => f.startsWith('data-') && f.endsWith('.json'))
      .sort();
    while (files.length > KEEP) {
      const rm = files.shift();
      fs.unlinkSync(path.join(DIR, rm));
      console.log(`  清理旧备份: ${rm}`);
    }
  } catch (err) {
    console.error('备份失败:', err.message);
  }
}

// 启动时先备份一次，之后每天 3:00 备份
backup();
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 3 && now.getMinutes() === 0) {
    backup();
  }
}, 30 * 1000);

console.log('');
console.log('========================================');
console.log('  备份服务已启动');
console.log(`  备份目录: ${DIR}`);
console.log('  备份时间: 每天 3:00');
console.log(`  保留份数: 最近 ${KEEP} 份`);
console.log('========================================');
console.log('');
