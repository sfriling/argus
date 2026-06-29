#!/usr/bin/env bash
# Argus one-command setup (Linux/macOS). Run from the repo root: ./scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> backend venv + install (provides the 'argus' command)"
python3 -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -e .

echo "==> frontend build"
( cd frontend && npm install --silent && npm run build )

cat <<'EOF'

Setup complete. Create a config and start Argus:
    .venv/bin/argus config init      # writes a starter config to the standard location
    .venv/bin/argus config path      # show where it lives, then edit it
    .venv/bin/argus serve            # then open http://localhost:7700

Tip: `.venv/bin/argus instance add --name vps --transport ssh ...` and
     `.venv/bin/argus doctor` to validate your setup.
EOF
