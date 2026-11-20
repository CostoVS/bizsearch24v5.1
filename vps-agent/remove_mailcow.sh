#!/usr/bin/env bash
# =============================================================================
# Remove Mailcow Dockerized Stack to Free VPS RAM (Preserves SearchBiz & Mox)
# =============================================================================
set -e

echo "🧹 Stopping and removing Mailcow containers to free VPS RAM..."

# 1. Stop via Mailcow compose directory if present
for mc_dir in /opt/mailcow-dockerized /root/mailcow-dockerized /home/*/mailcow-dockerized; do
    if [ -d "$mc_dir" ] && [ -f "$mc_dir/docker-compose.yml" ]; then
        echo "📦 Found Mailcow stack at $mc_dir — bringing down..."
        (cd "$mc_dir" && (docker compose down --remove-orphans 2>/dev/null || docker-compose down --remove-orphans 2>/dev/null || true))
    fi
done

# 2. Stop & remove any remaining *-mailcow or mailcowdockerized* containers
if command -v docker >/dev/null 2>&1; then
    MC_CONTAINERS=$(docker ps -aq --filter "name=mailcow" 2>/dev/null || true)
    if [ -n "$MC_CONTAINERS" ]; then
        echo "🛑 Removing Mailcow Docker containers..."
        docker rm -f $MC_CONTAINERS 2>/dev/null || true
    fi

    MC_NETS=$(docker network ls --filter "name=mailcow" -q 2>/dev/null || true)
    if [ -n "$MC_NETS" ]; then
        echo "🌐 Removing Mailcow Docker networks..."
        docker network rm $MC_NETS 2>/dev/null || true
    fi

    # Optional: pass --purge to also remove Mailcow images and volumes
    if [ "${1:-}" = "--purge" ]; then
        MC_VOLS=$(docker volume ls --filter "name=mailcow" -q 2>/dev/null || true)
        if [ -n "$MC_VOLS" ]; then
            echo "🗑️ Removing Mailcow Docker volumes..."
            docker volume rm $MC_VOLS 2>/dev/null || true
        fi
        MC_IMGS=$(docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -iE 'mailcow|sogo|rspamd|dovecot|postfix|clamd|solr' | awk '{print $2}' | sort -u || true)
        if [ -n "$MC_IMGS" ]; then
            echo "🗑️ Removing Mailcow Docker images..."
            docker rmi -f $MC_IMGS 2>/dev/null || true
        fi
    fi
fi

# 3. Disable any Mailcow systemd unit if present
for svc in mailcow mailcow-dockerized; do
    if systemctl list-unit-files "${svc}.service" >/dev/null 2>&1; then
        systemctl stop "$svc" 2>/dev/null || true
        systemctl disable "$svc" 2>/dev/null || true
    fi
done

# 4. Flush Linux page cache to reclaim RAM immediately
sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true

echo "✅ Mailcow removed! Current free RAM:"
free -h || true
