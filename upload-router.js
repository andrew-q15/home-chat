// ============ 上传/改名/头像/视觉 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const config = require('./config');

module.exports = function setupUpload(app, ctx) {
  const { tokens, state, saveState, io, broadcastUserUpdate } = ctx;

  const AVATAR_DIR = path.join(__dirname, 'public', 'avatars');
  if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
  const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
    },
  });
  const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });


// ============ 文件/图片上传 ============
app.post('/api/upload', upload.single('file'), (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  if (!req.file) return res.status(400).json({ ok: false, msg: '没有文件' });

  const url = '/uploads/' + req.file.filename;
  const isImage = req.file.mimetype.startsWith('image/');
  res.json({
    ok: true,
    url,
    type: isImage ? 'image' : 'file',
    name: req.file.originalname,
    size: req.file.size,
    mime: req.file.mimetype,
  });
});

// ============ 改名 / 头像 ============
// 广播某个用户的信息变更（前端 user_updated 用）

app.post('/api/rename', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  if (!user) return res.status(401).json({ ok: false, msg: '用户不存在' });

  const displayName = String((req.body && req.body.displayName) || '').trim();
  if (!displayName || displayName.length > 20) {
    return res.status(400).json({ ok: false, msg: '名字长度 1-20 字' });
  }
  user.displayName = displayName;
  saveState();
  broadcastUserUpdate(username);
  res.json({ ok: true, displayName });
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    const username = tokens[req.headers.authorization];
    const uid = (username && state.users[username] && state.users[username].id) || 'unknown';
    cb(null, uid + '-' + Date.now() + '.png');
  },
});
const avatarUpload = multer({ storage: avatarStorage, limits: { fileSize: 2 * 1024 * 1024 } });

app.post('/api/avatar', avatarUpload.single('avatar'), (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  if (!user) return res.status(401).json({ ok: false, msg: '用户不存在' });
  if (!req.file) return res.status(400).json({ ok: false, msg: '没有图片' });

  // 删掉旧头像文件，避免堆积
  if (user.avatar && user.avatar.startsWith('/avatars/')) {
    const old = path.join(AVATAR_DIR, path.basename(user.avatar));
    try { fs.unlinkSync(old); } catch {}
  }

  const url = '/avatars/' + req.file.filename;
  user.avatar = url;
  saveState();
  broadcastUserUpdate(username);
  res.json({ ok: true, avatar: url });
});

// ============ AI 视觉（隐身观察） ============
app.post('/api/vision', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, msg: '没有图片' });

  const buf = fs.readFileSync(req.file.path);
  const b64 = buf.toString('base64');
  const mime = req.file.mimetype || 'image/jpeg';
  const dataUrl = 'data:' + mime + ';base64,' + b64;

  try { fs.unlinkSync(req.file.path); } catch {}

  const sysPrompt = '你是环境感知器，只描述场景和物品，绝不描述任何人物。如果画面中有人，只输出四个字："画面中有人"，不描述数量、性别、年龄、衣着、动作。禁止输出：人脸、五官、表情、体型、身份推测。用一句话，不超过 30 字，中文，不要输出思考过程。';

  try {
    const r = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.AI1.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: sysPrompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
        max_tokens: 200,
        temperature: 0.5,
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
    const data = await r.json();
    const msgObj = (data.choices && data.choices[0] && data.choices[0].message) || {};
    let desc = (msgObj.content || '').trim();
    const markers = ['</think', '</reasoning'];
    for (const m of markers) {
      const i = desc.toLowerCase().indexOf(m.toLowerCase());
      if (i !== -1) desc = desc.slice(0, i).trim();
    }
    if (!desc) desc = '（AI 没有给出描述）';

    addObservation(desc);
    res.json({ ok: true, description: desc });
  } catch (err) {
    console.error('视觉 API 出错:', err.message);
    res.status(500).json({ ok: false, msg: err.message });
  }
});

// ============ 贴纸系统（v2：每人一个库 + 分组） ============

  console.log('[上传] 上传/头像模块已挂载');
};
