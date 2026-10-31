// ============ 共享白板 ============
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function setupBoard(io, ctx) {
  const { tokens, state, saveState } = ctx;

  const BOARD_FILE = path.join(__dirname, 'board.json');
  let board = { strokes: [] };
  try { board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8')); } catch {}
  if (!board.strokes) board.strokes = [];
  let boardUndone = {};
  let boardClearVote = null;
  let boardDirty = false;
  function saveBoardSoon() { boardDirty = true; }
  setInterval(() => {
    if (!boardDirty) return;
    boardDirty = false;
    try { fs.writeFileSync(BOARD_FILE, JSON.stringify(board)); } catch {}
  }, 5000);

  function getBoardUsers() {
    const room = io.sockets.adapter.rooms.get('__board__');
    if (!room) return [];
    return Array.from(room).map(id => io.sockets.sockets.get(id)?.data.name).filter(Boolean);
  }

  io.on('connection', (socket) => {
    const name = socket.data.name;
    if (!name) return;
  // 加入白板房间
  socket.on('board_join', () => {
    socket.join('__board__');
    socket.data.inBoard = true;
    // 发全量历史
    socket.emit('board_history', { strokes: board.strokes });
    // 通知房间其他人：谁进来了
    io.to('__board__').emit('board_users', getBoardUsers());
    console.log('[白板] ' + name + ' 加入，当前在线 ' + getBoardUsers().length);
  });

  socket.on('board_leave', () => {
    socket.leave('__board__');
    socket.data.inBoard = false;
    io.to('__board__').emit('board_users', getBoardUsers());
  });

  // 画一笔
  socket.on('board_draw', (stroke) => {
    if (!stroke || !stroke.id) return;
    stroke.userId = state.users[name]?.id || null;
    stroke.user = name;
    stroke.time = Date.now();
    board.strokes.push(stroke);
    if (board.strokes.length > 1000) board.strokes.shift();
    saveBoardSoon();
    // 广播给白板房间所有人（除自己）
    socket.to('__board__').emit('board_draw', stroke);
    // 清空这个人的重做栈（因为新笔画意味着上下文变了）
    if (state.users[name]?.id) delete boardUndone[state.users[name].id];
  });

  // 撤销自己最后一笔
  socket.on('board_undo', () => {
    const userId = state.users[name]?.id;
    if (!userId) return;
    // 从后往前找这个人的笔
    let idx = -1;
    for (let i = board.strokes.length - 1; i >= 0; i--) {
      if (board.strokes[i].userId === userId) { idx = i; break; }
    }
    if (idx === -1) {
      socket.emit('board_toast', { msg: '没有可撤销的笔画' });
      return;
    }
    const stroke = board.strokes.splice(idx, 1)[0];
    if (!boardUndone[userId]) boardUndone[userId] = [];
    boardUndone[userId].push(stroke);
    saveBoardSoon();
    io.to('__board__').emit('board_remove', { id: stroke.id });
    console.log('[白板] ' + name + ' 撤销一笔');
  });

  // 重做（回滚）自己刚撤销的
  socket.on('board_redo', () => {
    const userId = state.users[name]?.id;
    if (!userId) return;
    const stack = boardUndone[userId];
    if (!stack || stack.length === 0) {
      socket.emit('board_toast', { msg: '没有可重做的笔画' });
      return;
    }
    const stroke = stack.pop();
    board.strokes.push(stroke);
    saveBoardSoon();
    io.to('__board__').emit('board_draw', stroke);
    console.log('[白板] ' + name + ' 重做一笔');
  });

  // 请求清空（发起投票）
  socket.on('board_clear_request', () => {
    if (!socket.data.inBoard) return;
    // 拿所有在白板里的用户
    const room = io.sockets.adapter.rooms.get('__board__');
    if (!room) return;
    const users = Array.from(room).map(id => io.sockets.sockets.get(id)?.data.name).filter(Boolean);
    if (users.length <= 1) {
      // 只有自己在，直接清
      board.strokes = [];
      boardUndone = {};
      saveBoardSoon();
      io.to('__board__').emit('board_clear');
      console.log('[白板] ' + name + ' 清空（无人在线）');
      return;
    }
    // 发起投票
    boardClearVote = {
      id: crypto.randomBytes(4).toString('hex'),
      initiator: name,
      initiatorId: socket.id,
      agree: [socket.id],  // 发起者自动同意
      disagree: [],
      total: users.length,
      startTime: Date.now(),
    };
    io.to('__board__').emit('board_clear_vote', {
      voteId: boardClearVote.id,
      initiator: name,
      total: users.length,
    });
    console.log('[白板] ' + name + ' 发起清空投票，需要 ' + users.length + ' 人同意');

    // 5 分钟超时，过期自动取消
    const voteId = boardClearVote.id;
    setTimeout(() => {
      if (boardClearVote && boardClearVote.id === voteId) {
        boardClearVote = null;
        io.to('__board__').emit('board_toast', { msg: '清空投票超时，已取消' });
        console.log('[白板] 清空投票超时，已取消');
      }
    }, 5 * 60 * 1000);
  });

  // 投票
  socket.on('board_clear_vote', ({ voteId, agree }) => {
    if (!boardClearVote || boardClearVote.id !== voteId) return;
    if (agree) {
      if (!boardClearVote.agree.includes(socket.id)) boardClearVote.agree.push(socket.id);
    } else {
      if (!boardClearVote.disagree.includes(socket.id)) boardClearVote.disagree.push(socket.id);
    }
    // 广播最新投票状态
    io.to('__board__').emit('board_clear_vote_update', {
      agree: boardClearVote.agree.length,
      total: boardClearVote.total,
    });
    // 判定
    if (boardClearVote.disagree.length > 0) {
      io.to('__board__').emit('board_toast', { msg: name + ' 拒绝了清空' });
      boardClearVote = null;
      return;
    }
    if (boardClearVote.agree.length >= boardClearVote.total) {
      board.strokes = [];
      boardUndone = {};
      saveBoardSoon();
      io.to('__board__').emit('board_clear');
      io.to('__board__').emit('board_toast', { msg: '清空完成' });
      console.log('[白板] 所有人同意，已清空');
      boardClearVote = null;
    }
  });

  // 掷骰子
  });

  console.log('[白板] 共享白板模块已挂载');
};
