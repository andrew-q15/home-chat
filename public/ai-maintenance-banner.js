(function () {
  function mount() {
    if (document.getElementById('ai-maint-bar') || !document.body) return;
    var bar = document.createElement('div');
    bar.id = 'ai-maint-bar';
    bar.textContent = '🤖 AI 功能维护中，暂不开放';
    bar.style.cssText = 'position:fixed;left:50%;top:0;transform:translateX(-50%);z-index:9999;background:#3b2f26;color:#ffd54f;padding:6px 18px;border-radius:0 0 10px 10px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none;';
    document.body.appendChild(bar);
    setTimeout(function () { bar.style.transition = 'opacity .5s'; bar.style.opacity = '0'; }, 10000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
