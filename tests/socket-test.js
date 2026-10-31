// 聊天室功能自动化测试：两个用户 + 一个旁观者
const path = require('path');
const fs = require('fs');
const { io } = require('/Users/jianmingqu/home-chat/node_modules/socket.io-client');

const URL = 'http://localhost:3000';
const results = [];
function report(name, ok, extra) {
  results.push({ name, ok, extra });
  console.log((ok ? '✅' : '❌') + ' ' + name + (extra ? '  | ' + extra : ''));
}

function waitEvent(sock, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('等待 ' + event + ' 超时')), timeout);
    sock.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function register(username) {
  const res = await fetch(URL + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'test123' }),
  });
  let d = await res.json();
  if (!d.ok) { // 已存在则登录
    const r2 = await fetch(URL + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'test123' }),
    });
    d = await r2.json();
  }
  if (!d.ok) throw new Error('注册/登录失败: ' + JSON.stringify(d));
  return d.token;
}

async function main() {
  const tokens = {};
  for (const u of ['_t_a', '_t_b', '_t_c']) tokens[u] = await register(u);
  report('注册/登录 3 个测试账号', true);

  // 连接
  const A = io(URL, { auth: { token: tokens._t_a } });
  const B = io(URL, { auth: { token: tokens._t_b } });
  const C = io(URL, { auth: { token: tokens._t_c } });
  // 连接后立刻挂监听，避免漏掉连接瞬间的事件
  const chansA_P = new Promise(r => A.once('channels', r));
  const chansC_P = new Promise(r => C.once('channels', r));
  await Promise.all([waitEvent(A, 'connect'), waitEvent(B, 'connect'), waitEvent(C, 'connect')]);
  report('Socket 三方连接', true);

  const chansA = await chansA_P;
  const chansC = await chansC_P;
  report('连接后收到频道列表', Array.isArray(chansA) && chansA.length > 0, JSON.stringify(chansA));
  const dmCount0 = chansC.filter(c => c.startsWith('DM:')).length;
  report('旁观者 C 看不到私聊频道（初始）', dmCount0 === 0);

  // ---- 私聊 ----
  const dmP = waitEvent(A, 'dm_opened');
  A.emit('open_dm', { target: '_t_b' });
  const dm = await dmP;
  report('open_dm 返回 dm_opened', dm.channel.startsWith('DM:'), dm.channel);

  const chansB2 = await waitEvent(B, 'channels');
  report('B 的列表里出现私聊频道', chansB2.includes(dm.channel));
  const chansC2 = await waitEvent(C, 'channels');
  report('C 仍然看不到私聊频道', !chansC2.includes(dm.channel));

  // A、B 都点进私聊（模拟点击侧栏），B 应收到
  A.emit('join', { channel: dm.channel });
  await waitEvent(A, 'history');
  B.emit('join', { channel: dm.channel });
  await waitEvent(B, 'history');

  // ---- 橘子经济：新用户 0 橘子，超管发放（发命令前必须先进频道）----
  const cBal0 = await (await fetch(URL + '/api/lobster/balance', { headers: { Authorization: tokens._t_c } })).json();
  report('新用户 0 橘子', cBal0.oranges === 0, 'oranges=' + cBal0.oranges);
  const lbMeta = JSON.parse(fs.readFileSync('/Users/jianmingqu/home-chat/lobster.json', 'utf8'));
  A.emit('message', '/admin2 ' + lbMeta.superAdminSecret);
  await waitEvent(A, 'system');
  A.emit('message', '/addorange _t_a 100');
  await waitEvent(A, 'system');
  A.emit('message', '/addorange _t_b 200');
  await waitEvent(A, 'system');
  const msgP = waitEvent(B, 'message');
  A.emit('message', '私聊你好');
  const got = await msgP;
  report('私聊消息 A→B 实时送达', got.text === '私聊你好' && got.channel === dm.channel, got.text);

  // C 偷进私聊应被拒
  C.emit('join', { channel: dm.channel });
  const cErr = await waitEvent(C, 'error_msg');
  report('C 加入私聊被拒绝', cErr.includes('私聊'), cErr);

  // ---- 语音消息 ----
  A.emit('audio_message', { url: '/uploads/test-fake.webm', duration: 3.5 });
  const audioMsg = await waitEvent(B, 'message');
  report('语音消息送达', audioMsg.type === 'audio' && audioMsg.duration === 3.5, 'duration=' + audioMsg.duration);

  // ---- 记忆命令 ----
  A.emit('message', '/remember 测试员甲喜欢苹果');
  const memReply = await waitEvent(A, 'system');
  report('/remember 写入记忆', memReply.includes('记住'), memReply);
  await sleep(300);
  const memFile = JSON.parse(fs.readFileSync('/Users/jianmingqu/home-chat/memory.json', 'utf8'));
  const found = memFile.some(m => m.text.includes('苹果'));
  report('memory.json 里出现记忆条目', found);

  A.emit('message', '/memory');
  const memList = await waitEvent(A, 'system');
  report('/memory 列出记忆', memList.includes('苹果'), memList.slice(0, 60));

  // ---- AI 记忆链路（真实调用 LM Studio，@ai 提问；在测试频道里做，不污染真实频道）----
  const testCh = '_测试频道x';
  if (!chansA.includes(testCh)) {
    A.emit('create_channel', testCh);
    await waitEvent(A, 'channels');
  }
  A.emit('join', { channel: testCh });
  await waitEvent(A, 'history');
  B.emit('join', { channel: testCh });
  await waitEvent(B, 'history');
  B.emit('message', '@ai 你好，请问测试员甲喜欢什么水果？');
  let aiOk = false, aiText = '';
  try {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && !aiOk) {
      const m = await waitEvent(B, 'message', Math.max(1000, deadline - Date.now()));
      if (m.kind === 'ai') { aiOk = true; aiText = m.text; }
    }
  } catch (e) { aiOk = false; }
  report('AI 回答（记忆链路）', aiOk, aiText);
  report('AI 用上了记忆（提到苹果）', aiText.includes('苹果'), aiText);

  // ---- 回归：骰子 / 表情反应 / 撤回 ----
  A.emit('dice_message', { sides: 20, result: 7 });
  const diceMsg = await waitEvent(B, 'message');
  report('骰子回归', diceMsg.type === 'dice' && diceMsg.dice.result === 7);

  const textP = waitEvent(B, 'message');
  A.emit('message', '回归测试消息');
  const reg = await textP;
  A.emit('toggle_reaction', { messageId: reg.id, emoji: '👍' });
  const re = await waitEvent(B, 'reaction_update');
  report('表情反应回归', re.reactions['👍'] && re.reactions['👍'].includes('_t_a'));

  A.emit('delete_message', { messageId: reg.id });
  const del = await waitEvent(B, 'message_deleted');
  report('撤回回归', del.messageId === reg.id);

  // ---- 创建频道回归 ----
  if (!chansA.includes('_回归频道y')) {
    const chP = waitEvent(A, 'channels');
    A.emit('create_channel', '_回归频道y');
    const chList = await chP;
    report('创建频道回归', chList.includes('_回归频道y'));
  } else report('创建频道回归', true, '上一轮已创建');

  // ---- 拉黑 ----
  const blkP = waitEvent(A, 'blocked_list');
  A.emit('block_user', { target: '_t_b' });
  const blkList = await blkP;
  report('A 拉黑 B', blkList.includes('_t_b'));

  B.emit('open_dm', { target: '_t_a' });
  const bErr2 = await waitEvent(B, 'error_msg');
  report('被拉黑方开私聊被拒', bErr2.includes('拉黑'), bErr2);

  B.emit('join', { channel: dm.channel });
  await waitEvent(B, 'history');
  B.emit('message', '拉黑后还想说话');
  const bErr3 = await waitEvent(B, 'error_msg');
  report('拉黑后私聊发消息被拦', bErr3.includes('拉黑'), bErr3);

  // ---- 删除私聊 ----
  const delChP = waitEvent(B, 'channel_deleted');
  A.emit('delete_channel', dm.channel);
  const delCh = await delChP;
  report('B 收到私聊被删事件', delCh === dm.channel);
  const chansA3 = await waitEvent(A, 'channels');
  report('A 的列表里私聊已消失', !chansA3.includes(dm.channel));

  // ---- 跳蚤市场 ----
  var balA0 = 0;
  {
    const r = await fetch(URL + '/api/lobster/balance', { headers: { Authorization: tokens._t_a } });
    balA0 = (await r.json()).oranges;
  }
  const pubRes = await fetch(URL + '/api/market', {
    method: 'POST',
    headers: { Authorization: tokens._t_a, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '测试二手书', desc: '九成新', price: 50 }),
  });
  const pub = await pubRes.json();
  report('A 上架商品', pub.ok && pub.item.price === 50);

  const listRes = await fetch(URL + '/api/market', { headers: { Authorization: tokens._t_b } });
  const marketData = await listRes.json();
  const theItem = (marketData.listings || []).find(i => i.id === pub.item.id);
  report('B 能看到商品', !!theItem && theItem.sellerName === '_t_a');

  const ownRes = await fetch(URL + '/api/market/' + pub.item.id + '/buy', {
    method: 'POST', headers: { Authorization: tokens._t_a },
  });
  const ownData = await ownRes.json();
  report('A 不能买自己的', !ownData.ok, ownData.msg);

  const buyRes = await fetch(URL + '/api/market/' + pub.item.id + '/buy', {
    method: 'POST', headers: { Authorization: tokens._t_b },
  });
  const buyData = await buyRes.json();
  report('B 购买成功且建立私聊', buyData.ok && buyData.dmChannel.startsWith('DM:'), buyData.dmChannel);

  const balA1 = await (await fetch(URL + '/api/lobster/balance', { headers: { Authorization: tokens._t_a } })).json();
  report('卖家 A 收到橘子', balA1.oranges === balA0 + 50, balA0 + ' → ' + balA1.oranges);

  B.emit('join', { channel: buyData.dmChannel });
  const dmHist = await waitEvent(B, 'history');
  const notice = dmHist.find(m => m.text && m.text.includes('购买了你的'));
  report('私聊里有成交通知', !!notice, notice && notice.text.slice(0, 50));

  const buy2 = await (await fetch(URL + '/api/market/' + pub.item.id + '/buy', {
    method: 'POST', headers: { Authorization: tokens._t_c },
  })).json();
  report('已售商品不能重复买', !buy2.ok, buy2.msg);

  const listAfter = await (await fetch(URL + '/api/market', { headers: { Authorization: tokens._t_c } })).json();
  report('已售商品从货架消失', !(listAfter.listings || []).some(i => i.id === pub.item.id));

  // ---- 打赏开发者 ----
  const tipInfo0 = await (await fetch(URL + '/api/market/tip-info', { headers: { Authorization: tokens._t_b } })).json();
  report('打赏信息可查', tipInfo0.ok && tipInfo0.available, '开发者=' + tipInfo0.developer);
  const tipRes = await fetch(URL + '/api/market/tip', {
    method: 'POST',
    headers: { Authorization: tokens._t_b, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 100 }),
  });
  const tipData = await tipRes.json();
  report('打赏成功并扣款', tipData.ok, '余额 ' + tipData.oranges);
  const tipInfo1 = await (await fetch(URL + '/api/market/tip-info', { headers: { Authorization: tokens._t_b } })).json();
  report('累计打赏入账', tipInfo1.total === tipInfo0.total + 100, tipInfo0.total + ' → ' + tipInfo1.total);

  // ---- 余额上限 ----
  A.emit('message', '/setorange _t_c 9999999');
  await waitEvent(A, 'system');
  const cBalCap = await (await fetch(URL + '/api/lobster/balance', { headers: { Authorization: tokens._t_c } })).json();
  report('余额上限生效（100万封顶）', cBalCap.oranges === 1000000, 'oranges=' + cBalCap.oranges);

  // ---- 借橘子：0 橘子也能跑，自动欠账无利息 ----
  A.emit('message', '/setorange _t_c 0');
  await waitEvent(A, 'system');
  const runRes = await (await fetch(URL + '/api/lobster/run', {
    method: 'POST',
    headers: { Authorization: tokens._t_c, 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: '只回复两个字：收到' }),
  })).json();
  report('0 橘子也能发任务（借橘子）', runRes.ok, runRes.msg || '');
  if (runRes.ok) {
    const deadline = Date.now() + 120000;
    let done = null;
    while (Date.now() < deadline) {
      const tr = await (await fetch(URL + '/api/lobster/task/' + runRes.taskId, { headers: { Authorization: tokens._t_c } })).json();
      if (tr.ok && (tr.status === 'done' || tr.status === 'error')) { done = tr; break; }
      await new Promise(r => setTimeout(r, 1500));
    }
    const cBal1 = await (await fetch(URL + '/api/lobster/balance', { headers: { Authorization: tokens._t_c } })).json();
    report('消耗超过余额自动欠账', done && cBal1.oranges < 0,
      done ? (done.tokens + ' token = ' + (done.result && done.result.charged) + ' 🍊，现在 ' + cBal1.oranges + ' 🍊') : '任务超时');
  }

  // ---- 取消拉黑 ----
  A.emit('unblock_user', { target: '_t_b' });
  const blkList2 = await waitEvent(A, 'blocked_list');
  report('取消拉黑', !blkList2.includes('_t_b'));

  A.disconnect(); B.disconnect(); C.disconnect();
  const pass = results.filter(r => r.ok).length;
  console.log('\n===== 结果: ' + pass + '/' + results.length + ' 通过 =====');
  process.exit(0);
}

main().catch(e => { console.error('测试脚本崩溃:', e); process.exit(1); });
