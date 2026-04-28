# Coin Signal Lab

Firebase Hosting + Supabase DB 기반 코인 시그널 대시보드.

## 1) Supabase 준비
1. Supabase SQL Editor에서 `supabase_schema.sql` 실행
2. `public/config.js`에 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 입력

## 2) 데이터 적재 (Binance -> Supabase)
```bash
cp .env.example .env
# .env에 실제 값 입력
```

PowerShell 예시:
```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^(.*?)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}
npm run ingest
```

## 3) 배포
```bash
firebase deploy --only hosting --project qna-knowledge-tree-euo
```
