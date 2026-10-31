module.exports = function setupDuel(io, ctx) {
  const rooms = {}; // 只开一个房间，简化处理

  io.on('connection', (socket) => {
    socket.on('duel_join', () => {
      const name = socket.data.name;
      if (!name) return;
      
      if (!rooms['main']) rooms['main'] = { players: {} };
      const room = rooms['main'];

      // 简单分配阵营，最多两人
      const pCount = Object.keys(room.players).length;
      if (pCount >= 2) {
        socket.emit('duel_error', '房间已满，请等别人退出');
        return;
      }

      const side = pCount === 0 ? 'left' : 'right';
      room.players[socket.id] = {
        id: socket.id, name, side, hp: 100,
        x: side === 'left' ? 100 : 900, y: 100, aimAngle: 0
      };

      socket.emit('duel_init', { side, myId: socket.id });
      io.emit('duel_state', room.players);
      console.log(`[对决] ${name} 加入了房间，阵营: ${side}`);
    });

    socket.on('duel_sync', (data) => {
      if (!rooms['main'] || !rooms['main'].players[socket.id]) return;
      const p = rooms['main'].players[socket.id];
      p.x = data.x; p.y = data.y; p.aimAngle = data.aimAngle; p.hp = data.hp;
      socket.broadcast.emit('duel_update', p);
    });

    socket.on('duel_shoot', (data) => {
      socket.broadcast.emit('duel_bullet', { x: data.x, y: data.y, vx: data.vx, vy: data.vy, owner: socket.id });
    });

    socket.on('duel_hit', ({ targetId, damage }) => {
      if (rooms['main'] && rooms['main'].players[targetId]) {
        rooms['main'].players[targetId].hp -= damage;
        io.to(targetId).emit('duel_damage', damage);
      }
    });

    socket.on('disconnect', () => {
      if (rooms['main'] && rooms['main'].players[socket.id]) {
        delete rooms['main'].players[socket.id];
        io.emit('duel_state', rooms['main'].players);
      }
    });
  });
  console.log('[对决] 火柴人联机模块已挂载');
};
