#!/bin/bash
# 橘域网 · 阿里云轻量应用服务器 2核2G 初始化（Alibaba Cloud Linux，root 执行）
set -e
echo "1/10 系统更新"
dnf update -y
echo "2/10 基础工具"
dnf install -y git curl wget vim htop tmux nginx cronie
echo "3/10 Docker"
curl -fsSL https://get.docker.com | bash
mkdir -p /etc/docker
echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' > /etc/docker/daemon.json
systemctl enable docker
systemctl start docker
docker version
echo "4/10 Compose 插件（可选，部署不依赖）"
dnf install -y docker-compose-plugin || true
echo "5/10 1G swap（2核2G 防 OOM）"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=1024
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
fi
free -h
echo "6/10 deploy 用户 + 目录"
useradd -m -s /bin/bash deploy 2>/dev/null || true
usermod -aG docker deploy
mkdir -p /home/deploy/data/backups /home/deploy/home-chat
echo "7/10 Nginx 反代"
cp /root/orange-nginx.conf /etc/nginx/conf.d/orange.conf
rm -f /etc/nginx/conf.d/default.conf
nginx -t
systemctl enable nginx
systemctl restart nginx
echo "8/10 本机防火墙（云控制台「防火墙」页也要放行 22/80/443）"
systemctl enable firewalld 2>/dev/null || true
systemctl start firewalld 2>/dev/null || true
firewall-cmd --permanent --add-service=ssh 2>/dev/null || true
firewall-cmd --permanent --add-service=http 2>/dev/null || true
firewall-cmd --permanent --add-service=https 2>/dev/null || true
firewall-cmd --reload 2>/dev/null || true
echo "9/10 crond（自愈 + 备份要用）"
systemctl enable --now crond
echo "10/10 完成"
echo "  下一步：scp 状态 JSON → bash /root/setup-ecs.sh"
echo "  然后：docker login registry.cn-hangzhou.aliyuncs.com -u <RAM用户名>"
