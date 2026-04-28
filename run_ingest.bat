@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if not exist .env (
  echo [ERROR] .env 파일이 없습니다.
  echo .env.example 을 복사해서 .env 만들고 값 채워주세요.
  pause
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
  if not "%%A"=="" (
    set "key=%%A"
    set "val=%%B"
    set "!key!=!val!"
  )
)

echo [INFO] Running ingest...
call npm run ingest

if errorlevel 1 (
  echo [ERROR] ingest failed.
) else (
  echo [OK] ingest done.
)

pause
