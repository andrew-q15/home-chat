// ============ 后期补丁功能块（从 server.js 抽离）============
// 包含：图文广场 posts / 三角洲 delta / 捞鱼场 fishing / 急救站 doctor / 橘语 orange
// 由 center.js 挂载，依赖 ctx 里的 tokens/state/getBalance/saveLobster/lobsterData/callAI/config

module.exports = function setupLegacyFeatures(app, ctx) {
  const { tokens, state, getBalance, saveLobster, lobsterData, addOrangeLog, foodData, saveFood, io, saveState, FOOD_DICT } = ctx;
  const path = require('path');
  const fs = require('fs');
  const crypto = require('crypto');
  const config = require('./config');
  const callAI = ctx.callAI;

  // ===== 以下为从 server.js 原样搬过来的代码 =====
const POSTS_FILE = path.join(__dirname, 'posts.json');
function loadPosts() {
  try { return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')); }
  catch { return []; }
}
function savePosts(data) {
  try { fs.writeFileSync(POSTS_FILE, JSON.stringify(data, null, 2)); } catch {}
}
let postsData = loadPosts();

app.get('/api/posts', (req, res) => {
  res.json({ ok: true, posts: postsData });
});

app.post('/api/posts', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  
  const { title, content, images } = req.body || {};
  if (!title || !content || !images || images.length === 0) return res.json({ ok: false, msg: '内容不完整' });

  const post = {
    id: 'post-' + crypto.randomBytes(6).toString('hex'),
    author: username, authorName: user.displayName || username, authorAvatar: user.avatar || null,
    title: String(title).slice(0, 50), content: String(content).slice(0, 2000), images: images,
    time: Date.now(), likes: [], comments: []
  };
  
  postsData.unshift(post);
  if (postsData.length > 200) postsData = postsData.slice(0, 200);
  savePosts(postsData);
  io.emit('posts_updated', postsData);
  res.json({ ok: true, post });
});

app.delete('/api/posts/:id', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false });
  const user = state.users[username];
  
  const idx = postsData.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false });
  if (postsData[idx].author !== username && !user.isSuperAdmin && !user.isAdmin) return res.status(403).json({ ok: false });
  
  postsData.splice(idx, 1);
  savePosts(postsData);
  io.emit('posts_updated', postsData);
  res.json({ ok: true });
});

app.post('/api/posts/:id/like', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false });
  const post = postsData.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ ok: false });
  
  const idx = post.likes.indexOf(username);
  if (idx === -1) post.likes.push(username);
  else post.likes.splice(idx, 1);
  
  savePosts(postsData);
  io.emit('posts_updated', postsData);
  res.json({ ok: true });
});

app.post('/api/posts/:id/comment', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false });
  const user = state.users[username];
  const post = postsData.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ ok: false });
  
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.json({ ok: false, msg: '评论不能为空' });
  
  post.comments.push({
    id: 'c-' + crypto.randomBytes(4).toString('hex'),
    author: username, authorName: user.displayName || username, text: text.slice(0, 500), time: Date.now()
  });
  savePosts(postsData);
  io.emit('posts_updated', postsData);
  res.json({ ok: true });
});


// ============ 三角洲行动情报站 ============
const DELTA_WHITELIST = ['mac']; // 只有 mac 能看到按钮
app.get('/api/delta/whitelist', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false });
  res.json({ ok: true, allowed: DELTA_WHITELIST.includes(username) });
});
app.post('/api/delta/analyze', async (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false });
  if (!DELTA_WHITELIST.includes(username)) return res.status(403).json({ ok: false, msg: '无权访问' });
  const { manualText } = req.body || {};
  try {
    let newsText = '';
    if (manualText && manualText.trim()) {
      newsText = manualText.trim();
    } else {
      const apiRes = await fetch('https://delta.shopping/api/announce?limit=5');
      const apiData = await apiRes.json();
      if (apiData.ok && apiData.data) newsText = apiData.data.map(x => x.title).join('\n');
      else return res.json({ ok: false, msg: '第三方公告接口暂时不可用，请使用手动喂饭功能。' });
    }
    const prompt = `你是一个《三角洲行动》的硬核战术分析师。请根据以下官方公告/更新内容，用玩家能听懂的、稍微带点调侃的口吻，给玩家总结 3 条最重要的战术情报或避坑建议。不要废话，直接输出。公告内容：\n${newsText}`;
    const aiReply = await callAI(config.AI1.url, config.AI1.model, [{ role: 'system', content: '你是一个硬核游戏战术分析师，只输出分析结果。' }, { role: 'user', content: prompt }], 600);
    let cleanReply = aiReply;
    const markers = ['</think', '</reasoning'];
    for (const m of markers) { const idx = cleanReply.toLowerCase().indexOf(m.toLowerCase()); if (idx !== -1) cleanReply = cleanReply.slice(0, idx).trim(); }
    res.json({ ok: true, raw: newsText, analysis: cleanReply });
  } catch (err) { res.json({ ok: false, msg: '分析失败: ' + err.message }); }
});

// ============ 赛博捞鱼场 API ============
app.post('/api/fishing/catch', (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  const today = new Date().toISOString().slice(0, 10);
  if (user.lastFishDate !== today) { user.lastFishDate = today; user.fishCountToday = 0; }
  if ((user.fishCountToday || 0) >= 50) return res.json({ ok: false, msg: '今天捞了 50 次了，让鱼休息一下吧！' });
  user.fishCountToday = (user.fishCountToday || 0) + 1; saveState();
  const r = Math.random(); let rewardType = 'orange'; let rewardAmount = 0; let emoji = '🐟'; let name = '普通鱼'; let msg = '';
  if (r < 0.01) { rewardType = 'orange'; rewardAmount = 500; emoji = '🐳'; name = '机房吉祥物 (蓝鲸)'; msg = '已存入你的橘子余额！'; io.emit('system_all', '📢 震惊！【' + (user.displayName || username) + '】在捞鱼场捞起了传说中的深海巨兽！获得 500 🍊！'); }
  else if (r < 0.26) { rewardType = 'food'; const foods = ['🥩', '🐟', '🍫', '🍖', '🦞']; emoji = foods[Math.floor(Math.random() * foods.length)]; name = FOOD_DICT[emoji] ? FOOD_DICT[emoji].name : '高级海鲜'; msg = '已存入赛博厨房库存！'; }
  else if (r < 0.80) { rewardAmount = Math.floor(Math.random() * 21) + 10; emoji = '🍊'; name = rewardAmount + ' 橘子'; msg = '已存入你的橘子余额！'; }
  else { emoji = '👟'; name = '破拖鞋'; rewardType = 'none'; rewardAmount = -10; msg = '空网了，捞上来一只破拖鞋，嫌弃地扔回海里，扣除 10 橘子清洁费...'; }
  if ((rewardType === 'orange' && rewardAmount > 0) || rewardAmount === -10) {
    const bal = getBalance(user.id); bal.oranges += rewardAmount; addOrangeLog(user.id, rewardAmount, rewardAmount > 0 ? '赛博捞鱼' : '捞鱼踩雷(破拖鞋)'); saveLobster(lobsterData);
  } else if (rewardType === 'food') {
    if (!foodData.inventory[user.id]) foodData.inventory[user.id] = {}; foodData.inventory[user.id][emoji] = (foodData.inventory[user.id][emoji] || 0) + 1; saveFood(foodData);
  }
  res.json({ ok: true, emoji, name, rewardType, rewardAmount, msg, count: user.fishCountToday });
});



// ============ 赛博急救站 API ============
const multer_doctor = require('multer');
const upload_doctor = multer_doctor({ dest: path.join(__dirname, 'public', 'uploads') });

app.post('/api/doctor/upload', upload_doctor.single('file'), async (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  if (!req.file) return res.status(400).json({ ok: false, msg: '没有文件' });

  const filePath = req.file.path;
  const fileName = req.file.originalname;
  const ext = path.extname(fileName).toLowerCase();
  
  try {
    let content = '';
    let isImage = false;

    if (['.txt', '.js', '.py', '.json', '.html', '.css'].includes(ext)) {
      content = fs.readFileSync(filePath, 'utf8').slice(0, 3000); // 限制前3000字
    } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      isImage = true;
    } else {
      return res.json({ ok: false, msg: '暂时只支持代码文件(.txt/.js/.py等)和图片截图' });
    }

    let prompt = '';
    if (isImage) {
      prompt = `老板，这是一张报错截图。请分析图中的报错信息，用通俗易懂的语言告诉老板哪里出错了，并给出修复建议。`;
      // 因为本地AI视觉能力不一定开，这里直接给个文字反馈，假装它看了
      // 真要识图，得调 config.AI1 的视觉接口，这里简化处理
      res.json({ ok: true, analysis: '🐱 龙虾看了一眼截图：由于本地 AI 视觉模块未加载，我猜这是个前端报错。请把具体的报错文字复制给我！' });
      return;
    }

    prompt = `你是一个资深程序员。请诊断以下代码或报错文本，指出其中的 Bug，并给出修复建议。如果代码太长，只需要指出最核心的问题。\n\n文件名：${fileName}\n内容：\n${content}`;
    
    const aiReply = await callAI(config.AI1.url, config.AI1.model, [
      { role: 'system', content: '你是一个毒舌但技术高超的修机师傅。直接给出分析和修复后的代码。' },
      { role: 'user', content: prompt }
    ], 800);

    let cleanReply = aiReply;
    const markers = ['</think', '</reasoning'];
    for (const m of markers) {
      const idx = cleanReply.toLowerCase().indexOf(m.toLowerCase());
      if (idx !== -1) cleanReply = cleanReply.slice(0, idx).trim();
    }

    // 将 AI 的回复保存到一个 txt 文件供下载
    const fixFileName = 'fixed_' + Date.now() + '.txt';
    const fixFilePath = path.join(__dirname, 'public', 'uploads', fixFileName);
    fs.writeFileSync(fixFilePath, cleanReply, 'utf8');

    res.json({ 
      ok: true, 
      analysis: cleanReply,
      downloadUrl: '/uploads/' + fixFileName
    });

  } catch (err) {
    console.error('诊断失败:', err);
    res.json({ ok: false, msg: 'AI 分析失败: ' + err.message });
  }
});


// ============ 赛博急救站 (全格式超级版) ============
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const pdfParse = require('pdf-parse');
const upload_doctor_multi = multer_doctor({ dest: path.join(__dirname, 'public', 'uploads') });

app.post('/api/doctor/upload-multi', upload_doctor_multi.array('files', 10), async (req, res) => {
  const token = req.headers.authorization;
  const username = tokens[token];
  if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
  const user = state.users[username];
  if (!req.files || req.files.length === 0) return res.status(400).json({ ok: false, msg: '没有收到文件' });

  const cost = 10;
  const bal = getBalance(user.id);
  if (bal.oranges < cost) {
    for (const file of req.files) { try { fs.unlinkSync(file.path); } catch(e){} }
    return res.json({ ok: false, msg: '橘子不够啦！发动【龙虾 AI 技能】需要 ' + cost + ' 🍊' });
  }

  bal.oranges -= cost;
  addOrangeLog(user.id, -cost, '龙虾AI技能(全文件诊断)');
  saveLobster(lobsterData);

  try {
    let combinedContent = '';
    let validFileCount = 0;

    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      let content = '';
      
      try {
        if (['.txt', '.js', '.py', '.json', '.html', '.css', '.java', '.c', '.cpp', '.md'].includes(ext)) {
          content = fs.readFileSync(file.path, 'utf8');
        } else if (ext === '.docx') {
          const result = await mammoth.extractRawText({ path: file.path });
          content = result.value;
        } else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
          const workbook = xlsx.readFile(file.path);
          const sheetName = workbook.SheetNames[0];
          content = xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        } else if (ext === '.pdf') {
          const dataBuffer = fs.readFileSync(file.path);
          const data = await pdfParse(dataBuffer);
          content = data.text;
        }
        content = content.slice(0, 2000); 
        combinedContent += `\n--- 文件: ${file.originalname} (${ext}) ---\n${content}\n`;
        validFileCount++;
      } catch (e) {
        console.error('文件解析失败:', file.originalname, e.message);
      }
      
      try { fs.unlinkSync(file.path); } catch(e){}
    }

    if (validFileCount === 0) {
      bal.oranges += cost;
      addOrangeLog(user.id, cost, '龙虾AI技能解析失败退款');
      saveLobster(lobsterData);
      return res.json({ ok: false, msg: '未能提取出有效内容，橘子已退还。' });
    }

    if (combinedContent.length > 8000) combinedContent = combinedContent.slice(0, 8000) + '\n\n...[内容过长已截断]...';

    const prompt = `你是一个资深全栈工程师。请全局诊断以下 ${validFileCount} 个文件的代码或数据。指出核心 Bug 或异常，给出修复建议。\n${combinedContent}`;
    
    const aiReply = await callAI(config.AI1.url, config.AI1.model, [
      { role: 'system', content: '你是一个毒舌但技术高超的赛博全科医生。直接给出解决方案。' },
      { role: 'user', content: prompt }
    ], 1000);

    let cleanReply = aiReply;
    const markers = ['</think', '</reasoning'];
    for (const m of markers) {
      const idx = cleanReply.toLowerCase().indexOf(m.toLowerCase());
      if (idx !== -1) cleanReply = cleanReply.slice(0, idx).trim();
    }

    const fixFileName = 'diagnosis_report_' + Date.now() + '.txt';
    fs.writeFileSync(path.join(__dirname, 'public', 'uploads', fixFileName), cleanReply, 'utf8');

    res.json({ 
      ok: true, 
      analysis: cleanReply,
      downloadUrl: '/uploads/' + fixFileName,
      orangesLeft: bal.oranges
    });

  } catch (err) {
    bal.oranges += cost;
    addOrangeLog(user.id, cost, '龙虾AI技能系统错误退款');
    saveLobster(lobsterData);
    console.error('全格式诊断失败:', err);
    res.json({ ok: false, msg: 'AI 分析失败，橘子已退还: ' + err.message });
  }
});

// ============ 橘语执行引擎 API ============
const fs_p = require('fs');
const path_p = require('path');
const { execSync } = require('child_process');

app.post('/api/orange/run', (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ ok: false, msg: '代码不能为空' });

  const tempFile = path_p.join(__dirname, 'temp_calc_' + crypto.randomBytes(8).toString('hex') + '.orange');
  
  try {
    fs_p.writeFileSync(tempFile, code, 'utf-8');
    const output = execSync(`python3 orange-lang.py ${tempFile}`, { encoding: 'utf-8', timeout: 3000 });
    if (fs_p.existsSync(tempFile)) fs_p.unlinkSync(tempFile);
    res.json({ ok: true, output: output });
  } catch (err) {
    if (fs_p.existsSync(tempFile)) fs_p.unlinkSync(tempFile);
    res.json({ ok: false, msg: '执行出错: ' + err.message });
  }
});



  console.log('[补丁块] 图文/三角洲/捞鱼/急救/橘语 已挂载');
};
