#!/bin/bash
# 橘域网 · 阿里云 ECS 初始化（ACL3 / x86_64），root 执行
set -e
echo "1/9 系统更新"
dnf update -y
echo "2/9 基础工具"
dnf install -y git curl wget vim htop tmux firewalld nginx
echo "3/9 Docker"
curl -fsSL https://get.docker.com | bash
systemctl enable docker
systemctl start docker
docker version
echo "4/9 Docker Compose"
curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
docker-compose version
echo "5/9 deploy 用户"
useradd -m -s /bin/bash deploy 2>/dev/null || true
usermod -aG docker deploy
mkdir -p /home/deploy/data/backups /home/deploy/home-chat
echo "6/9 Nginx 反代配置"
cp /root/orange-nginx.conf /etc/nginx/conf.d/orange.conf
rm -f /etc/nginx/conf.d/default.conf
nginx -t
systemctl enable nginx
systemctl restart nginx
echo "7/9 防火墙"
systemctl enable firewalld
systemctl start firewalld
firewall-cmd --permanent --add-service=ssh
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
echo "8/9 提示"
echo "  接下来：scp 状态 JSON → bash /root/setup-ecs.sh"
echo "  然后：docker login registry.cn-hangzhou.aliyuncs.com -u <RAM用户名>"
echo "9/9 完成"
