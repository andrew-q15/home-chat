// ============ 贴纸系统 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

module.exports = function setupSticker(app, ctx) {
  const { tokens, state } = ctx;

const STICKER_ROOT = path.join(__dirname, 'public', 'stickers');
if (!fs.existsSync(STICKER_ROOT)) fs.mkdirSync(STICKER_ROOT, { recursive: true });

const STICKER_META = path.join(__dirname, 'stickers.json');
function loadStickerMeta() {
  try { return JSON.parse(fs.readFileSync(STICKER_META, 'utf8')); }
  catch { return {}; }
}
function saveStickerMeta(m) {
  try { fs.writeFileSync(STICKER_META, JSON.stringify(m, null, 2)); } catch {}
}
let stickerMeta = loadStickerMeta();

function userStickerDir(userId) {
  const d = path.join(STICKER_ROOT, userId);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}
function groupDir(userId, gid) {
  return path.join(STICKER_ROOT, userId, gid);
}
// gid 必须属于该用户且格式合法（防路径穿越/越权）
function findUserGroup(user, gid) {
  if (!user || !gid) return null;
  if (!/^grp-[a-f0-9]{8}$/.test(gid)) return null;
  const meta = stickerMeta[user.id] || { groups: [] };
  return meta.groups.find(g => g.id === gid) || null;
}
function listStickerItems(userId, gid) {
  try {
    const d = groupDir(userId, gid);
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d)
      .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
      .sort()
      .map(f => '/stickers/' + userId + '/' + gid + '/' + f);
  } catch { return []; }
}

// 列出我的贴纸库
app.get('/api/stickers', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  if (!user) return res.status(401).json({ ok: false, msg: '用户不存在' });
  const meta = stickerMeta[user.id] || { groups: [] };
  const groups = meta.groups.map(g => ({
    id: g.id,
    name: g.name,
    items: listStickerItems(user.id, g.id),
  }));
  res.json({ ok: true, groups });
});

// 新建分组
app.post('/api/stickers/group', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  const name = String((req.body && req.body.name) || '').trim();
  if (!name || name.length > 20) return res.status(400).json({ ok: false, msg: '名字长度 1-20' });
  if (!stickerMeta[user.id]) stickerMeta[user.id] = { groups: [] };
  const gid = 'grp-' + crypto.randomBytes(4).toString('hex');
  stickerMeta[user.id].groups.push({ id: gid, name });
  saveStickerMeta(stickerMeta);
  userStickerDir(user.id);
  fs.mkdirSync(groupDir(user.id, gid), { recursive: true });
  res.json({ ok: true, group: { id: gid, name, items: [] } });
});

// 删除分组
app.delete('/api/stickers/group/:gid', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  const gid = req.params.gid;
  if (!findUserGroup(user, gid)) return res.status(404).json({ ok: false });
  const idx = stickerMeta[user.id].groups.findIndex(g => g.id === gid);
  if (idx === -1) return res.status(404).json({ ok: false });
  stickerMeta[user.id].groups.splice(idx, 1);
  saveStickerMeta(stickerMeta);
  try { fs.rmSync(groupDir(user.id, gid), { recursive: true, force: true }); } catch {}
  res.json({ ok: true });
});

// 上传贴纸（指定分组）
const stickerStorage2 = multer.diskStorage({
  destination: (req, file, cb) => {
    const token = req.headers.authorization;
    const username = tokens[token];
    if (!username) return cb(new Error('未登录'));
    const user = state.users[username];
    const gid = req.body.groupId;
    if (!findUserGroup(user, gid)) return cb(new Error('分组不存在'));
    const d = groupDir(user.id, gid);
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    cb(null, d);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, Date.now() + '-' + crypto.randomBytes(3).toString('hex') + ext);
  },
});
const stickerUpload2 = multer({
  storage: stickerStorage2,
  limits: { fileSize: 2 * 1024 * 1024 },
});

app.post('/api/stickers/upload', (req, res) => {
  stickerUpload2.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, msg: err.message });
    if (!req.file) return res.status(400).json({ ok: false, msg: '没有文件' });
    res.json({ ok: true });
  });
});

// 删除单张贴纸
app.delete('/api/stickers/item/:gid/:file', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  const gid = req.params.gid;
  const file = path.basename(req.params.file);
  if (!findUserGroup(user, gid)) return res.status(404).json({ ok: false });
  const p = path.join(groupDir(user.id, gid), file);
  if (!fs.existsSync(p)) return res.status(404).json({ ok: false });
  try { fs.unlinkSync(p); } catch (e) { return res.status(500).json({ ok: false, msg: e.message }); }
  res.json({ ok: true });
});

// 收藏聊天里的图片（复制到我的某个分组）
app.post('/api/stickers/collect', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  const url = String((req.body && req.body.url) || '');
  const gid = String((req.body && req.body.groupId) || '');
  if (!url || !gid) return res.status(400).json({ ok: false, msg: '缺少参数' });
  if (!findUserGroup(user, gid)) return res.status(400).json({ ok: false, msg: '分组不存在' });

  // url 必须是本站的 /uploads/ 或 /stickers/ 路径
  if (!url.startsWith('/uploads/') && !url.startsWith('/stickers/')) {
    return res.status(400).json({ ok: false, msg: '不支持的地址' });
  }
  const srcPath = path.join(__dirname, 'public', url.replace(/^\//, '').split('?')[0]);
  if (!fs.existsSync(srcPath)) return res.status(404).json({ ok: false, msg: '文件不存在' });

  const d = groupDir(user.id, gid);
  if (!fs.existsSync(d)) return res.status(400).json({ ok: false, msg: '分组不存在' });

  const ext = path.extname(srcPath) || '.png';
  const newName = Date.now() + '-' + crypto.randomBytes(3).toString('hex') + ext;
  try { fs.copyFileSync(srcPath, path.join(d, newName)); } catch (e) { return res.status(500).json({ ok: false, msg: e.message }); }
  res.json({ ok: true });
});


  console.log('[贴纸] 贴纸系统已挂载');
};
