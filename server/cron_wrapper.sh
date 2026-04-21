#!/bin/bash
# Run scraper.py every 5 minutes, restart server if down
cd /home/workspace/nexus/server
while true; do
    echo "[CRON] $(date) - Running scraper..."
    python3 -u scraper.py >> /tmp/nexus_scraper.log 2>&1
    # Check if server is still up
    if ! curl -s --max-time 3 http://localhost:8000/api/health > /dev/null 2>&1; then
        echo "[CRON] Server down, restarting..."
        pkill -f "server.py" 2>/dev/null
        sleep 2
        nohup python3 -u server.py >/dev/null 2>&1 &
        echo "[CRON] Server PID=$!"
    fi
    sleep 300  # 5 minutes
done &
echo "Cron PID=$!"
