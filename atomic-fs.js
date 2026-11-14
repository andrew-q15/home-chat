// JSON 原子写：tmp 文件 + renameSync，全程同步，保持原 writeFileSync 语义。
// Node 单线程 + 同步 IO，一次写入不会被另一个请求打断，不需要 Promise / 互斥队列。
const fs = require('fs');
const orig = fs.writeFileSync;

if (fs.__orangeAtomic !== true) {
  fs.__orangeAtomic = true;
  fs.writeFileSync = function (file, data, opts) {
    const p = String(file);
    if (p.endsWith('.json') === false) return orig.apply(fs, arguments);
    const tmp = p + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2, 9);
    try {
      orig.call(fs, tmp, data, opts);
      fs.renameSync(tmp, p);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch (_) {}
      throw e;
    }
  };
}

module.exports = { enabled: true };
