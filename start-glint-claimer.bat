@echo off
REM ---------------------------------------------------------------------------
REM  GLINT headless claimer launcher
REM  Runs the API-only claimer (rain / Discord tag / rakeback / P&L webhook)
REM  without needing a browser page open.
REM
REM  First time:
REM    1) copy your glint.did cookie value into "glint-cookie.txt" (one line), or
REM       run glint-cookie-export.user.js in Tampermonkey once, or
REM       set GLINT_COOKIE=<value> in the environment
REM    2) paste your Discord webhook URL into glint-claimer.config.json
REM
REM  Usage:  start-glint-claimer.bat            (normal window)
REM          start-glint-claimer.bat --once     (single pass, useful for a Task Scheduler job)
REM ---------------------------------------------------------------------------
cd /d "%~dp0"
if exist "glint-cookie.txt" (
  for /f "usebackq delims=" %%L in ("glint-cookie.txt") do set "GLINT_COOKIE=%%L"
)
node glint-claimer.js %*
pause
