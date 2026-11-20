#!/usr/bin/env bash
# =============================================================================
# SearchBiz Unified Fast Update & Zero-Lag Pre-Warm Script
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "Updating SearchBiz Web & Agent..."

PRESERVE_DIR="$(mktemp -d)"
cleanup_preserve() {
  rm -rf "${PRESERVE_DIR}"
}
trap cleanup_preserve EXIT

KEEP_FILES=".env .data/users-db.json data/users-db.json .data/2fa-reset-requests.json data/2fa-reset-requests.json .data/email-otps.json .data/premium-applications.json .data/ip-bindings-db.json data/db.json .data/db.json data/site-settings.json .data/site-settings.json"

for keep_file in ${KEEP_FILES}; do
  if [ -f "${keep_file}" ]; then
    mkdir -p "${PRESERVE_DIR}/$(dirname "${keep_file}")"
    cp -a "${keep_file}" "${PRESERVE_DIR}/${keep_file}"
  fi
done

if [ -d ".git" ]; then
  echo "Syncing latest repository changes from GitHub..."
  git fetch origin main 2>/dev/null && git reset --hard origin/main 2>/dev/null || true
fi

for keep_file in ${KEEP_FILES}; do
  if [ -f "${PRESERVE_DIR}/${keep_file}" ]; then
    mkdir -p "$(dirname "${keep_file}")"
    cp -a "${PRESERVE_DIR}/${keep_file}" "${keep_file}"
  fi
done

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  echo "No .env found — bootstrapping from .env.example..."
  cp .env.example .env
  if command -v openssl &> /dev/null; then
    RAND_SESS="$(openssl rand -hex 32)"
    RAND_OTP="$(openssl rand -hex 32)"
    sed -i "s|replace_with_a_long_random_session_secret|${RAND_SESS}|g" .env 2>/dev/null || true
    sed -i "s|replace_with_a_long_random_otp_secret|${RAND_OTP}|g" .env 2>/dev/null || true
  fi
fi

# Migrate any legacy Gmail SMTP settings in .env to Mox Mail Server
if [ -f ".env" ] && grep -qiE "smtp\.gmail\.com|mailsearchbiz@gmail\.com|mail@searchbiz\.co\.za" ".env"; then
  echo "Migrating legacy Gmail SMTP settings in .env to Mox Mail Server..."
  sed -i '/^SMTP_HOST=/d;/^SMTP_PORT=/d;/^SMTP_USER=/d;/^SMTP_PASS=/d;/^FROM_EMAIL=/d' .env
  cat << 'EOF' >> .env
SMTP_HOST="mail.searchbiz.co.za"
SMTP_PORT="465"
SMTP_USER="admin@searchbiz.co.za"
SMTP_PASS="SearchBizAdmin@2026!"
FROM_EMAIL="admin@searchbiz.co.za"
NOREPLY_EMAIL="noreply@searchbiz.co.za"
SMTP_NOREPLY_USER="noreply@searchbiz.co.za"
AI_EMAIL="ai@searchbiz.co.za"
SMTP_AI_USER="ai@searchbiz.co.za"
SMTP_AI_PASS="HermesAI@2026!"
ADMIN_MAILBOX="admin@searchbiz.co.za"
SMTP_ADMIN_USER="admin@searchbiz.co.za"
SMTP_ADMIN_PASS="SearchBizAdmin@2026!"
HELP_EMAIL="help@searchbiz.co.za"
SMTP_HELP_USER="help@searchbiz.co.za"
EOF
fi

mkdir -p .data data
# Ensure non-root nextjs user (uid 1001) in Docker can write to bind-mounted .data and data
chmod -R ug+rwX .data data 2>/dev/null || chmod -R 775 .data data 2>/dev/null || true

if [ -f "docker-compose.yml" ] && command -v docker &> /dev/null; then
  echo "Rebuilding and starting searchbiz-postgres-db and searchbiz-web containers..."
  systemctl start docker 2>/dev/null || true
  docker compose up --build -d db web || docker compose up --build -d || docker start searchbiz-web 2>/dev/null || true
fi

if command -v nginx &> /dev/null; then
  systemctl start nginx 2>/dev/null || true
  systemctl reload nginx 2>/dev/null || true
fi
if command -v docker &> /dev/null && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'npm-app-1'; then
  docker exec npm-app-1 nginx -s reload 2>/dev/null || true
fi

if [ -d "vps-agent" ] && [ -f "vps-agent/update_agent.sh" ]; then
  echo "Updating Hermes VPS Agent..."
  (cd vps-agent && bash update_agent.sh) || true
fi

echo "Pre-warming SearchBiz O(1) RAM Index..."
for i in $(seq 1 20); do
  if curl -sSf "http://127.0.0.1:3005/api/site-settings" >/dev/null 2>&1 || curl -sSf "http://127.0.0.1:3000/api/site-settings" >/dev/null 2>&1; then
    curl -s "http://127.0.0.1:3005/api/storage?statsOnly=true" >/dev/null 2>&1 || true
    curl -s "http://127.0.0.1:3005/api/storage?freeOnly=true&includeFeatured=true&page=1&pageSize=12" >/dev/null 2>&1 || true
    curl -s "http://127.0.0.1:3005/api/storage?page=1&pageSize=24" >/dev/null 2>&1 || true
    curl -s "http://127.0.0.1:3000/api/storage?statsOnly=true" >/dev/null 2>&1 || true
    echo "SearchBiz RAM Index is warm and serving!"
    break
  fi
  sleep 2
done
