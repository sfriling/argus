#!/usr/bin/env bash
# Argus one-command setup (Linux/macOS). Run from the repo root: ./scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Argus setup"

if [ ! -f config.yaml ]; then
  cp config.example.yaml config.yaml
  echo "  · created config.yaml from example — edit it to point at your instances"
else
  echo "  · config.yaml already exists, leaving it"
fi

echo "==> backend venv + deps"
python3 -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r backend/requirements.txt

echo "==> frontend build"
( cd frontend && npm install --silent && npm run build )

cat <<'EOF'

✓ Setup complete. Edit config.yaml, then run:
    .venv/bin/python -m uvicorn backend.app:create_app --factory --port 7700
  and open http://localhost:7700
EOF
