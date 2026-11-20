#!/usr/bin/env bash
# =============================================================================
# SearchBiz Mox Mail Server Verification & Connection Card
# Lightweight Go Mail Server (SMTP 465/587, IMAP 993, Webmail & Admin UI)
# =============================================================================

set -e

MOX_HOST="${MOX_HOST:-mail.searchbiz.co.za}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@searchbiz.co.za}"
AI_EMAIL="${AI_EMAIL:-ai@searchbiz.co.za}"

echo "========================================================"
echo "📧 SearchBiz Mox Mail Server Verification"
echo "========================================================"

if systemctl is-active --quiet mox 2>/dev/null; then
    echo "✅ Mox systemd service is ACTIVE."
elif pgrep -x mox >/dev/null 2>&1; then
    echo "✅ Mox process is RUNNING."
else
    echo "⚠️  Mox process not detected locally via systemd/pgrep (may be remote or under another unit name)."
fi

echo ""
echo "🔍 Checking Mox listening ports (25, 465, 587, 993, 143)..."
if command -v ss >/dev/null 2>&1; then
    ss -tlnp | grep -E ':(25|143|465|587|993)\b' || echo "No local mail ports matched in ss."
fi

echo ""
echo "========================================================"
echo "✅ MOX MAIL CONFIGURATION FOR SEARCHBIZ"
echo "========================================================"
echo "📍 Admin Mailbox:     ${ADMIN_EMAIL}"
echo "🤖 AI Outreach Box:   ${AI_EMAIL}"
echo ""
echo "📥 Incoming Mail (IMAP):"
echo "   • Host:            ${MOX_HOST} (or 127.0.0.1 on VPS)"
echo "   • Port:            993 (SSL/TLS) or 143 (STARTTLS)"
echo ""
echo "📤 Outgoing Mail (SMTP):"
echo "   • Host:            ${MOX_HOST} (or host.docker.internal from Docker / 127.0.0.1 on VPS)"
echo "   • Port:            465 (SMTPS SSL/TLS) or 587 (STARTTLS)"
echo ""
echo "🌐 Mox Webmail & Admin UI:"
echo "   • Webmail:         https://${MOX_HOST}/webmail/"
echo "   • Admin Panel:     https://${MOX_HOST}/admin/"
echo "========================================================"
