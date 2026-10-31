(function() {
  // 注入 UI 样式
  const style = document.createElement('style');
  style.innerHTML = `
    .invite-btn { position: fixed; top: 20px; right: 20px; z-index: 9999; background: #e67e22; color: #fff; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 15px rgba(230,126,34,0.4); font-family: sans-serif;}
    .invite-btn:active { transform: scale(0.95); }
    #invite-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: none; align-items: center; justify-content: center; z-index: 10000; font-family: sans-serif; }
    .invite-box { background: #fff; border-radius: 12px; padding: 20px; width: 90%; max-width: 300px; color: #333; }
    .invite-box h3 { margin-bottom: 15px; font-size: 16px; }
    .invite-list { list-style: none; max-height: 200px; overflow-y: auto; margin-bottom: 15px; border: 1px solid #eee; border-radius: 6px; }
    .invite-list li { padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; justify-content: space-between; }
    .invite-list li:hover { background: #f0f0f0; }
    .invite-close { width: 100%; padding: 10px; background: #ccc; border: none; border-radius: 6px; cursor: pointer; }
  `;
  document.head.appendChild(style);

  // 注入 HTML
  const btn = document.createElement('button');
  btn.className = 'invite-btn';
  btn.innerText = '🔗 邀请好友';
  document.body.appendChild(btn);

  const modal = document.createElement('div');
  modal.id = 'invite-modal';
  modal.innerHTML = `
    <div class="invite-box">
      <h3>选择要邀请的在线好友</h3>
      <ul class="invite-list" id="invite-list-ul">
        <li>正在获取在线名单...</li>
      </ul>
      <button class="invite-close" onclick="document.getElementById('invite-modal').style.display='none'">取消</button>
    </div>
  `;
  document.body.appendChild(modal);

  // 获取当前游戏名称
  const gameName = document.title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  const gameUrl = window.location.pathname;

  let socket = null;
  // 等待 socket 初始化（兼容不同页面的变量名）
  setInterval(() => {
    if (window.socket && !socket) {
      socket = window.socket;
      socket.on('invite_online_list', (list) => {
        const ul = document.getElementById('invite-list-ul');
        if (list.length === 0) {
          ul.innerHTML = '<li>现在没有其他人上线哦</li>';
          return;
        }
        ul.innerHTML = list.map(u => `<li onclick="__sendInvite('${u}')"><span>${u}</span><span style="color:#e67e22;">发送邀请 →</span></li>`).join('');
      });
    }
  }, 500);

  btn.onclick = () => {
    if (!socket) return alert('还没连接上服务器，请稍候');
    modal.style.display = 'flex';
    socket.emit('invite_get_online');
  };

  window.__sendInvite = (target) => {
    if (!socket) return;
    socket.emit('invite_send', { targetName: target, gameName: gameName, gameUrl: gameUrl });
    modal.style.display = 'none';
  };
})();
