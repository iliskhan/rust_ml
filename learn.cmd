@echo off
setlocal
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 or newer and pnpm 11.25.0, then run learn.cmd again.
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 24) { console.error('Node.js 24 or newer is required.'); process.exit(1); }"
if errorlevel 1 exit /b 1
where pnpm >nul 2>&1
if errorlevel 1 (
  echo Install pnpm: npm install --global pnpm@11.25.0
  exit /b 1
)
pushd "%~dp0learning-lab"
if errorlevel 1 exit /b 1
call pnpm install --frozen-lockfile
if errorlevel 1 goto finish
call pnpm dev --port 5180 --strictPort --open %*
:finish
set "result=%errorlevel%"
popd
exit /b %result%
