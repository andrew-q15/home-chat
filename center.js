module.exports = function mountAllFeatures(app, io, ctx) {
  console.log('  🚀 正在启动中央功能挂载系统...');

  // 全局 AI 维护开关：默认停用，AI 类接口统一返回维护文案
  try { app.use(require('./ai-maintenance').guard); } catch (e) { console.error('[AI维护] 挂载失败:', e.message); }

  // 你画我猜擂台（实时画板 + 自定义题词审核 + 赏金结算）
  try {
    const setupDrawGuess = require('./drawguess-router');
    setupDrawGuess(app, ctx);
  } catch (e) { console.error('❌ [你画我猜擂台] 挂载失败:', e.message); }

  try {
    const setupStock = require('./stock-router');
    setupStock(app, ctx);
  } catch (e) { console.error('❌ [股市] 挂载失败:', e.message); }

  try {
    const setupApiHub = require('./api-hub-router');
    setupApiHub(app, ctx);
  } catch (e) { console.error('❌ [情报局API] 挂载失败:', e.message); }

  try {
    const setupVault = require('./vault-router');
    setupVault(app, ctx);
  } catch (e) { console.error('❌ [共享记忆库] 挂载失败:', e.message); }

  try {
    const setupDrop = require('./drop-router');
    setupDrop(app, ctx);
  } catch (e) { console.error('❌ [掉落] 挂载失败:', e.message); }

  try {
    const setupAchievement = require('./achievement-router');
    setupAchievement(app, ctx);
  } catch (e) { console.error('❌ [成就] 挂载失败:', e.message); }

  try {
    const setupQuiz = require('./quiz-router');
    setupQuiz(app, ctx);
  } catch (e) { console.error('❌ [每日一题] 挂载失败:', e.message); }

  try {
    const setupLotteryGame = require('./lottery-game-router');
    setupLotteryGame(app, ctx);
  } catch (e) { console.error('❌ [赛博彩票] 挂载失败:', e.message); }

  try {
    const setupWish = require('./wish-router');
    setupWish(app, ctx);
  } catch (e) { console.error('❌ [许愿池] 挂载失败:', e.message); }

  try {
    const setupLegacy = require('./legacy-features-router');
    setupLegacy(app, ctx);
  } catch (e) { console.error('❌ [补丁块] 挂载失败:', e.message); }

  try {
    const setupSticker = require('./sticker-router');
    setupSticker(app, ctx);
  } catch (e) { console.error('❌ [贴纸] 挂载失败:', e.message); }

  try {
    const setupList = require('./list-router');
    setupList(app, ctx);
  } catch (e) { console.error('❌ [清单] 挂载失败:', e.message); }

  try {
    const setupUpload = require('./upload-router');
    setupUpload(app, ctx);
  } catch (e) { console.error('❌ [上传] 挂载失败:', e.message); }

  try {
    const setupBoard = require('./board-router');
    setupBoard(io, ctx);
  } catch (e) { console.error('❌ [白板] 挂载失败:', e.message); }

  try {
    const setupPoll = require('./poll-router');
    setupPoll(io, ctx);
  } catch (e) { console.error('❌ [投票] 挂载失败:', e.message); }

  try {
    const setupWritings = require('./writings-router');
    setupWritings(app, ctx);
  } catch (e) { console.error('❌ [小说] 挂载失败:', e.message); }

  try {
    const setupAdmin = require('./admin-router');
    setupAdmin(app, ctx);
  } catch (e) { console.error('❌ [管理] 挂载失败:', e.message); }

  try {
    const setupHub = require('./hub-router');
    setupHub(app, ctx);
  } catch (e) { console.error('❌ [数据站] 挂载失败:', e.message); }

  try {
    const setupIntel = require('./intel-router');
    setupIntel(app, ctx);
  } catch (e) { console.error('❌ [情报局] 挂载失败:', e.message); }

  try {
    const setupKoi = require('./koi-router');
    setupKoi(app, ctx);
  } catch (e) { console.error('❌ [锦鲤] 挂载失败:', e.message); }

  try {
    const setupFortune = require('./fortune-router');
    setupFortune(app, ctx);
  } catch (e) { console.error('❌ [运势] 挂载失败:', e.message); }

  try {
    const setupProfile = require('./profile-router');
    setupProfile(app, ctx);
  } catch (e) { console.error('❌ [主页] 挂载失败:', e.message); }



  try {
    const setupSonar = require('./sonar-router');
    setupSonar(app, ctx);
  } catch (e) { console.error('❌ [声纳] 挂载失败:', e.message); }


  try {
    const setupPoke = require('./poke-router');
    setupPoke(app, ctx);
  } catch (e) { console.error('❌ [戳一戳] 挂载失败:', e.message); }

  try {
    const setupWall = require('./wall-router');
    setupWall(app, ctx);
  } catch (e) { console.error('❌ [留言墙] 挂载失败:', e.message); }

  try {
    const setupBottle = require('./bottle-router');
    setupBottle(app, ctx);
  } catch (e) { console.error('❌ [漂流瓶] 挂载失败:', e.message); }


  try {
    const setupCalendar = require('./calendar-router');
    setupCalendar(app, ctx);
  } catch (e) { console.error('❌ [日历] 挂载失败:', e.message); }

  try {
    const setupGroup = require('./group-router');
    setupGroup(app, ctx);
  } catch (e) { console.error('❌ [分组] 挂载失败:', e.message); }
  try {
    const setupStats = require('./stats-router');
    setupStats(app, Object.assign({ io }, ctx));
  } catch (e) { console.error('❌ [大屏] 挂载失败:', e.message); }
  try {
    const setupTreasury = require("./treasury-router");
    setupTreasury(app, ctx);
  } catch (e) { console.error("❌ [金库] 挂载失败:", e.message); }

  try {
    const setupAuction = require("./auction-router");
    setupAuction(app, ctx);
  } catch (e) { console.error("❌ [拍卖] 挂载失败:", e.message); }

  try {
    const setupGarden = require("./garden-router");
    setupGarden(app, ctx);
  } catch (e) { console.error("❌ [菜园] 挂载失败:", e.message); }

  try {
    const setupLoan = require("./loan-router");
    setupLoan(app, ctx);
  } catch (e) { console.error("❌ [贷款] 挂载失败:", e.message); }

  try {
    const setupNightAI = require("./night-ai-router");
    setupNightAI(app, ctx);
  } catch (e) { console.error("❌ [夜间AI] 挂载失败:", e.message); }

  try {
    const setupRadio = require("./radio-router");
    setupRadio(io, ctx);
  } catch (e) { console.error("❌ [电台] 挂载失败:", e.message); }

  // 📹 小湃摄像头 RTSP 流媒体服务
  try {
    const { app: cameraApp, server: cameraServer, CAMERA_CONFIG } = require('/Users/jianmingqu/home-chat/camera-rtsp/index');
    // 将摄像头路由挂载到主应用（注意：不要合并 server，避免端口冲突）
    Object.assign(app, cameraApp);
    console.log('  📹 [小湃摄像头] 已挂载');
  } catch (e) { 
    console.error('❌ [小湃摄像头] 挂载失败:', e.message); 
  }

};
