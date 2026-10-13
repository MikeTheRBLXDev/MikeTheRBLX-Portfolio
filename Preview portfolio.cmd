@echo off
setlocal
cd /d "%~dp0"
set "portfolio_node=node"
where node >nul 2>nul
if not errorlevel 1 goto preview
set "portfolio_node=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%portfolio_node%" goto preview
echo Node.js was not found. Install Node.js, then reopen this command file.
echo The Node.js runtime bundled with Codex is also supported.
pause
exit /b 1
:preview
"%portfolio_node%" "scripts\portfolio.cjs" --build
if errorlevel 1 (
  echo.
  echo Could not update the portfolio. Fix the error above in portfolio-content.js.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173 in your browser.
echo Keep this window open while previewing. Press Ctrl+C to stop.
"%portfolio_node%" "scripts\preview.cjs"
if errorlevel 1 (
  echo.
  echo Could not start the preview. Check the message above.
  pause
  exit /b 1
)
exit /b 0
