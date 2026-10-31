const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const pdfParse = require('pdf-parse');
const multer = require('multer');

module.exports = function setupSkillRouter(app, ctx) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  app.post('/api/doctor/upload-multi', upload.array('files', 10), async (req, res) => {
    const token = req.headers.authorization;
  const customPrompt = req.body.prompt;
    const username = ctx.tokens[token];
    if (!username) return res.status(401).json({ ok: false, msg: '未登录' });
    const user = ctx.state.users[username];
    if (!req.files || req.files.length === 0) return res.status(400).json({ ok: false, msg: '没有收到文件' });

    const cost = 10;
    const bal = ctx.getBalance(user.id);
    if (bal.oranges < cost) {
      return res.json({ ok: false, msg: '橘子不够啦！发动【龙虾 AI 技能】需要 ' + cost + ' 🍊' });
    }

    bal.oranges -= cost;
    ctx.saveLobster(ctx.lobsterData);

    try {
      let combinedContent = '';
      let validFileCount = 0;

      for (const file of req.files) {
        const ext = path.extname(file.originalname).toLowerCase();
        let content = '';
        
        try {
          if (['.txt', '.js', '.py', '.json', '.html', '.css', '.java', '.c', '.cpp', '.md'].includes(ext)) {
            content = file.buffer.toString('utf8');
          } else if (ext === '.docx') {
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            content = result.value;
          } else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
            const workbook = xlsx.read(file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            content = xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);
          } else if (ext === '.pdf') {
            const data = await pdfParse(file.buffer);
            content = data.text;
          }
          content = content.slice(0, 2000); 
          combinedContent += `\n--- 文件: ${file.originalname} (${ext}) ---\n${content}\n`;
          validFileCount++;
        } catch (e) {}
      }

      if (validFileCount === 0) {
        bal.oranges += cost;
        ctx.saveLobster(ctx.lobsterData);
        return res.json({ ok: false, msg: '未能提取出有效内容，橘子已退还。' });
      }

      if (combinedContent.length > 8000) combinedContent = combinedContent.slice(0, 8000) + '\n\n...[内容过长已截断]...';

      const userGoal = customPrompt ? `用户的明确要求是：${customPrompt}` : '请全局诊断这些文件的代码，指出核心 Bug 或异常，并给出修复建议。';
    const prompt = `你是一个资深高级全栈工程师。${userGoal}\n请根据上述要求，分析以下内容：\n${combinedContent}`;
      const aiReply = await ctx.callAI(ctx.config.AI1.url, ctx.config.AI1.model, [
        { role: 'system', content: '你是一个专业、友善的高级全栈工程师。请直接给出核心分析和修复后的代码，不要嘲讽用户，态度要温和。' },
        { role: 'user', content: prompt }
      ], 1000);

      let cleanReply = aiReply;
      const markers = ['</think', '</reasoning'];
      for (const m of markers) {
        const idx = cleanReply.toLowerCase().indexOf(m.toLowerCase());
        if (idx !== -1) cleanReply = cleanReply.slice(0, idx).trim();
      }

      const fixFileName = 'diagnosis_report_' + Date.now() + '.txt';
      const fixFilePath = path.join(__dirname, 'public', 'uploads', fixFileName);
      fs.writeFileSync(fixFilePath, cleanReply, 'utf8');

      res.json({ 
        ok: true, 
        analysis: cleanReply,
        downloadUrl: '/uploads/' + fixFileName,
        orangesLeft: bal.oranges
      });

    } catch (err) {
      bal.oranges += cost;
      ctx.saveLobster(ctx.lobsterData);
      res.json({ ok: false, msg: 'AI 分析失败，橘子已退还: ' + err.message });
    }
  });

  console.log('[技能] 龙虾 AI 技能中心独立模块挂载成功');
};
