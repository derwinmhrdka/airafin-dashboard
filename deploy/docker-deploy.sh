#!/usr/bin/env bash
set -euo pipefail

COMPOSE="${COMPOSE_CMD:-docker compose}"

if [ ! -f .env ]; then
  echo "ERROR: .env not found in $(pwd). Create it from .env.example before deploying." >&2
  exit 1
fi

echo "==> Building and starting containers..."
$COMPOSE up -d --build --remove-orphans

echo "==> Container status:"
$COMPOSE ps

echo "==> Waiting for backend health..."
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:3081/health 2>/dev/null | grep -q '"status":"ok"'; then
    echo "==> Backend healthy"
    break
  fi
  sleep 2
done

if ! curl -fsS http://localhost:3081/health 2>/dev/null | grep -q '"status":"ok"'; then
  echo "ERROR: Backend health check failed" >&2
  $COMPOSE logs backend --tail 40
  exit 1
fi

echo "==> Waiting for frontend health..."
FRONTEND_READY=false
for i in $(seq 1 20); do
  if curl -fsS -o /dev/null http://localhost:3080 2>/dev/null; then
    echo "==> Frontend OK"
    FRONTEND_READY=true
    break
  fi
  echo "Percobaan $i: Frontend belum siap, menunggu 3 detik..."
  sleep 3
done

if [ "$FRONTEND_READY" = false ]; then
  echo "ERROR: Frontend tidak merespon di :3080" >&2
  $COMPOSE logs frontend --tail 40
  exit 1
fi

echo "==> Deploy finished OK"
