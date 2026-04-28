-- coin-signal-lab schema
create table if not exists public.price_candles (
  id bigserial primary key,
  symbol text not null,
  tf text not null default '1h',
  ts timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null,
  created_at timestamptz not null default now(),
  unique(symbol, tf, ts)
);

create index if not exists idx_price_candles_symbol_tf_ts
  on public.price_candles(symbol, tf, ts desc);

create table if not exists public.signal_snapshots (
  id bigserial primary key,
  symbol text not null,
  tf text not null default '1h',
  ts timestamptz not null,
  rsi numeric,
  macd numeric,
  macd_signal numeric,
  macd_hist numeric,
  score numeric,
  up_prob int,
  flat_prob int,
  down_prob int,
  created_at timestamptz not null default now()
);

alter table public.price_candles enable row level security;
alter table public.signal_snapshots enable row level security;

-- public read only (dashboard)
drop policy if exists "price_candles_read" on public.price_candles;
create policy "price_candles_read" on public.price_candles
for select using (true);

drop policy if exists "signal_snapshots_read" on public.signal_snapshots;
create policy "signal_snapshots_read" on public.signal_snapshots
for select using (true);

-- write policy is intentionally omitted (service_role/edge function only)
