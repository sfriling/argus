@echo off
REM Argus — Hermes fleet dashboard. Launched hidden by the Startup-folder .vbs.
REM Derives its own location (%~dp0) so it works from any checkout path.
REM Host/port come from the Argus config (argus serve); logs to %LOCALAPPDATA%\argus.log.
cd /d "%~dp0"
".venv\Scripts\pythonw.exe" -m backend.cli serve >> "%LOCALAPPDATA%\argus.log" 2>&1
