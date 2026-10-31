// ============ 投票/红包/打赏 ============
const crypto = require('crypto');

module.exports = function setupPoll(io, ctx) {
  const { tokens, state, saveState, getBalance, saveLobster, lobsterData, pushMessage, addOrangeLog, pinnedMessages, ensureChannel, nameToSockets, broadcastToUser, channelsFor, broadcastChannels } = ctx;

  function debtLocked(userId) {
    return getBalance(userId).oranges < 0;
  }

  io.on('connection', (socket) => {
    const name = socket.data.name;
    if (!name) return;
  // ============ 投票 ============
  socket.on('poll_create', ({ question, options, multi }) => {
    const channel = socket.data.channel;
    if (!channel) return;
    const user = state.users[name];
    if (user && user.mutedUntil && user.mutedUntil > Date.now()) {
      socket.emit('error_msg', '你被禁言了');
      return;
    }
    const q = String(question || '').trim();
    if (!q || q.length > 100) return socket.emit('error_msg', '问题长度 1-100');
    if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
      return socket.emit('error_msg', '需要 2-10 个选项');
    }
    const opts = options.map(o => String(o || '').trim()).filter(Boolean);
    if (opts.length < 2) return socket.emit('error_msg', '至少 2 个非空选项');

    const poll = {
      question: q,
      options: opts.map((text, i) => ({ id: 'o' + (i + 1), text: text })),
      votes: {},
      multi: !!multi,
      closed: false,
      creator: name,
      creatorId: user ? user.id : null,
      time: Date.now(),
    };
    poll.options.forEach(o => poll.votes[o.id] = []);

    pushMessage(channel, name, '', {
      kind: 'user',
      type: 'poll',
      poll: poll,
    });
    console.log('[投票] ' + name + ' 发起：' + q);
  });

  socket.on('poll_vote', ({ messageId, optionId }) => {
    const channel = socket.data.channel;
    if (!channel || !messageId || !optionId) return;
    const list = state.histories[channel];
    const msg = list.find(m => m.id === messageId);
    if (!msg || msg.type !== 'poll' || !msg.poll) return;
    if (msg.poll.closed) return socket.emit('error_msg', '投票已结束');

    const user = state.users[name];
    if (!user) return;
    const myId = user.id;

    const poll = msg.poll;
    if (!poll.votes[optionId]) poll.votes[optionId] = [];

    const alreadyVoted = poll.votes[optionId].indexOf(myId) !== -1;
    if (alreadyVoted) {
      // 取消
      poll.votes[optionId] = poll.votes[optionId].filter(x => x !== myId);
    } else {
      // 单选：先把自己从别的选项删掉
      if (!poll.multi) {
        for (const oid in poll.votes) {
          poll.votes[oid] = poll.votes[oid].filter(x => x !== myId);
        }
      }
      poll.votes[optionId].push(myId);
    }

    saveState();
    io.to(channel).emit('poll_updated', { messageId: messageId, poll: poll });
  });

  socket.on('poll_close', ({ messageId }) => {
    const channel = socket.data.channel;
    if (!channel || !messageId) return;
    const list = state.histories[channel];
    const msg = list.find(m => m.id === messageId);
    if (!msg || msg.type !== 'poll' || !msg.poll) return;

    const user = state.users[name];
    const isCreator = (msg.poll.creator === name);
    const isAdmin = !!(user && user.isAdmin);
    if (!isCreator && !isAdmin) return socket.emit('error_msg', '只有发起人或管理员能结束');

    msg.poll.closed = true;
    saveState();
    io.to(channel).emit('poll_updated', { messageId: messageId, poll: msg.poll });
    console.log('[投票] ' + name + ' 结束了：' + msg.poll.question);
  });

  // 置顶消息
  socket.on('pin_message', ({ messageId }) => {
    const channel = socket.data.channel;
    if (!channel) return;
    if (!pinnedMessages[channel]) pinnedMessages[channel] = [];
    if (pinnedMessages[channel].includes(messageId)) return;
    
    pinnedMessages[channel].unshift(messageId);
    if (pinnedMessages[channel].length > 3) {
      pinnedMessages[channel] = pinnedMessages[channel].slice(0, 3);
    }
    state.pinnedMessages = pinnedMessages;
    saveState();
    io.to(channel).emit('pinned_updated', { channel, pinned: pinnedMessages[channel] });
  });

  socket.on('unpin_message', ({ messageId }) => {
    const channel = socket.data.channel;
    if (!channel || !pinnedMessages[channel]) return;
    const idx = pinnedMessages[channel].indexOf(messageId);
    if (idx === -1) return;
    pinnedMessages[channel].splice(idx, 1);
    state.pinnedMessages = pinnedMessages;
    saveState();
    io.to(channel).emit('pinned_updated', { channel, pinned: pinnedMessages[channel] });
  });

  // 转发消息
  socket.on('forward_message', ({ messageId, targetChannel }) => {
    const channel = socket.data.channel;
    if (!channel || !targetChannel || !messageId) return;
    if (!ensureChannel(targetChannel)) {
      socket.emit('error_msg', '目标频道不存在');
      return;
    }

    const originalMsg = state.histories[channel].find(m => m.id === messageId);
    if (!originalMsg) return socket.emit('error_msg', '原消息已不存在');

    const fwdMsg = Object.assign({}, originalMsg);
    fwdMsg.id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    fwdMsg.channel = targetChannel;
    fwdMsg.name = name;
    fwdMsg.userId = state.users[name]?.id;
    fwdMsg.time = Date.now();
    fwdMsg.type = originalMsg.type === 'text' ? 'forward' : originalMsg.type;
    fwdMsg.forwardedFrom = { name: originalMsg.name, channel: channel };
    fwdMsg.reactions = {};
    fwdMsg.replyTo = null; // 不转发引用
    
    state.histories[targetChannel].push(fwdMsg);
    if (state.histories[targetChannel].length > 2000) state.histories[targetChannel].shift();
    saveState();
    
    io.to(targetChannel).emit('message', fwdMsg);
    socket.emit('system', '已转发到 #' + targetChannel);
  });

  // 发红包
  socket.on('send_red_packet', ({ total, count }) => {
    const channel = socket.data.channel;
    if (!channel) return;
    const user = state.users[name];
    if (debtLocked(user.id)) return socket.emit('error_msg', '欠账中，先还清债务再发红包');
    const bal = getBalance(user.id);
    
    const t = Math.floor(Number(total));
    const c = Math.floor(Number(count));
    if (isNaN(t) || t <= 0 || isNaN(c) || c <= 0) return socket.emit('error_msg', '参数错误');
    if (c > 100) return socket.emit('error_msg', '一次最多发 100 个');
    if (bal.oranges < t) return socket.emit('error_msg', '橘子不足');
    
    bal.oranges -= t;
    saveLobster(lobsterData);
    
    pushMessage(channel, name, '', {
      kind: 'user', type: 'red_packet',
      redPacket: {
        total: t,
        count: c,
        remaining: t,
        remainCount: c,
        claims: [], // { user, amount }
        sender: name,
        senderId: user.id
      }
    });
  });

  // 抢红包
  socket.on('grab_red_packet', ({ messageId }) => {
    const channel = socket.data.channel;
    if (!channel || !messageId) return;
    const msg = state.histories[channel].find(m => m.id === messageId);
    if (!msg || msg.type !== 'red_packet' || !msg.redPacket) return;
    
    const rp = msg.redPacket;
    if (rp.remainCount <= 0) return socket.emit('error_msg', '手慢了，红包派完了');
    if (rp.claims.some(c => c.user === name)) return socket.emit('error_msg', '你已经抢过啦');
    
    // 二倍均值法计算金额
    let amount = 0;
    if (rp.remainCount === 1) {
      amount = rp.remaining;
    } else {
      const max = Math.floor((rp.remaining / rp.remainCount) * 2);
      amount = Math.floor(Math.random() * (max - 1)) + 1;
      // 兜底保证其他人至少能抢到 1
      if (rp.remaining - amount < rp.remainCount - 1) {
        amount = rp.remaining - (rp.remainCount - 1);
      }
    }
    
    rp.remaining -= amount;
    rp.remainCount--;
    
    const user = state.users[name];
    rp.claims.push({ user: name, amount: amount });
    const bal = getBalance(user.id);
    bal.oranges += amount;
    saveLobster(lobsterData);
    
    saveState(); // 保存聊天记录里的红包状态
    io.to(channel).emit('red_packet_updated', { messageId, redPacket: rp });
    
    // 单独给抢到的人发消息更新余额
    socket.emit('balance_updated');
  });

  // 打赏消息
  socket.on('tip_message', ({ messageId, amount }) => {
    const channel = socket.data.channel;
    if (!channel || !messageId) return;
    const msg = state.histories[channel].find(m => m.id === messageId);
    if (!msg) return socket.emit('error_msg', '消息不存在');
    
    const a = Math.floor(Number(amount));
    if (isNaN(a) || a <= 0) return;
    
    const me = state.users[name];
    const target = state.users[msg.name];
    if (!me || !target) return;
    if (debtLocked(me.id)) return socket.emit('error_msg', '欠账中，先还清债务再打赏');
    if (me.id === target.id) return socket.emit('error_msg', '不能打赏自己');
    
    const myBal = getBalance(me.id);
    if (myBal.oranges < a) return socket.emit('error_msg', '橘子不足');
    
    myBal.oranges -= a;
    const targetBal = getBalance(target.id);
    targetBal.oranges += a;
    saveLobster(lobsterData);
    
    if (!msg.tips) msg.tips = [];
    msg.tips.push({ from: name, amount: a });
    saveState();
    
    io.to(channel).emit('message_updated', { messageId, tips: msg.tips });
    socket.emit('balance_updated');
    if (nameToSockets[msg.name]) {
      broadcastToUser(msg.name, 'balance_updated', null);
    }
    socket.emit('system', '打赏成功！');
  });

  });

  console.log('[投票] 投票/红包/打赏模块已挂载');
};
