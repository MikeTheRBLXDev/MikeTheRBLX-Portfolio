@echo off
setlocal
cd /d "%~dp0"
set "portfolio_node=node"
where node >nul 2>nul
if not errorlevel 1 goto update
set "portfolio_node=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%portfolio_node%" goto update
echo Node.js was not found. Install Node.js, then reopen this command file.
echo The Node.js runtime bundled with Codex is also supported.
pause
exit /b 1
:update
"%portfolio_node%" "scripts\portfolio.cjs"
if errorlevel 1 (
  echo.
  echo Could not update the portfolio. Fix the error above in portfolio-content.js.
  pause
  exit /b 1
)
echo.
echo Your portfolio is updated locally.
echo Upload or push portfolio-content.js, portfolio.json, and new images to GitHub.
pause
exit /b 0
