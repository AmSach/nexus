"""
NEXUS v4 Intelligence Platform — Unified Server
"""
import sqlite3, json, time, math, random, re
from datetime import datetime, timedelta
from typing import Optional

DB_PATH = "/home/workspace/nexus/nexus.db"
conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA cache_size=-64000")

def init_db():
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS signals(id INTEGER PRIMARY KEY,ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,source TEXT,category TEXT,title TEXT,url TEXT,description TEXT,lat REAL,lng REAL,severity TEXT,tags TEXT,score REAL DEFAULT 0,entity_type TEXT,country TEXT);
    CREATE TABLE IF NOT EXISTS prices(id INTEGER PRIMARY KEY,ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,symbol TEXT,price REAL,change_pct REAL,volume REAL);
    CREATE TABLE IF NOT EXISTS markets(id INTEGER PRIMARY KEY,ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,market_id TEXT UNIQUE,question TEXT,prob REAL,volume REAL,source TEXT,resolved INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS predictions(id INTEGER PRIMARY KEY,ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,question_id TEXT,predicted_prob REAL,actual_outcome INTEGER,resolved INTEGER DEFAULT 0,engine TEXT,confidence REAL,evidence TEXT);
    CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY,ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,source TEXT,alert_type TEXT,title TEXT,detail TEXT,severity TEXT,lat REAL,lng REAL,resolved INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS intel(id INTEGER PRIMARY KEY,ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,query TEXT,result TEXT,source TEXT);
    CREATE TABLE IF NOT EXISTS surveillance(id INTEGER PRIMARY KEY,ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,source TEXT,surveillance_type TEXT,title TEXT,description TEXT,url TEXT,lat REAL,lng REAL,confidence REAL,tags TEXT);
    CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals(ts);
    CREATE INDEX IF NOT EXISTS idx_signals_category ON signals(category);
    CREATE INDEX IF NOT EXISTS idx_prices_ts ON prices(ts);
    CREATE INDEX IF NOT EXISTS idx_prices_symbol ON prices(symbol);
    CREATE INDEX IF NOT EXISTS idx_markets_ts ON markets(ts);
    CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts);
    """)
    print(f"[DB] Initialized {DB_PATH}")

init_db()
