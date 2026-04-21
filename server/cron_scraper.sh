#!/bin/bash
# NEXUS Scraper Cron — runs scraper.py every 5 minutes
# Usage: ./cron_scraper.sh start  (or add to crontab: */5 * * * * /home/workspace/nexus/server/cron_scraper.sh)

SCRAPER="/home/workspace/nexus/server/scraper.py"
LOG="/tmp/scraper.log"
PIDFILE="/tmp/scraper_cron.pid"

start_daemon() {
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "[cron_scraper] Already running as PID $(cat "$PIDFILE")"
    else
        echo "[cron_scraper] Starting background loop (logs → $LOG)"
        nohup bash -c "while true; do
            echo \"[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Running scraper...\"
            python3 -u '$SCRAPER' >> '$LOG' 2>&1
            echo \"[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Sleeping 300s...\"
            sleep 300
        done" &
        echo $! > "$PIDFILE"
        echo "[cron_scraper] Started as PID $(cat "$PIDFILE")"
    fi
}

stop_daemon() {
    if [ -f "$PIDFILE" ]; then
        kill "$(cat "$PIDFILE")" 2>/dev/null && echo "[cron_scraper] Stopped PID $(cat "$PIDFILE")"
        rm -f "$PIDFILE"
    else
        echo "[cron_scraper] Not running"
    fi
}

case "${1:-start}" in
    start)   start_daemon ;;
    stop)    stop_daemon ;;
    restart) stop_daemon; start_daemon ;;
    run)     python3 -u "$SCRAPER" ;;
    *)       echo "Usage: $0 {start|stop|restart|run}" ;;
esac
