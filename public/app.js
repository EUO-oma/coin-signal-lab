const el = (id) => document.getElementById(id);
let autoTimer = null;
let tickTimer = null;
let priceTimer = null;
let leftSec = 30;

const DEFAULT_SETTINGS = {
  symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  tf: '1h',
  intervalSec: 1,
  autoRefresh: true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem('coinSignalSettings');
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed };

    // legacy migration: old default(10/30s) -> new default(1s)
    if (!merged.intervalCustomized && (merged.intervalSec === 10 || merged.intervalSec === 30)) {
      merged.intervalSec = 1;
      localStorage.setItem('coinSignalSettings', JSON.stringify(merged));
    }

    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  localStorage.setItem('coinSignalSettings', JSON.stringify(s));
}

function ema(values, period) {
  const k = 2 / (period + 1);
  let prev = values[0];
  const out = [prev];
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses += Math.abs(d);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? Math.abs(d) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcMACD(closes) {
  if (closes.length < 35) return null;
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const signal = ema(macdLine, 9);
  const last = macdLine.length - 1;
  return { macd: macdLine[last], signal: signal[last], hist: macdLine[last] - signal[last] };
}

function scenario(score) {
  let up = 33 + score * 6;
  let down = 33 - score * 6;
  let flat = 100 - up - down;
  if (flat < 5) flat = 5;
  const sum = up + flat + down;
  up = Math.round((up / sum) * 100);
  flat = Math.round((flat / sum) * 100);
  down = 100 - up - flat;
  return { up, flat, down };
}

function computeScore(rsi, macd) {
  let score = 0;
  if (rsi != null) {
    if (rsi < 30) score += 1.2;
    else if (rsi > 70) score -= 1.2;
  }
  if (macd) {
    if (macd.macd > macd.signal) score += 1;
    else score -= 1;
    if (macd.hist > 0) score += 0.4;
    else score -= 0.4;
  }
  return Math.max(-3, Math.min(3, score));
}

function moodFromScore(score) {
  if (score >= 1.8) return '🚀 강한 상승 모드';
  if (score >= 0.6) return '📈 완만한 상승 모드';
  if (score <= -1.8) return '🧊 강한 하락 모드';
  if (score <= -0.6) return '📉 약한 하락 모드';
  return '😐 관망 모드';
}

function drawSparklineOn(canvasId, closes) {
  const canvas = el(canvasId);
  if (!canvas || !closes?.length || closes.length < 2) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const pad = 12;
  const range = max - min || 1;

  ctx.strokeStyle = '#2a3b6f';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = pad + ((h - pad * 2) * i) / 4;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = closes[closes.length - 1] >= closes[0] ? '#4cd08a' : '#ef5a7b';
  ctx.beginPath();
  closes.forEach((v, i) => {
    const x = pad + (i / (closes.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawAllSparks(closes) {
  drawSparklineOn('spark30', closes.slice(-30));
  drawSparklineOn('spark120', closes.slice(-120));
  drawSparklineOn('spark250', closes.slice(-250));
}

function briefLine(symbol, rsi, macd, score) {
  const lines = [
    `${symbol} 현재 신호는 ${score > 0 ? '롱 우세' : score < 0 ? '숏 우세' : '중립'}.` ,
    `RSI ${rsi?.toFixed?.(1) ?? '-'} / MACD 히스토그램 ${macd ? (macd.hist > 0 ? '양수' : '음수') : '-'}.`,
    score > 0 ? '모멘텀은 살아있지만, 과열 구간 진입 여부를 체크해.' : score < 0 ? '반등 시도보다 추세 확인이 먼저야.' : '방향성 부재. 기다림도 전략.'
  ];
  return lines.join(' ');
}

async function fetchBinanceFallback(symbol, tf) {
  const binTf = tf === '1h' ? '1h' : tf;
  const ticker = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`).then(r => r.json());
  const klines = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binTf}&limit=250`).then(r => r.json());
  const closes = klines.map(k => Number(k[4]));
  return { closes, current: Number(ticker.price), source: 'Binance fallback' };
}

function renderSymbolOptions(symbols, selected) {
  const sel = el('symbol');
  sel.innerHTML = '';
  symbols.forEach((sym) => {
    const opt = document.createElement('option');
    opt.value = sym;
    opt.textContent = sym;
    if (sym === selected) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function fetchLiveTickerPrice(symbol) {
  const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
  if (!r.ok) throw new Error(`ticker ${r.status}`);
  const j = await r.json();
  return Number(j.price);
}

function applySettingsToUi(settings) {
  renderSymbolOptions(settings.symbols, settings.symbols[0]);
  el('autoRefresh').checked = !!settings.autoRefresh;
  el('settingsSymbols').value = settings.symbols.join(',');
  el('settingsTf').value = settings.tf;
  el('settingsInterval').value = settings.intervalSec;
}

async function load() {
  const cfg = window.APP_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_URL.includes('__')) {
    el('price').textContent = 'config 필요';
    el('scenario').innerHTML = '<li>public/config.js에 Supabase URL/anon key를 넣어줘.</li>';
    return;
  }

  const { createClient } = window.supabase;
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const symbol = el('symbol').value;
  const saved = loadSettings();
  const tf = saved.tf || cfg.TF || '1h';

  el('price').textContent = '로딩...';

  let closes = [];
  let current = null;
  let sourceLabel = 'Supabase';

  const { data, error } = await sb
    .from('price_candles')
    .select('ts,close')
    .eq('symbol', symbol)
    .eq('tf', tf)
    .order('ts', { ascending: false })
    .limit(250);

  if (!error && data && data.length >= 40) {
    closes = [...data].reverse().map((r) => Number(r.close));
    current = closes[closes.length - 1];
  } else {
    const fb = await fetchBinanceFallback(symbol, tf);
    closes = fb.closes;
    current = fb.current;
    sourceLabel = fb.source;
  }

  el('dataSource').textContent = `데이터 소스: ${sourceLabel}`;
  const rsi = calcRSI(closes);
  const macd = calcMACD(closes);
  const score = computeScore(rsi, macd);
  const sc = scenario(score);

  el('price').textContent = Number(current).toLocaleString();
  el('rsi').textContent = rsi ? rsi.toFixed(2) : '-';
  el('macd').textContent = macd ? `${macd.macd.toFixed(4)} / signal ${macd.signal.toFixed(4)}` : '-';
  el('score').textContent = `${score.toFixed(2)} (${score > 0 ? '상승 우세' : score < 0 ? '하락 우세' : '중립'})`;
  el('scenario').innerHTML = `<li>상승: <b>${sc.up}%</b></li><li>횡보: <b>${sc.flat}%</b></li><li>하락: <b>${sc.down}%</b></li>`;

  el('mood').textContent = moodFromScore(score);
  el('thermoFill').style.width = `${((score + 3) / 6) * 100}%`;
  el('thermoText').textContent = `신호 강도 ${(Math.abs(score) / 3 * 100).toFixed(0)}%`;
  el('brief').textContent = briefLine(symbol, rsi, macd, score);
  drawAllSparks(closes);
}

function armLivePrice() {
  if (priceTimer) clearInterval(priceTimer);
  priceTimer = setInterval(async () => {
    try {
      const symbol = el('symbol').value;
      const p = await fetchLiveTickerPrice(symbol);
      el('price').textContent = Number(p).toLocaleString();
    } catch {}
  }, 1000);
}

function armAutoRefresh() {
  const settings = loadSettings();
  const intervalSec = Number(settings.intervalSec || 30);

  if (autoTimer) clearInterval(autoTimer);
  if (tickTimer) clearInterval(tickTimer);
  leftSec = intervalSec;
  el('countdown').textContent = `${leftSec}s`;

  if (!el('autoRefresh').checked) return;

  tickTimer = setInterval(() => {
    leftSec -= 1;
    if (leftSec <= 0) leftSec = intervalSec;
    el('countdown').textContent = `${leftSec}s`;
  }, 1000);

  autoTimer = setInterval(async () => {
    leftSec = intervalSec;
    await load();
  }, intervalSec * 1000);
}

el('refreshBtn').addEventListener('click', async () => { await load(); armAutoRefresh(); armLivePrice(); });
el('symbol').addEventListener('change', async () => { await load(); armAutoRefresh(); armLivePrice(); });
el('autoRefresh').addEventListener('change', () => {
  const s = loadSettings();
  s.autoRefresh = el('autoRefresh').checked;
  saveSettings(s);
  armAutoRefresh();
});

el('openSettingsBtn').addEventListener('click', () => {
  el('settingsPanel').hidden = false;
});
el('closeSettingsBtn').addEventListener('click', () => {
  el('settingsPanel').hidden = true;
});
el('saveSettingsBtn').addEventListener('click', async () => {
  const symbols = String(el('settingsSymbols').value || '')
    .split(',').map(v => v.trim().toUpperCase()).filter(Boolean);
  const tf = el('settingsTf').value;
  const intervalSec = Math.max(1, Math.min(300, Number(el('settingsInterval').value || 1)));
  const next = {
    ...loadSettings(),
    symbols: symbols.length ? symbols : DEFAULT_SETTINGS.symbols,
    tf,
    intervalSec,
    intervalCustomized: true,
    autoRefresh: el('autoRefresh').checked,
  };
  saveSettings(next);
  renderSymbolOptions(next.symbols, next.symbols[0]);
  el('settingsPanel').hidden = true;
  await load();
  armAutoRefresh();
  armLivePrice();
});

const initial = loadSettings();
applySettingsToUi(initial);
load().then(() => { armAutoRefresh(); armLivePrice(); }).catch(console.error);
