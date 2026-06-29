# Argus one-command setup (Windows). Run from the repo root: .\scripts\setup.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host "==> backend venv + install (provides the 'argus' command)"
python -m venv .venv
.\.venv\Scripts\pip install --quiet --upgrade pip
.\.venv\Scripts\pip install --quiet -e .

Write-Host "==> frontend build"
Push-Location frontend
npm install --silent
npm run build
Pop-Location

Write-Host ""
Write-Host "Setup complete. Create a config and start Argus:"
Write-Host "    .\.venv\Scripts\argus config init      # writes a starter config to the standard location"
Write-Host "    .\.venv\Scripts\argus config path      # show where it lives, then edit it"
Write-Host "    .\.venv\Scripts\argus serve            # then open http://localhost:7700"
Write-Host ""
Write-Host "Tip: '.\.venv\Scripts\argus instance add --name vps --transport ssh ...' and"
Write-Host "     '.\.venv\Scripts\argus doctor' to validate your setup."
