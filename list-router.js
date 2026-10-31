// ============ 清单系统 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

module.exports = function setupList(app, ctx) {
  const { tokens, io } = ctx;
  const LIST_ICON_DIR = path.join(__dirname, 'public', 'list-icons');
  if (!fs.existsSync(LIST_ICON_DIR)) fs.mkdirSync(LIST_ICON_DIR, { recursive: true });

  const LISTS_FILE = path.join(__dirname, 'lists.json');
  function loadLists() {
    try { return JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8')); }
    catch { return { lists: {} }; }
  }
  function saveLists(data) {
    try { fs.writeFileSync(LISTS_FILE, JSON.stringify(data, null, 2)); } catch {}
  }
  let listData = loadLists();
  if (!listData.lists) listData.lists = {};

// ============ 清单 ============
function broadcastLists() {
  io.emit('lists_updated', listData);
}

app.get('/api/lists', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  res.json({ ok: true, data: listData });
});

app.post('/api/lists', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const body = req.body || {};
  const name = String(body.name || '').trim();
  if (!name) return res.status(400).json({ ok: false, msg: '名字不能为空' });
  const id = 'list-' + crypto.randomBytes(4).toString('hex');
  listData.lists[id] = {
    id,
    name: name.slice(0, 30),
    icon: null,
    parentId: body.parentId || null,
    pinned: !!body.pinned,
    creator: username,
    items: [],
  };
  saveLists(listData);
  broadcastLists();
  res.json({ ok: true, list: listData.lists[id] });
});

const listIconStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LIST_ICON_DIR),
  filename: (req, file, cb) => cb(null, 'list-' + Date.now() + path.extname(file.originalname || '.png')),
});
const listIconUpload = multer({
  storage: listIconStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
});

app.post('/api/lists/:lid/icon', (req, res) => {
  listIconUpload.single('icon')(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, msg: err.message });
    const token = req.headers.authorization;
    const username = tokens[token];
    if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
    const lid = req.params.lid;
    if (!listData.lists[lid]) return res.status(404).json({ ok: false });
    if (!req.file) return res.status(400).json({ ok: false, msg: '没有文件' });
    const old = listData.lists[lid].icon;
    if (old) { try { fs.unlinkSync(path.join(__dirname, 'public', old.replace(/^\//, ''))); } catch {} }
    const url = '/list-icons/' + req.file.filename;
    listData.lists[lid].icon = url;
    saveLists(listData);
    broadcastLists();
    res.json({ ok: true, icon: url });
  });
});

app.delete('/api/lists/:lid', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const lid = req.params.lid;
  if (!listData.lists[lid]) return res.status(404).json({ ok: false });
  const icon = listData.lists[lid].icon;
  if (icon) try { fs.unlinkSync(path.join(__dirname, 'public', icon.replace(/^\//, ''))); } catch {}
  delete listData.lists[lid];
  saveLists(listData);
  broadcastLists();
  res.json({ ok: true });
});

app.post('/api/lists/:lid/items', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const lid = req.params.lid;
  if (!listData.lists[lid]) return res.status(404).json({ ok: false });
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ ok: false, msg: '内容不能为空' });
  const item = {
    id: 'item-' + crypto.randomBytes(4).toString('hex'),
    text: text.slice(0, 200),
    by: username,
    time: Date.now(),
    done: false,
    doneBy: null,
    doneTime: null,
  };
  listData.lists[lid].items.push(item);
  saveLists(listData);
  broadcastLists();
  res.json({ ok: true, item });
});

app.post('/api/lists/:lid/items/:iid/toggle', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const lid = req.params.lid, iid = req.params.iid;
  const list = listData.lists[lid];
  if (!list) return res.status(404).json({ ok: false });
  const item = list.items.find(i => i.id === iid);
  if (!item) return res.status(404).json({ ok: false });
  item.done = !item.done;
  if (item.done) { item.doneBy = username; item.doneTime = Date.now(); }
  else { item.doneBy = null; item.doneTime = null; }
  saveLists(listData);
  broadcastLists();
  res.json({ ok: true, item });
});

app.delete('/api/lists/:lid/items/:iid', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const lid = req.params.lid, iid = req.params.iid;
  const list = listData.lists[lid];
  if (!list) return res.status(404).json({ ok: false });
  const idx = list.items.findIndex(i => i.id === iid);
  if (idx === -1) return res.status(404).json({ ok: false });
  list.items.splice(idx, 1);
  saveLists(listData);
  broadcastLists();
  res.json({ ok: true });
});

app.post('/api/lists/:lid/clear-done', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const lid = req.params.lid;
  const list = listData.lists[lid];
  if (!list) return res.status(404).json({ ok: false });
  list.items = list.items.filter(i => !i.done);
  saveLists(listData);
  broadcastLists();
  res.json({ ok: true });
});


  console.log('[清单] 清单系统已挂载');
};
