"""
NEXUS v4 Intelligence Platform — Unified Server
Supports both SQLite (development) and PostgreSQL (production).
DATABASE_URL env var selects the backend:
  unset or sqlite:// → SQLite at /home/workspace/nexus/nexus.db
  postgresql://...   → PostgreSQL connection
"""
import sqlite3, json, time, math, random, re, os
from datetime import datetime, timedelta
from typing import Optional

DATABASE_URL = os.environ.get("DATABASE_URL", "")
IS_PG = DATABASE_URL.startswith("postgresql://")

if IS_PG:
    import psycopg2
    import re as _re
    m = _re.match(r"postgresql://(.+?):(.+?)@(.+?):(\d+)/(.+)", DATABASE_URL)
    if not m:
        raise ValueError(f"Invalid DATABASE_URL: {DATABASE_URL}")
    _u, _p, _h, _pt, _db = m.groups()
    conn = psycopg2.connect(
        host=_h, port=int(_pt), user=_u, password=_p, dbname=_db,
        connection_factory=None
    )
    conn.autocommit = True
    print(f"[DB] PostgreSQL connected: {_db}@{_h}:{_pt}")
else:
    DB_PATH = "/home/workspace/nexus/nexus.db"
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA cache_size=-64000")
    print(f"[DB] SQLite connected: {DB_PATH}")

def _pg(val):
    """Convert Python value to PostgreSQL-compatible placeholder."""
    return val

def q(sql: str, params: tuple = ()):
    """Execute a query, using %s for PostgreSQL or ? for SQLite."""
    if IS_PG:
        sql = sql.replace("?", "%s")
    return conn.execute(sql, params)

def init_db():
    if IS_PG:
        with open("/home/workspace/nexus-vercel/server/nexus_db_schema.sql") as f:
            schema = f.read()
        with conn.cursor() as cur:
            cur.execute(schema)
        print("[DB] PostgreSQL schema applied from nexus_db_schema.sql")
    else:
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
        print(f"[DB] SQLite schema initialized")

init_db()
