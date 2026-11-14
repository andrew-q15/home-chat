// 首页入口注入器：不依赖 index.html 后半段结构，运行时探测，双兜底，找不到就静默跳过
(function () {
  function mount() {
    if (document.getElementById('dg-entry-btn') || document.getElementById('dg-entry-link')) return;
    var bar = document.getElementById('input-bar');
    if (bar) {
      var btn = document.createElement('button');
      btn.id = 'dg-entry-btn';
      btn.type = 'button';
      btn.className = 'tool';                 // 沿用 index.html 现成的 #input-bar button.tool 样式
      btn.textContent = '🎨 你画我猜';
      btn.title = '去你画我猜擂台';
      btn.onclick = function () { location.href = '/drawguess.html'; };
      bar.appendChild(btn);
      return;
    }
    var side = document.getElementById('sidebar-scroll-area') || document.getElementById('sidebar');
    if (side) {
      var a = document.createElement('a');
      a.id = 'dg-entry-link';
      a.href = '/drawguess.html';
      a.textContent = '🎨 你画我猜擂台';
      a.style.cssText = 'display:block;margin:8px 0;padding:6px 8px;border-radius:6px;background:#3a3a3a;color:#ffd54f;text-decoration:none;font-size:13px;';
      side.appendChild(a);
    }
    // 两处都没有：不报错、不白屏，等老板给 index.html 全文再精挂
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
