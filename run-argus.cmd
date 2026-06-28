@echo off
REM Argus — Hermes fleet dashboard. Launched hidden by the Startup-folder .vbs.
cd /d "D:\Projects\ScratchPad\argus"
".venv\Scripts\pythonw.exe" -m uvicorn backend.app:create_app --factory --host 127.0.0.1 --port 7700 > "%LOCALAPPDATA%\argus.log" 2>&1
