import process from 'node:process'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SYMBOLS = (process.env.SYMBOLS || 'BTCUSDT,ETHUSDT,SOLUSDT').split(',').map(s => s.trim()).filter(Boolean)
const TF = process.env.TF || '1h'
const LIMIT = Number(process.env.LIMIT || 500)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

async function fetchKlines(symbol) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${TF}&limit=${LIMIT}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Binance error ${res.status} for ${symbol}`)
  return res.json()
}

function mapRows(symbol, klines) {
  return klines.map(k => ({
    symbol,
    tf: TF,
    ts: new Date(Number(k[0])).toISOString(),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }))
}

async function upsertRows(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/price_candles?on_conflict=symbol,tf,ts`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Supabase upsert failed ${res.status}: ${t}`)
  }
}

async function main() {
  for (const symbol of SYMBOLS) {
    const klines = await fetchKlines(symbol)
    const rows = mapRows(symbol, klines)
    await upsertRows(rows)
    console.log(`ok ${symbol}: ${rows.length} rows`) 
  }
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
