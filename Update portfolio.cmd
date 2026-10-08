@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 ".github\scripts\generate-manifest.py"
  goto result
)
where python >nul 2>nul
if not errorlevel 1 (
  python ".github\scripts\generate-manifest.py"
  goto result
)
echo Python was not found. You can still upload your assets to GitHub,
echo where the portfolio updates automatically without a local setup.
pause
exit /b 1
:result
if errorlevel 1 (
  echo The portfolio could not be updated. Check the message above.
  pause
  exit /b 1
)
echo.
echo Your portfolio is updated locally. Upload or push the changes to GitHub to publish them.
pause
exit /b 0
