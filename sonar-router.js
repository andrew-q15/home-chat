// ============ 模拟声纳 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function setupSonar(app, ctx) {
  const { tokens, state } = ctx;
  const FILE = path.join(__dirname, 'sonar.json');
  function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { rooms: {} }; } }
  function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch {} }
  let sonarData = load();
  if (!sonarData.rooms) sonarData.rooms = {};

  app.get('/api/sonar/room', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const room = sonarData.rooms[user.id] || { strokes: [] };
    res.json({ ok: true, room });
  });

  app.post('/api/sonar/room', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const raw = Array.isArray(req.body && req.body.strokes) ? req.body.strokes : [];
    const strokes = raw.slice(0, 200)
      .map(s => ({ points: Array.isArray(s && s.points) ? s.points.slice(0, 500) : [] }))
      .filter(s => s.points.length >= 2);
    sonarData.rooms[user.id] = { strokes, updatedAt: Date.now() };
    save(sonarData);
    res.json({ ok: true });
  });

  app.post('/api/sonar/scan', (req, res) => {
    const username = ctx.tokens[req.headers.authorization];
    if (!username) return res.status(401).json({ ok: false });
    const user = state.users[username];
    if (!user) return res.status(401).json({ ok: false });
    const room = sonarData.rooms[user.id];
    if (!room || !room.strokes || room.strokes.length === 0) return res.json({ ok: false, msg: '先画房间' });

    const x = Number(req.body.x);
    const y = Number(req.body.y);
    const rays = Math.min(72, Math.max(8, Number(req.body.rays) || 72)); // 限制72条防炸

    const segments = [];
    for (const s of room.strokes) {
      if (!s.points || s.points.length < 2) continue;
      for (let i = 0; i < s.points.length - 1; i++) {
        segments.push({ x1: s.points[i].x, y1: s.points[i].y, x2: s.points[i+1].x, y2: s.points[i+1].y });
      }
    }

    function raySegmentHit(ox, oy, dx, dy, seg) {
      const x3 = seg.x1, y3 = seg.y1, x4 = seg.x2, y4 = seg.y2;
      const denom = (dx) * (y4 - y3) - (dy) * (x4 - x3);
      if (Math.abs(denom) < 1e-9) return null;
      const t = ((x3 - ox) * (y4 - y3) - (y3 - oy) * (x4 - x3)) / denom;
      const u = ((x3 - ox) * dy - (y3 - oy) * dx) / denom;
      if (t >= 0 && u >= 0 && u <= 1) return t;
      return null;
    }

    const hits = [];
    const MAX_BOUNCES = 200; 
    for (let i = 0; i < rays; i++) {
      const angle = (i / rays) * Math.PI * 2;
      let ox = x, oy = y;
      let dx = Math.cos(angle);
      let dy = Math.sin(angle);
      const pathArr = [{ x: ox, y: oy }];
      
      for (let b = 0; b < MAX_BOUNCES; b++) {
        let minT = Infinity, hitSeg = null;
        for (const seg of segments) {
          const t = raySegmentHit(ox, oy, dx, dy, seg);
          if (t !== null && t < minT) { minT = t; hitSeg = seg; }
        }
        if (minT === Infinity || minT < 1e-6) break;
        
        const hx = ox + dx * minT;
        const hy = oy + dy * minT;
        pathArr.push({ x: hx, y: hy });

        const sx = hitSeg.x2 - hitSeg.x1;
        const sy = hitSeg.y2 - hitSeg.y1;
        const segLen = Math.hypot(sx, sy) || 1;
        let nx = -sy / segLen;
        let ny = sx / segLen;
        if (dx * nx + dy * ny > 0) { nx = -nx; ny = -ny; }
        const dot = dx * nx + dy * ny;
        dx = dx - 2 * dot * nx;
        dy = dy - 2 * dot * ny;
        ox = hx; oy = hy;
      }
      hits.push({ angle, path: pathArr });
    }

    res.json({ ok: true, origin: { x, y }, hits, rays });
  });
  console.log('[声纳] 模块已挂载');
};
