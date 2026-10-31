const config = require('./config');
const CHAT_SERVER = 'http://localhost:3000';
const DEVICE_KEY = config.DEVICE_API_KEY;

const LAT = 34.34;
const LON = 108.94;

async function getPoem() {
  try {
    const res = await fetch('https://v2.jinrishici.com/one.json');
    const data = await res.json();
    return data && data.data ? data.data.content : '';
  } catch { return ''; }
}

async function getWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&current=temperature_2m,weather_code&timezone=Asia/Shanghai&forecast_days=1';
    const res = await fetch(url);
    return await res.json();
  } catch { return null; }
}

function weatherText(code, lang) {
  const zh = {0:'晴',1:'晴',2:'多云',3:'阴',45:'雾',61:'小雨',63:'雨',80:'阵雨',95:'雷雨'};
  const en = {0:'Clear',1:'Clear',2:'Cloudy',3:'Overcast',45:'Fog',61:'Light Rain',63:'Rain',80:'Showers',95:'Thunderstorm'};
  const m = (lang === 'en') ? en : zh;
  return m[code] || (lang === 'en' ? 'Unknown' : '未知');
}

async function generateReport(lang) {
  const now = new Date();
  const dateStr = now.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', weekday: 'long' });
  const poem = await getPoem();
  const weather = await getWeather();
  
  let wLine = '';
  if (weather && weather.current) {
    const cur = weather.current.temperature_2m;
    wLine = (lang === 'en') ? ('Today: ' + weatherText(weather.current.weather_code, 'en') + ', ' + cur + '°C') : ('天气：' + weatherText(weather.current.weather_code, 'zh') + '，' + cur + '°C');
  }

  // 橘域网天气彩蛋
  const netWeather = ['今日橘域网天气：局部有橘子雨，出门记得带袋子。','今日橘域网天气：股市多云转晴，适合抄底。','今日橘域网天气：情报局雷阵雨，建议少发灌水。','今日橘域网天气：火锅区高温预警，注意烫嘴。','今日橘域网天气：风平浪静，适合摸鱼。'][Math.floor(Math.random()*5)];

  let prompt = '';
  if (lang === 'zh') {
    prompt = '今天是 ' + dateStr + '。写一句温暖的问候，一句鼓励，加今日诗词：' + poem + '。' + wLine + '。总字数不超过 80 字。' + ' ' + netWeather;
  } else {
    prompt = 'Today is ' + dateStr + '. Write a warm English morning greeting, a short English motivational quote, and weather: ' + wLine + '. Keep it under 50 words. Only output English.';
  }

  try {
    const res = await fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.AI1.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7, max_tokens: 200,
        chat_template_kwargs: { enable_thinking: false }
      }),
    });
    if (!res.ok) throw new Error('AI offline');
    const data = await res.json();
    let text = data.choices[0].message.content.trim();
    const idx = text.indexOf('</think');
    if (idx !== -1) text = text.slice(0, idx).trim();
    return text;
  } catch (err) {
    if (lang === 'zh') {
      return '早安！新的一天开始了，保持热爱，奔赴山海。今日诗词：' + (poem || '长风破浪会有时。') + ' ' + wLine;
    } else {
      return 'Good morning! Every day is a fresh start. Believe in yourself and make today amazing. ' + wLine;
    }
  }
}

async function sendReport(lang) {
  try {
    const res = await fetch(CHAT_SERVER + '/api/device/channels?key=' + DEVICE_KEY);
    const data = await res.json();
    if (!data.ok || !data.channels) return;
    
    const text = await generateReport(lang);
    if (!text) return;
    const sender = (lang === 'en') ? 'AI-1 (EN)' : 'AI-1 早报';

    for (const ch of data.channels) {
      await fetch(CHAT_SERVER + '/api/device/say', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: DEVICE_KEY, channel: ch, name: sender, text: text }),
      });
    }
    console.log('[' + new Date().toLocaleTimeString() + '] ' + lang + ' 早报发送完成');
  } catch (err) {
    console.error('发送失败:', err.message);
  }
}

let lastZh = null;
let lastEn = null;

setInterval(() => {
  const now = new Date();
  const today = now.toDateString();
  if (now.getHours() === 7 && now.getMinutes() === 0 && lastZh !== today) {
    lastZh = today; sendReport('zh');
  }
  if (now.getHours() === 7 && now.getMinutes() === 30 && lastEn !== today) {
    lastEn = today; sendReport('en');
  }
}, 30 * 1000);

console.log('双语早报已启动！');
// 启动即发已禁用（避免 pm2 重启刷屏），只按 7:30 定时发
// setTimeout(() => { sendReport('en'); }, 2000);
