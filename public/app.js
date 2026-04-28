const el = (id) => document.getElementById(id);

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

function briefLine(symbol, rsi, macd, score) {
  const lines = [
    `${symbol} 현재 신호는 ${score > 0 ? '롱 우세' : score < 0 ? '숏 우세' : '중립'}.` ,
    `RSI ${rsi?.toFixed?.(1) ?? '-'} / MACD 히스토그램 ${macd ? (macd.hist > 0 ? '양수' : '음수') : '-'}.`,
    score > 0 ? '모멘텀은 살아있지만, 과열 구간 진입 여부를 체크해.' : score < 0 ? '반등 시도보다 추세 확인이 먼저야.' : '방향성 부재. 기다림도 전략.'
  ];
  return lines.join(' ');
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
  const tf = cfg.TF || '1h';

  el('price').textContent = '로딩...';

  const { data, error } = await sb
    .from('price_candles')
    .select('ts,close')
    .eq('symbol', symbol)
    .eq('tf', tf)
    .order('ts', { ascending: false })
    .limit(250);

  if (error) {
    el('price').textContent = 'DB 에러';
    el('scenario').innerHTML = `<li>${error.message}</li>`;
    return;
  }

  if (!data || data.length < 40) {
    el('price').textContent = '데이터 부족';
    el('scenario').innerHTML = '<li>price_candles 데이터(최소 40개) 먼저 적재 필요</li>';
    return;
  }

  const closes = [...data].reverse().map((r) => Number(r.close));
  const current = closes[closes.length - 1];
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
}

el('refreshBtn').addEventListener('click', load);
el('symbol').addEventListener('change', load);
load().catch(console.error);
