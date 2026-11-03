// ============ 赛博实时电台（WebRTC 信令）============
module.exports = function setupRadio(io, ctx) {
  const { nameToSockets } = ctx;

  // 记录当前在电台频道的用户：{ socketId: { name, channel } }
  const radioUsers = new Map();

  io.on('connection', (socket) => {
    const name = socket.data.name;
    if (!name) return;

    socket.on('radio_join', ({ channel }) => {
      radioUsers.set(socket.id, { name, channel });
      socket.join('radio_' + channel);
      // 通知房间里其他人：有人加入了
      socket.to('radio_' + channel).emit('radio_user_joined', { socketId: socket.id, name });
      // 把当前房间名单发给新加入的人
      const users = Array.from(radioUsers.entries()).filter(([_, u]) => u.channel === channel).map(([id, u]) => ({ socketId: id, name: u.name }));
      socket.emit('radio_users_list', users);
      console.log('[电台] ' + name + ' 加入频道 ' + channel);
    });

    socket.on('radio_leave', ({ channel }) => {
      radioUsers.delete(socket.id);
      socket.leave('radio_' + channel);
      socket.to('radio_' + channel).emit('radio_user_left', { socketId: socket.id, name });
    });

    // WebRTC 信令转发
    socket.on('radio_signal', ({ targetId, signal }) => {
      socket.to(targetId).emit('radio_signal', { fromId: socket.id, signal });
    });

    socket.on('disconnect', () => {
      const info = radioUsers.get(socket.id);
      if (info) {
        socket.to('radio_' + info.channel).emit('radio_user_left', { socketId: socket.id, name: info.name });
        radioUsers.delete(socket.id);
        console.log('[电台] ' + info.name + ' 断开');
      }
    });
  });

  console.log('[电台] WebRTC 信令服务器已挂载');
};
