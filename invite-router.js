module.exports = function setupInvite(io, ctx) {
  // 我们需要维护用户与 socket 的映射
  const activeUsers = {}; // { username: [sockets] }

  io.on('connection', (socket) => {
    const name = socket.data.name;
    if (!name) return;

    if (!activeUsers[name]) activeUsers[name] = new Set();
    activeUsers[name].add(socket);

    // 客户端请求获取当前在线名单
    socket.on('invite_get_online', () => {
      const onlineList = Object.keys(activeUsers).filter(u => u !== name);
      socket.emit('invite_online_list', onlineList);
    });

    // 客户端发送邀请
    socket.on('invite_send', ({ targetName, gameName, gameUrl }) => {
      if (!activeUsers[targetName]) {
        return socket.emit('error_msg', targetName + ' 不在线哦！');
      }
      
      const inviter = ctx.state.users[name]?.displayName || name;
      const msg = `🎮 【组队邀请】你的好友【${inviter}】邀请你一起玩《${gameName}》！点击直达：${gameUrl}`;
      
      // 存入私聊记录
      const dmName = 'DM:' + [name, targetName].sort().join('|');
      if (!ctx.state.channels.includes(dmName)) {
        ctx.state.channels.push(dmName);
        ctx.state.histories[dmName] = [];
      }
      ctx.pushMessage(dmName, '组队系统', msg, { kind: 'system' });

      // 强制推给对方
      activeUsers[targetName].forEach(s => {
        s.emit('channels', ctx.channelsFor(targetName));
        s.emit('message', ctx.state.histories[dmName][ctx.state.histories[dmName].length - 1]);
      });

      socket.emit('system', '✅ 邀请已发送给 ' + targetName);
    });

    socket.on('disconnect', () => {
      if (activeUsers[name]) {
        activeUsers[name].delete(socket);
        if (activeUsers[name].size === 0) delete activeUsers[name];
      }
    });
  });
  console.log('[组队] 全站邀请系统已挂载');
};
