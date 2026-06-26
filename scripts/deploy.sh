#!/usr/bin/env bash
# ==============================================================
# scripts/deploy.sh
# ==============================================================
#
# Purpose:
#   One-command redeployment script for SovCorE Auto on ws10121.
#   Encodes every lesson learned during the initial deployment so
#   future deploys never hit the same surprises.
#
# Usage (as opsengine_admin on ws10121):
#   bash /srv/sovcore-auto/repo/scripts/deploy.sh           # full deploy
#   bash /srv/sovcore-auto/repo/scripts/deploy.sh backend   # backend only
#   bash /srv/sovcore-auto/repo/scripts/deploy.sh frontend  # frontend only
#
# ==============================================================

set -euo pipefail

REPO=/srv/sovcore-auto/repo
SVC=svc_sovcore_auto
VENV=/srv/sovcore-auto/venv
BACKEND_SVC=sovcore-auto-backend
FRONTEND_SVC=sovcore-auto-frontend
TARGET=${1:-all}

step() { echo; echo "==> $*"; }
ok()   { echo "    ok"; }

# ── Pull ────────────────────────────────────────────────────────
step "Pull latest code from main"
sudo git -C "$REPO" pull
sudo git -C "$REPO" log --oneline -1
ok

# ── Backend ─────────────────────────────────────────────────────
if [[ "$TARGET" == "all" || "$TARGET" == "backend" ]]; then

  step "Backend: install Python dependencies"
  sudo "$VENV/bin/pip" install -r "$REPO/backend/app/requirements.txt" --quiet
  ok

  step "Backend: run Alembic migrations"
  # _load_credentials() in settings.py reads from CREDENTIALS_DIRECTORY.
  # That variable is only set by systemd when the service starts — it is not
  # set in a manual shell session, so alembic fails with missing-field errors.
  # Fix: point CREDENTIALS_DIRECTORY at the running service's decrypted tmpfs
  # path (/run/credentials/<service>.service/), which systemd populates at
  # startup and which svc_sovcore_auto can read (mode 0500, files 0400).
  CRED_DIR="/run/credentials/${BACKEND_SVC}.service"
  if [ ! -d "$CRED_DIR" ]; then
    echo "    WARNING: $CRED_DIR not found — backend not running yet, starting it first"
    sudo systemctl start "$BACKEND_SVC"
    sleep 4
  fi
  sudo -u "$SVC" bash -c "
    export CREDENTIALS_DIRECTORY='$CRED_DIR'
    source $VENV/bin/activate
    cd $REPO/backend/app
    alembic upgrade head
  "
  ok

  step "Backend: restart service"
  sudo systemctl restart "$BACKEND_SVC"
  sleep 4

  step "Backend: health check"
  if curl -sf http://127.0.0.1:8000/api/v1/health > /dev/null; then
    echo "    health ok — $(curl -s http://127.0.0.1:8000/api/v1/health)"
  else
    echo "    FAILED — reading last 50 lines of journal:"
    sudo journalctl -u "$BACKEND_SVC" -n 50 --no-pager
    exit 1
  fi

  step "Backend: readiness check (database)"
  if curl -sf http://127.0.0.1:8000/api/v1/readiness > /dev/null; then
    echo "    readiness ok — $(curl -s http://127.0.0.1:8000/api/v1/readiness)"
  else
    echo "    FAILED — database unreachable"
    sudo journalctl -u "$BACKEND_SVC" -n 50 --no-pager
    exit 1
  fi

fi

# ── Frontend ────────────────────────────────────────────────────
if [[ "$TARGET" == "all" || "$TARGET" == "frontend" ]]; then

  step "Frontend: fix .next/ ownership before build"
  # .next/ accumulates root-owned files if ever built with plain sudo (not sudo -u).
  # Without this chown, pnpm build fails with EACCES on .next/diagnostics/build-diagnostics.json.
  sudo chown -R "$SVC:$SVC" "$REPO/frontend/web/.next" 2>/dev/null || true
  ok

  step "Frontend: install Node.js dependencies"
  sudo -u "$SVC" bash -c "cd $REPO/frontend/web && pnpm install --frozen-lockfile"
  ok

  step "Frontend: build (Next.js standalone)"
  sudo -u "$SVC" bash -c "cd $REPO/frontend/web && pnpm build"
  ok

  step "Frontend: copy static assets into standalone output"
  # CRITICAL — Next.js standalone (output: 'standalone' in next.config.js) does NOT
  # auto-copy .next/static/ into .next/standalone/.next/static/.
  # Every build changes JS chunk hashes. Without this copy, the browser requests
  # new chunk URLs that 404, producing ChunkLoadError and a broken app.
  # This step MUST run after every pnpm build. No exceptions.
  sudo -u "$SVC" bash -c "
    cd $REPO/frontend/web
    rm -rf .next/standalone/.next/static
    cp -r .next/static .next/standalone/.next/static
  "
  ok

  step "Frontend: restart service"
  # Restart is run SEPARATELY from the build step — not chained with &&.
  # If the static copy step above failed, && would have already aborted.
  # But if any non-fatal step (e.g. a missing public/ dir) were to fail,
  # a chained && would silently skip the restart. Run it explicitly.
  sudo systemctl restart "$FRONTEND_SVC"
  sleep 3

  step "Frontend: health check"
  if curl -sf http://127.0.0.1:3000/ > /dev/null; then
    echo "    frontend ok"
  else
    echo "    FAILED — reading last 50 lines of journal:"
    sudo journalctl -u "$FRONTEND_SVC" -n 50 --no-pager
    exit 1
  fi

fi

echo
echo "=== Deploy complete ==="
echo "    Commit: $(sudo git -C $REPO log --oneline -1)"
echo "    Backend:  $(curl -s http://127.0.0.1:8000/api/v1/health 2>/dev/null || echo 'not checked')"
echo "    Frontend: http://127.0.0.1:3000/"
