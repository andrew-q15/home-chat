#!/bin/bash
# ============ 服务器看门狗 ============
# 每 60 秒体检一次：连续 2 次失败就自动重启 chat 并记录日志
# 注册方式：pm2 start watchdog.sh --name watchdog
cd "$(dirname "$0")"
FAILS=0
while true; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST http://localhost:3000/api/verify 2>/dev/null)
  if [ "$CODE" = "200" ]; then
    FAILS=0
  else
    FAILS=$((FAILS+1))
    echo "[$(date '+%F %T')] 健康检查失败 (HTTP $CODE) x$FAILS" >> watchdog.log
    if [ "$FAILS" -ge 2 ]; then
      echo "[$(date '+%F %T')] >>> 自动重启 chat" >> watchdog.log
      pm2 restart chat >> watchdog.log 2>&1
      FAILS=0
    fi
  fi
  sleep 60
done
