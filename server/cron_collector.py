#!/usr/bin/env python3
"""
NEXUS Data Collection Cron
Polls /api/alerts and /api/signals every 60s and writes to SQLite
"""
import sqlite3, time, requests, sys
from datetime import datetime

DB_PATH = "/home/workspace/nexus/nexus.db"
BASE_URL = "https://nexus-api-man44.zocomputer.io"

def get_conn():
    c = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
    c.execute("PRAGMA journal_mode=WAL")
    return c

def fetch_json(endpoint, params=None):
    try:
        r = requests.get(f"{BASE_URL}{endpoint}", params=params, timeout=10)
        return r.json()
    except:
        return None

def sync_signals(conn, hours=24, limit=50):
    """Fetch signals from local server API and write to DB"""
    data = fetch_json("/api/signals", {"hours": hours, "limit": limit})
    if not data or "signals" not in data:
        return 0
    count = 0
    for s in data["signals"]:
        try:
            conn.execute("""
                INSERT INTO signals(ts,source,category,title,url,description,lat,lng,severity,tags)
                VALUES(?,?,?,?,?,?,?,?,?,?)
            """, (
                s.get("ts"), s.get("source"), s.get("category"),
                s.get("title"), s.get("url"), s.get("description"),
                s.get("lat"), s.get("lng"), s.get("severity"), s.get("tags")
            ))
            count += 1
        except:
            pass
    conn.commit()
    return count

def sync_alerts(conn, hours=24):
    """Fetch alerts from local server API and write to DB"""
    data = fetch_json("/api/alerts", {"hours": hours})
    if not data or "alerts" not in data:
        return 0
    count = 0
    for a in data["alerts"]:
        try:
            conn.execute("""
                INSERT INTO alerts(ts,source,alert_type,title,detail,severity,lat,lng)
                VALUES(?,?,?,?,?,?,?,?)
            """, (
                a.get("ts"), a.get("source"), a.get("type"),
                a.get("title"), a.get("detail"), a.get("severity"),
                a.get("lat"), a.get("lng")
            ))
            count += 1
        except:
            pass
    conn.commit()
    return count

def run_scraper(conn):
    """Trigger scraper and poll for results"""
    try:
        requests.post(f"{BASE_URL}/api/scrape", timeout=5)
    except:
        pass

def main():
    print(f"[{datetime.now().isoformat()}] NEXUS cron starting...")
    conn = get_conn()
    interval = 60
    
    while True:
        ts = datetime.now().isoformat()
        
        # Trigger scraper (async, fires but doesn't block)
        run_scraper(conn)
        
        # Sync signals & alerts
        sig_count = sync_signals(conn)
        alert_count = sync_alerts(conn)
        
        print(f"[{ts}] synced {sig_count} signals, {alert_count} alerts")
        
        time.sleep(interval)

if __name__ == "__main__":
    main()