#!/bin/bash
FILE="CURRENT_STATE.md"
echo "# 🍊 橘域网最新状态快照 (给下一位 AI 的备忘录)" > $FILE
echo "生成时间: $(date)" >> $FILE
echo "" >> $FILE
echo "## 1. 基础架构" >> $FILE
echo "- 后端: Node.js + Express + Socket.io" >> $FILE
echo "- 数据库: data.json, lobster.json, posts.json, writings.json" >> $FILE
echo "" >> $FILE
echo "## 2. 当前运行状态" >> $FILE
echo '```text' >> $FILE
pm2 list | grep -E "chat|report|watchdog|proxy" >> $FILE
echo '```' >> $FILE
echo "" >> $FILE
echo "## 3. 核心 API 校验" >> $FILE
echo "- /api/verify: $(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3000/api/verify)" >> $FILE
echo "- /api/posts: $(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/posts)" >> $FILE
echo "" >> $FILE
echo "## 4. 前端页面清单" >> $FILE
ls -1 public/*.html | xargs -n 1 basename >> $FILE
echo "" >> $FILE
echo "## 5. 日志记录的近期重大更新" >> $FILE
tail -n 10 HANDOFF.md >> $FILE
