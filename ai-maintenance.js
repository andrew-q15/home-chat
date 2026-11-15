'use strict';
// 全局 AI 维护开关：默认停用；仅当 AI_MAINTENANCE=0 时恢复。
// 停用期间不发起任何外部模型请求，AI 类接口统一返回「维护中，暂不开放」。
const OFF = process.env.AI_MAINTENANCE !== '0';
const MSG = '维护中，暂不开放';

// 纯 AI 入口；不含 /api/verify、/api/drawguess/state、/api/vault 等
const RE = /^\/api\/(vision|ai\b|chat\/completions|completions|morning-report|intel\/ai)/i;

function guard(req, res, next) {
  if (!OFF || !RE.test(req.path)) return next();
  // 未带凭证时放行给原鉴权，保住 security-check 的 401 语义
  if (!req.headers.authorization) return next();
  res.status(503).json({ ok: false, maintenance: true, msg: MSG });
}

module.exports = { OFF, MSG, guard };
