# Argus one-command setup (Windows). Run from the repo root: .\scripts\setup.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host "==> Argus setup"

if (-not (Test-Path config.yaml)) {
    Copy-Item config.example.yaml config.yaml
    Write-Host "  - created config.yaml from example - edit it to point at your instances"
} else {
    Write-Host "  - config.yaml already exists, leaving it"
}

Write-Host "==> backend venv + deps"
python -m venv .venv
.\.venv\Scripts\pip install --quiet --upgrade pip
.\.venv\Scripts\pip install --quiet -r backend\requirements.txt

Write-Host "==> frontend build"
Push-Location frontend
npm install --silent
npm run build
Pop-Location

Write-Host ""
Write-Host "Setup complete. Edit config.yaml, then run:"
Write-Host "    .\.venv\Scripts\python -m uvicorn backend.app:create_app --factory --port 7700"
Write-Host "  and open http://localhost:7700"
