@echo off
setlocal
cd /d "%~dp0"
set "portfolio_python=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
set "portfolio_python_args="
if exist "%portfolio_python%" goto preview
where py >nul 2>nul
if not errorlevel 1 (
  set "portfolio_python=py"
  set "portfolio_python_args=-3"
  goto preview
)
where python >nul 2>nul
if not errorlevel 1 (
  set "portfolio_python=python"
  goto preview
)
echo Python was not found. Open this project in Codex to preview it.
pause
exit /b 1
:preview
"%portfolio_python%" %portfolio_python_args% ".github\scripts\generate-manifest.py"
if errorlevel 1 (
  echo Could not update the portfolio. Check the message above.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173 in your browser.
echo Keep this window open while previewing. Press Ctrl+C to stop.
"%portfolio_python%" %portfolio_python_args% -m http.server 4173 --bind 127.0.0.1
pause
