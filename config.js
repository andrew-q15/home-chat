// ============ 所有配置集中在这里 ============
require('./atomic-fs'); // .json 写入统一走原子替换，防撕裂与并发覆盖
module.exports = {
  // ---- 双 AI ----
  AI1: {
    name: 'AI-1',
    // Mac 本机 LM Studio，走 localhost 最快
    url: 'http://localhost:1234/v1/chat/completions',
    model: 'qwen/qwen3.5-9b',   // 换成你 Mac 上实际模型 ID
  },
  AI2: {
    name: 'AI-2',
    // Windows 上的 LM Studio
    url: 'http://192.168.1.254:1235/v1/chat/completions',
    model: 'prism-ml/bonsai-27b',
  },

  // ---- AI 行为参数 ----
  AI: {
    tokensCheck: 600,
    tokensChat: 400,
    delayBetween: 800,
    fetchTimeout: 90000,
    maxRounds: 5,
    triggerEvery: 3,
  },

  // ---- 硬件设备 API ----
  DEVICE_API_KEY: process.env.DEVICE_API_KEY || '',

  // ---- Tailscale 外网访问 ----
  // 到 https://login.tailscale.com/settings/keys 生成一个 API Access Token（选 Write 权限）
  // 已从仓库移除！请吊销旧 key，改用环境变量 TS_API_TOKEN 注入后重启。
  TS_API_TOKEN: process.env.TS_API_TOKEN || '',
};
