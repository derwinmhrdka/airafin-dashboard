#!/usr/bin/env bash
set -euo pipefail

COMPOSE="${COMPOSE_CMD:-docker compose}"

if [ ! -f .env ]; then
  echo "ERROR: .env not found in $(pwd). Create it from .env.example before deploying." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

DOMAIN="${DOMAIN:-airafin.teknodika.com}"
ORIGIN="${ORIGIN:-https://${DOMAIN}}"

if [[ "$ORIGIN" != https://* ]]; then
  echo "WARNING: ORIGIN should be https:// for production (current: ${ORIGIN})" >&2
  echo "         Set ORIGIN=https://${DOMAIN} in .env" >&2
fi

echo "==> Building and starting containers..."
$COMPOSE up -d --build --remove-orphans

echo "==> Container status:"
$COMPOSE ps

echo "==> Waiting for backend health..."
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3081/health 2>/dev/null | grep -q '"status":"ok"'; then
    echo "==> Backend healthy"
    break
  fi
  sleep 2
done

if ! curl -fsS http://127.0.0.1:3081/health 2>/dev/null | grep -q '"status":"ok"'; then
  echo "ERROR: Backend health check failed" >&2
  $COMPOSE logs backend --tail 40
  exit 1
fi

echo "==> Waiting for frontend health..."
FRONTEND_READY=false
for i in $(seq 1 20); do
  if curl -fsS -o /dev/null http://127.0.0.1:3080 2>/dev/null; then
    echo "==> Frontend OK"
    FRONTEND_READY=true
    break
  fi
  echo "Attempt $i: frontend not ready, waiting 3s..."
  sleep 3
done

if [ "$FRONTEND_READY" = false ]; then
  echo "ERROR: Frontend not responding on 127.0.0.1:3080" >&2
  $COMPOSE logs frontend --tail 40
  exit 1
fi

echo "==> Waiting for HTTPS (${DOMAIN})..."
HTTPS_READY=false
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "https://${DOMAIN}" 2>/dev/null; then
    echo "==> HTTPS OK: https://${DOMAIN}"
    HTTPS_READY=true
    break
  fi
  echo "Attempt $i: HTTPS not ready yet (DNS/Let's Encrypt may take a minute)..."
  sleep 5
done

if [ "$HTTPS_READY" = false ]; then
  echo "WARNING: https://${DOMAIN} not reachable yet." >&2
  echo "         Check DNS A record → this server, ports 80/443 open, and: docker compose logs caddy" >&2
  echo "         If host nginx already uses 80/443, disable caddy and use deploy/nginx-airafin.conf.example" >&2
else
  echo "==> Deploy finished OK — https://${DOMAIN}"
fi
