const crypto = require('crypto');

module.exports = function setupSnakeRouter(io, ctx) {
  const snakeState = { players: {}, food: [], mapSize: 25, tickTimer: null, running: false };
  const SNAKE_TICK = 100;
  const SNAKE_COLORS = ['#2ecc40','#ff7b72','#79c0ff','#d2a8ff','#ffa657','#7ee787'];
  const SNAKE_RESPAWN_MS = 3000;

  function snakeSpawn(id) {
    const p = snakeState.players[id]; if (!p) return;
    if (!p.spawn) {
      let sx = 2, sy = 2;
      for (let tries = 0; tries < 80; tries++) {
        sx = 2 + Math.floor(Math.random() * (snakeState.mapSize - 4));
        sy = 2 + Math.floor(Math.random() * (snakeState.mapSize - 4));
        let free = true;
        for (const oid in snakeState.players) {
          if (oid === id || !snakeState.players[oid].alive) continue;
          for (const seg of snakeState.players[oid].body) {
            if (Math.abs(seg.x - sx) < 3 && Math.abs(seg.y - sy) < 3) { free = false; break; }
          }
          if (!free) break;
        }
        if (free) break;
      }
      p.spawn = { x: sx, y: sy };
    }
    const x = p.spawn.x, y = p.spawn.y;
    p.body = [{ x, y }, { x: x - 1, y }, { x: x - 2, y }];
    p.dir = { x: 1, y: 0 }; p.pendingDir = { x: 1, y: 0 };
    p.alive = true; p.respawnAt = 0; p.growth = 0;
  }

  function snakeEnsureFood() {
    const target = 3 + Object.keys(snakeState.players).length;
    while (snakeState.food.length < target) {
      const x = Math.floor(Math.random() * snakeState.mapSize);
      const y = Math.floor(Math.random() * snakeState.mapSize);
      snakeState.food.push({ x, y });
    }
  }

  function snakeBroadcast() {
    const payload = { mapSize: snakeState.mapSize, players: {}, food: snakeState.food };
    for (const id in snakeState.players) {
      const p = snakeState.players[id];
      payload.players[id] = { name: p.name, color: p.color, body: p.body, alive: p.alive, respawnAt: p.respawnAt, score: p.score };
    }
    io.emit('snake_state', payload);
  }

  function snakeTick() {
    const size = snakeState.mapSize; const now = Date.now();
    for (const id in snakeState.players) {
      const p = snakeState.players[id];
      if (!p.alive) { if (p.respawnAt && now >= p.respawnAt) snakeSpawn(id); continue; }
      const cur = p.dir; const pd = p.pendingDir;
      if (pd && !(pd.x === -cur.x && pd.y === -cur.y) && !(pd.x === cur.x && pd.y === cur.y)) p.dir = pd;
      
      const head = p.body[0]; const nh = { x: head.x + p.dir.x, y: head.y + p.dir.y };
      if (nh.x < 0 || nh.x >= size || nh.y < 0 || nh.y >= size) { p.alive = false; p.respawnAt = now + SNAKE_RESPAWN_MS; continue; }
      
      let dead = false;
      // 撞自己（跳过尾巴）
      for (let i = 0; i < p.body.length - 1; i++) {
        if (p.body[i].x === nh.x && p.body[i].y === nh.y) { dead = true; break; }
      }
      if (dead) { p.alive = false; p.respawnAt = now + SNAKE_RESPAWN_MS; continue; }

      // 撞别人
      for (const oid in snakeState.players) {
        if (oid === id || !snakeState.players[oid].alive) continue;
        for (const seg of snakeState.players[oid].body) { if (seg.x === nh.x && seg.y === nh.y) { dead = true; break; } }
        if (dead) break;
      }
      if (dead) { p.alive = false; p.respawnAt = now + SNAKE_RESPAWN_MS; continue; }

      let ate = -1;
      for (let i = 0; i < snakeState.food.length; i++) { if (snakeState.food[i].x === nh.x && snakeState.food[i].y === nh.y) { ate = i; break; } }
      
      p.body.unshift(nh);
      let shouldPop = true;
      if (ate >= 0) {
        snakeState.food.splice(ate, 1); p.score++; p.growth = (p.growth || 0) + 1;
        if (p.growth >= 5) { p.growth = 0; shouldPop = false; }
      }
      if (shouldPop) p.body.pop();
    }
    snakeEnsureFood(); snakeBroadcast();
  }

  function snakeEnsureTick() {
    const any = Object.keys(snakeState.players).length > 0;
    if (any && !snakeState.running) { snakeState.running = true; snakeState.tickTimer = setInterval(snakeTick, SNAKE_TICK); }
    else if (!any && snakeState.running) { snakeState.running = false; clearInterval(snakeState.tickTimer); snakeState.tickTimer = null; }
  }

  io.on('connection', (socket) => {
    socket.on('snake_join', () => {
      if (!socket.data.name || snakeState.players[socket.id]) return;
      snakeState.players[socket.id] = { id: socket.id, name: socket.data.name, body: [], dir: { x: 1, y: 0 }, pendingDir: { x: 1, y: 0 }, alive: true, respawnAt: 0, score: 0, color: SNAKE_COLORS[Object.keys(snakeState.players).length % SNAKE_COLORS.length] };
      snakeSpawn(socket.id); snakeEnsureFood(); snakeEnsureTick(); snakeBroadcast();
    });
    socket.on('snake_dir', (d) => {
      const p = snakeState.players[socket.id];
      if (p && p.alive && d && typeof d.x === 'number' && Math.abs(d.x) + Math.abs(d.y) === 1) p.pendingDir = { x: d.x, y: d.y };
    });
    socket.on('snake_respawn', () => {
      const p = snakeState.players[socket.id];
      if (p && !p.alive && Date.now() >= p.respawnAt) { snakeSpawn(socket.id); snakeBroadcast(); }
    });
    socket.on('disconnect', () => {
      if (snakeState.players[socket.id]) { delete snakeState.players[socket.id]; snakeEnsureTick(); snakeBroadcast(); }
    });
  });
  console.log('[游戏] 3D 贪吃蛇独立模块挂载成功');
};
