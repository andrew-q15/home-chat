#!/bin/bash
# 阿里云轻量 2核2G，root 跑一次，跟在 init-aliyun.sh 后面
set -e
mkdir -p /home/deploy/data/backups

# swap 兜底（init 没跑成功时补齐）
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=1024
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

# 目录为空时给最小合法结构；正式数据用 scp 覆盖
if ! ls /home/deploy/data/*.json >/dev/null 2>&1; then
  echo '{"balances":{}}' > /home/deploy/data/lobster.json
  echo '{"customWords":[],"stats":{}}' > /home/deploy/data/drawguess.json
  echo '{"tasks":[],"history":[]}' > /home/deploy/data/night-ai.json
  echo '{"oranges":0,"history":[],"loans":[],"receivables":[]}' > /home/deploy/data/treasury.json
fi

# 容器内 app 是 UID 1001，状态文件必须让它可写
chown -R 1001:1001 /home/deploy/data
chmod 664 /home/deploy/data/*.json

# 宿主机自愈（容器里没 docker CLI）
echo '#!/bin/bash' > /home/deploy/health-check.sh
echo 'curl -sf -m 5 -X POST http://127.0.0.1:3000/api/verify > /dev/null || docker restart orange-chat' >> /home/deploy/health-check.sh
chmod +x /home/deploy/health-check.sh
chown deploy:deploy /home/deploy/health-check.sh
( crontab -u deploy -l 2>/dev/null; echo "*/2 * * * * /home/deploy/health-check.sh" ) | crontab -u deploy -

free -h
echo "ECS 就绪：状态文件 + swap + 自愈 cron"
