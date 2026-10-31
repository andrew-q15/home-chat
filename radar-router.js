module.exports = function setupRadar(io, ctx) {
  const nameToSockets = {}; // 用于去重

  io.on('connection', (socket) => {
    const name = socket.data.name;
    if (!name) return;

    // 记录在线连接
    if (!nameToSockets[name]) nameToSockets[name] = new Set();
    nameToSockets[name].add(socket);

    // 如果上线的人不是 mac（老板），且是第一次连接
    if (nameToSockets[name].size === 1 && name !== 'mac') {
      const user = ctx.state.users[name];
      const displayName = user ? (user.displayName || name) : name;
      
      setTimeout(() => {
        const bossName = 'mac';
        if (ctx.state.users[bossName]) {
          // 建立 mac 的私聊频道
          const dmName = 'DM:' + [bossName, '系统'].sort().join('|');
          if (!ctx.state.channels.includes(dmName)) {
            ctx.state.channels.push(dmName);
            ctx.state.histories[dmName] = [];
          }
          
          // 发送雷达消息
          const alertMsg = `🚨 老板注意！【${displayName}】刚刚上线了，已连接赛博网络。`;
          // 使用 ctx.pushMessage 广播给所有在线用户（前端会根据文字内容响铃）
          ctx.pushMessage(dmName, '系统监控', alertMsg, { kind: 'system', isRadar: true });
          
          // 强制推给 mac 让他即时收到
          if (nameToSockets[bossName]) {
            nameToSockets[bossName].forEach(s => {
              s.emit('channels', ctx.channelsFor(bossName));
              s.emit('message', ctx.state.histories[dmName][ctx.state.histories[dmName].length - 1]);
            });
          }
        }
      }, 1000);
    }

    // 断线清理
    socket.on('disconnect', () => {
      if (nameToSockets[name]) {
        nameToSockets[name].delete(socket);
        if (nameToSockets[name].size === 0) delete nameToSockets[name];
      }
    });
  });

  console.log('[雷达] 老板专属上线监控雷达已挂载');
};
