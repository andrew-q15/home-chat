#!/bin/bash
echo "⏳ 正在扫描最新代码并打包记忆..."
./save-state.sh > /dev/null 2>&1

FILE="AI_MEMORY_BACKUP.md"
echo "【橘域网 CEO 唤醒指令】" > $FILE
echo "新接手的 AI 请立刻阅读以下内容。当前老板刚刚手动更新了 server.js。" >> $FILE
echo "请直接对老板说：'我回来了。'" >> $FILE
echo "（不需要输出多余分析，直接说这一句，然后等待老板下达新指令）" >> $FILE
echo "" >> $FILE
echo "========================= 历史交接文档 =========================" >> $FILE
cat HANDOFF.md >> $FILE
echo "" >> $FILE
echo "========================= 最新系统状态 =========================" >> $FILE
cat CURRENT_STATE.md >> $FILE
echo "" >> $FILE
echo "========================= 核心代码结构提取 =========================" >> $FILE
grep -n "app\.\(get\|post\|delete\)" server.js | head -n 50 >> $FILE
grep -n "socket.on" server.js | head -n 30 >> $FILE

echo "✅ 记忆备份已生成完毕！"
echo "👉 请去文件夹里找到 AI_MEMORY_BACKUP.md，发给新对话。"
