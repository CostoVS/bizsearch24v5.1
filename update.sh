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

# Sync Mox Mail Server settings and credentials into .env
if [ -f ".env" ]; then
  if grep -qiE "smtp\.gmail\.com|mailsearchbiz@gmail\.com|mail@searchbiz\.co\.za" ".env"; then
    echo "Migrating legacy Gmail SMTP settings in .env to Mox Mail Server..."
    sed -i '/^SMTP_HOST=/d;/^SMTP_PORT=/d;/^SMTP_USER=/d;/^SMTP_PASS=/d;/^FROM_EMAIL=/d' .env
  fi

  if [ -f "/root/.searchbiz_mail_credentials.txt" ]; then
    echo "Syncing Mox mailbox credentials from /root/.searchbiz_mail_credentials.txt into .env..."
    ADMIN_MOX_PASS="$(awk -F'Pass: ' '/^admin@searchbiz\.co\.za/{print $2}' /root/.searchbiz_mail_credentials.txt | awk '{print $1}' | tr -d '\r')"
    HELP_MOX_PASS="$(awk -F'Pass: ' '/^help@searchbiz\.co\.za/{print $2}' /root/.searchbiz_mail_credentials.txt | awk '{print $1}' | tr -d '\r')"
    AI_MOX_PASS="$(awk -F'Pass: ' '/^ai@searchbiz\.co\.za/{print $2}' /root/.searchbiz_mail_credentials.txt | awk '{print $1}' | tr -d '\r')"
    NOREPLY_MOX_PASS="$(awk -F'Pass: ' '/^noreply@searchbiz\.co\.za/{print $2}' /root/.searchbiz_mail_credentials.txt | awk '{print $1}' | tr -d '\r')"

    sed -i '/^SMTP_HOST=/d;/^SMTP_PORT=/d;/^SMTP_USER=/d;/^SMTP_PASS=/d;/^FROM_EMAIL=/d' .env
    sed -i '/^NOREPLY_EMAIL=/d;/^SMTP_NOREPLY_USER=/d;/^SMTP_NOREPLY_PASS=/d' .env
    sed -i '/^AI_EMAIL=/d;/^SMTP_AI_USER=/d;/^SMTP_AI_PASS=/d' .env
    sed -i '/^ADMIN_MAILBOX=/d;/^SMTP_ADMIN_USER=/d;/^SMTP_ADMIN_PASS=/d;/^ADMIN_EMAIL=/d' .env
    sed -i '/^HELP_EMAIL=/d;/^SMTP_HELP_USER=/d;/^SMTP_HELP_PASS=/d' .env

    cat << EOF >> .env
ADMIN_EMAIL="admin@searchbiz.co.za"
SMTP_HOST="mail.searchbiz.co.za"
SMTP_PORT="465"
SMTP_USER="admin@searchbiz.co.za"
SMTP_PASS="${ADMIN_MOX_PASS}"
FROM_EMAIL="admin@searchbiz.co.za"
NOREPLY_EMAIL="noreply@searchbiz.co.za"
SMTP_NOREPLY_USER="noreply@searchbiz.co.za"
SMTP_NOREPLY_PASS="${NOREPLY_MOX_PASS}"
AI_EMAIL="ai@searchbiz.co.za"
SMTP_AI_USER="ai@searchbiz.co.za"
SMTP_AI_PASS="${AI_MOX_PASS}"
ADMIN_MAILBOX="admin@searchbiz.co.za"
SMTP_ADMIN_USER="admin@searchbiz.co.za"
SMTP_ADMIN_PASS="${ADMIN_MOX_PASS}"
HELP_EMAIL="help@searchbiz.co.za"
SMTP_HELP_USER="help@searchbiz.co.za"
SMTP_HELP_PASS="${HELP_MOX_PASS}"
EOF
  fi
fi

mkdir -p .data data
# Ensure non-root nextjs user (uid 1001) in Docker can write to bind-mounted .data and data
chmod -R ug+rwX .data data 2>/dev/null || chmod -R 775 .data data 2>/dev/null || true

if [ -f "docker-compose.yml" ] && command -v docker &> /dev/null; then
  echo "Rebuilding and starting searchbiz-postgres-db and searchbiz-web containers..."
  systemctl start docker 2>/dev/null || true
  docker compose up --build -d db web || docker compose up --build -d || docker start searchbiz-web 2>/dev/null || true
  if docker network inspect proxy_network >/dev/null 2>&1; then
    docker network connect proxy_network searchbiz-web 2>/dev/null || true
  fi
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
