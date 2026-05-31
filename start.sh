#!/bin/bash
# GDPR Sentinel — macOS launcher
# Place this file in the repo root and run: chmod +x start.sh && ./start.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================"
echo "  GDPR Sentinel — Starting up..."
echo "======================================"

# ── 1. Check Python venv ──────────────────────────────────────────────────────
if [ ! -f ".venv/bin/activate" ]; then
  echo "[ERROR] Python venv not found. Run:"
  echo "  python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

source .venv/bin/activate

# ── 2. Check Node / npm ───────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  echo "[ERROR] npm not found. Install Node.js from https://nodejs.org"
  exit 1
fi

# ── 3. Install frontend deps if needed ───────────────────────────────────────
if [ ! -d "frontend/node_modules" ]; then
  echo "[INFO] Installing frontend dependencies..."
  (cd frontend && npm install --silent)
fi

# ── 4. Create frontend .env.local if missing ─────────────────────────────────
if [ ! -f "frontend/.env.local" ]; then
  echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" > frontend/.env.local
  echo "[INFO] Created frontend/.env.local"
fi

# ── 5. Launch backend in a new Terminal tab ───────────────────────────────────
echo "[INFO] Starting backend on http://localhost:8000 ..."
osascript <<EOF
tell application "Terminal"
  activate
  do script "cd '$SCRIPT_DIR' && source .venv/bin/activate && echo '--- GDPR Sentinel Backend ---' && uvicorn main:app --reload --port 8000"
end tell
EOF

# ── 6. Wait for backend to be ready ──────────────────────────────────────────
echo "[INFO] Waiting for backend to start..."
for i in $(seq 1 30); do
  if curl -s http://localhost:8000/health | grep -q "ok"; then
    echo "[INFO] Backend is up."
    break
  fi
  sleep 1
done

# ── 7. Launch frontend in another Terminal tab ───────────────────────────────
echo "[INFO] Starting frontend on http://localhost:3000 ..."
osascript <<EOF
tell application "Terminal"
  activate
  do script "cd '$SCRIPT_DIR/frontend' && echo '--- GDPR Sentinel Frontend ---' && npm run dev"
end tell
EOF

# ── 8. Wait for frontend and open browser ────────────────────────────────────
echo "[INFO] Waiting for frontend to start..."
sleep 8
open http://localhost:3000

echo ""
echo "======================================"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:3000"
echo "  API docs: http://localhost:8000/docs"
echo "======================================"
echo ""
echo "  Close the two Terminal windows to stop."
echo "======================================"
