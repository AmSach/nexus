# NEXUS Intelligence Platform — Database Setup Guide

## Current Status

| Item | Status |
|------|--------|
| **Active DB** | SQLite at `/home/workspace/nexus/nexus.db` |
| **PostgreSQL** | Not running (`pg_isready` no response) |
| **DB in server/** | `/home/workspace/nexus-vercel/server/nexus.db` (empty, 0 rows) |
| **Schema file** | `server/nexus_db_schema.sql` ✅ exists |

---

## Database Architecture

### Primary DB Location
```
/home/workspace/nexus/nexus.db   ← production SQLite (active, has data)
/home/workspace/nexus-vercel/server/nexus.db  ← secondary (empty, not used by server)
```

The FastAPI server (`server.py`) imports `conn` from `nexus_db.py` which hardcodes:
```python
DB_PATH = "/home/workspace/nexus/nexus.db"
```

### How DB Connection Works

`nexus_db.py` sets up a single shared SQLite connection:
```python
DB_PATH = "/home/workspace/nexus/nexus.db"
conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
conn.execute("PRAGMA journal_mode=WAL")  # Write-Ahead Logging
conn.execute("PRAGMA cache_size=-64000")  # 64MB cache
```

`server.py` imports this conn and uses it directly for all queries. No connection pooling, no ORM.

---

## Tables & Schema

### Core Intelligence Tables (initialized in `nexus_db.py`)

| Table | Columns | Indexes | Description |
|-------|---------|---------|-------------|
| `signals` | id, ts, source, category, title, url, description, lat, lng, severity, tags, score, entity_type, country | idx_signals_ts, idx_signals_category | OSINT signals: Reddit, RSS, SpaceTrack, AIS, sanctions |
| `prices` | id, ts, symbol, price, change_pct, volume | idx_prices_ts, idx_prices_symbol | Stock/commodity price data |
| `markets` | id, ts, market_id UNIQUE, question, prob, volume, source, resolved | idx_markets_ts | Kalshi + Polymarket prediction markets |
| `predictions` | id, ts, question_id, predicted_prob, actual_outcome, resolved, engine, confidence, evidence | — | ACPL + VOX engine predictions |
| `alerts` | id, ts, source, alert_type, title, detail, severity, lat, lng, resolved | idx_alerts_ts | NWS, GDACS, Oref, GPSJam, WHO, ProMED alerts |
| `intel` | id, ts, query, result, source | — | Entity intelligence query cache |
| `surveillance` | id, ts, source, surveillance_type, title, description, url, lat, lng, confidence, tags | — | Aircraft/ship surveillance data |

### App-Level Tables (defined in `nexus_db_schema.sql` but NOT initialized by `nexus_db.py`)

| Table | Primary Key | Description |
|-------|-------------|-------------|
| `settings` | key (TEXT) | Key-value app settings |
| `saved_articles` | id (TEXT) | User bookmarks |
| `watchlist` | term (TEXT) | Search term monitoring |
| `feed_cache` | url (TEXT) | RSS feed cache |
| `situations` | id (TEXT) | AI-generated situation briefings |
| `analytics` | id (SERIAL) | Event tracking |

### Current Data Counts (from `/home/workspace/nexus/nexus.db`)
```
signals:      ~29,000 rows
alerts:       ~6,800 rows
markets:      ~31 rows
prices:       ~0 rows
predictions:  ~0 rows
intel:        ~0 rows
surveillance: ~0 rows
```

---

## PostgreSQL Setup (Production Path)

### Why PostgreSQL?

SQLite is fine for single-server development but:
- **No concurrent writes** — scraper + API conflicts
- **No replication** — single point of failure
- **No connection pooling** — scales poorly
- **WAL mode helps** but still single-threaded writer

PostgreSQL is the production target.

### Prerequisites

```bash
# Check if PostgreSQL is available
pg_isready -h localhost -p 5432

# If not running, install and start (Debian/Ubuntu)
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql   # or: pg_ctlcluster 16 main start
sudo systemctl enable postgresql
```

### Setup Steps

**1. Create database and user:**

```bash
sudo -u postgres psql << 'EOF'
CREATE USER nexus_user WITH PASSWORD 'nexus_secure_pass_2024';
CREATE DATABASE nexus OWNER nexus_user;
GRANT ALL PRIVILEGES ON DATABASE nexus TO nexus_user;
EOF
```

**2. Run the schema file:**

```bash
psql -U nexus_user -d nexus -h localhost -f /home/workspace/nexus-vercel/server/nexus_db_schema.sql
```

Or manually:
```bash
psql -U nexus_user -d nexus -h localhost -c "
CREATE TABLE IF NOT EXISTS signals (...);
-- (paste full schema from nexus_db_schema.sql)
"
```

**3. Configure connection:**

Create `.db.env` in `/home/workspace/nexus-vercel/server/`:
```
DATABASE_URL=postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus
```

Or export before starting server:
```bash
export DATABASE_URL="postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus"
python server.py
```

### Connection String Format

```
postgresql://[user]:[password]@[host]:[port]/[database]

Example:
postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus
```

For remote PostgreSQL:
```
postgresql://user:pass@your-postgres-host.com:5432/nexus
```

---

## SQLite → PostgreSQL Migration

### Option 1: Fresh Start (recommended for production)
1. Provision PostgreSQL database
2. Run `nexus_db_schema.sql`
3. Start scraper — new data fills PostgreSQL
4. Old SQLite data remains in `nexus.db` as backup

### Option 2: Dump & Restore

```bash
# Export SQLite to SQL
sqlite3 /home/workspace/nexus/nexus.db .dump > nexus_backup.sql

# Convert SQLite dump to PostgreSQL-compatible SQL
# (requires manual cleanup of SQLite-specific syntax)

# Import to PostgreSQL
psql -U nexus_user -d nexus -h localhost -f converted_dump.sql
```

**Key conversion issues:**
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `REAL` → `DOUBLE PRECISION` or `REAL`
- `TEXT` → `TEXT` (same)
- `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` → `TIMESTAMP DEFAULT NOW()`
- Remove `sqlite_sequence` table
- Remove SQLite-specific indexes that PostgreSQL handles automatically

### Option 3: Python Script Migration

Create `migrate_to_pg.py`:
```python
import sqlite3, psycopg2, os

sqlite_path = "/home/workspace/nexus/nexus.db"
pg_url = os.environ["DATABASE_URL"]

# Parse connection string
import re
m = re.match(r'postgresql://(.+):(.+)@(.+):(\d+)/(.+)', pg_url)
user, pass_, host, port, db = m.groups()

pg = psycopg2.connect(host=host, port=port, user=user, password=pass_, dbname=db)

sqlite_conn = sqlite3.connect(sqlite_path)
cur = sqlite_conn.cursor()
pg_cur = pg.cursor()

# Migrate signals table as example
cur.execute("SELECT * FROM signals LIMIT 10")
cols = [desc[0] for desc in cur.description]

for row in cur:
    placeholders = ','.join(['%s'] * len(cols))
    pg_cur.execute(f"INSERT INTO signals ({','.join(cols)}) VALUES ({placeholders}) ON CONFLICT DO NOTHING", row)

pg.commit()
```

### Option 4: Dual-Write Mode (gradual migration)

Modify `nexus_db.py` to write to both SQLite and PostgreSQL:
```python
import sqlite3, psycopg2, os

# SQLite (local)
sqlite_conn = sqlite3.connect("/home/workspace/nexus/nexus.db", check_same_thread=False)
sqlite_conn.isolation_level = None
sqlite_conn.execute("PRAGMA journal_mode=WAL")

# PostgreSQL (if available)
DATABASE_URL = os.environ.get("DATABASE_URL")
pg_conn = None
if DATABASE_URL:
    import re
    m = re.match(r'postgresql://(.+):(.+)@(.+):(\d+)/(.+)', DATABASE_URL)
    if m:
        pg_conn = psycopg2.connect(
            host=m.group(3), port=m.group(4),
            user=m.group(1), password=m.group(2), dbname=m.group(5)
        )

def write(row, table):
    sqlite_conn.execute(f"INSERT INTO {table} ...", row)
    if pg_conn:
        pg_conn.execute(f"INSERT INTO {table} ...", row)
```

---

## Modifying `nexus_db.py` for PostgreSQL Support

The current `nexus_db.py` uses SQLite-only syntax. To support PostgreSQL:

### Required Changes

1. **Detect backend from env var:**
```python
import os

DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    # Use PostgreSQL
    import psycopg2
    import re
    m = re.match(r'postgresql://(.+):(.+)@(.+):(\d+)/(.+)', DATABASE_URL)
    conn = psycopg2.connect(
        host=m.group(3), port=int(m.group(4)),
        user=m.group(1), password=m.group(2), dbname=m.group(5)
    )
    IS_PG = True
else:
    # Fallback to SQLite
    DB_PATH = "/home/workspace/nexus/nexus.db"
    import sqlite3
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    IS_PG = False
```

2. **Fix `init_db()` for both backends:**
```python
def init_db():
    if IS_PG:
        # Run the full schema (already compatible)
        pass  # schema already applied via psql
    else:
        conn.executescript("""...""")  # existing SQLite init
```

3. **Replace `conn.execute` parameter style:**
   - SQLite uses `?` placeholders
   - PostgreSQL uses `%s` placeholders
```python
def q(sql, params, conn=conn):
    if IS_PG:
        # PostgreSQL
        return conn.execute(sql.replace('?', '%s'), params)
    else:
        # SQLite
        return conn.execute(sql, params)
```

4. **Handle SERIAL / AUTOINCREMENT:**
   - In PostgreSQL, `id` is generated by the DB via `SERIAL`
   - In SQLite, `id` is generated by `AUTOINCREMENT`
   - Return `INSERT ... RETURNING id` for PostgreSQL inserts

5. **Fix WAL pragma — PostgreSQL doesn't need it:**
```python
if not IS_PG:
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA cache_size=-64000")
```

---

## Missing Schema Components

### 1. App-Level Tables Not Initialized

`nexus_db.py`'s `init_db()` only creates the 7 core tables. The app-level tables (`settings`, `watchlist`, `feed_cache`, `situations`, `analytics`, `saved_articles`) are defined in `nexus_db_schema.sql` but never created if you only run the Python init.

**Fix:** Either:
- Run `nexus_db_schema.sql` manually against PostgreSQL
- Add the app-level table creation to `nexus_db.py`'s `init_db()`
- Import the full schema on startup

### 2. No Foreign Keys or Constraints

The schema has no foreign key constraints, no NOT NULL enforcement, no CHECK constraints. Data integrity is application-level only.

### 3. No Migration Script

No version tracking, no Alembic-style migrations. Schema changes require manual SQL.

### 4. No Connection Pooling

SQLite uses a single global connection. PostgreSQL would benefit from `psycopg2.pool.ThreadedConnectionPool`.

---

## Production Checklist

- [ ] PostgreSQL installed and running
- [ ] `nexus` database created with `nexus_user` owner
- [ ] `nexus_db_schema.sql` applied to PostgreSQL
- [ ] `DATABASE_URL` env var set before starting server
- [ ] `nexus_db.py` updated with dual-backend support
- [ ] `server.py` updated to use PostgreSQL connection
- [ ] Old SQLite data migrated (if needed)
- [ ] `nexus_db.py`'s `init_db()` updated to create all 13 tables
- [ ] Connection pooling configured for PostgreSQL
- [ ] WAL mode disabled for PostgreSQL (not needed)
- [ ] Credentials stored in `.db.env` (gitignored)

---

## Quick Reference

```bash
# Check SQLite data
sqlite3 /home/workspace/nexus/nexus.db "SELECT COUNT(*) FROM signals"

# Check PostgreSQL
pg_isready -h localhost -p 5432
psql -U nexus_user -d nexus -h localhost -c "SELECT COUNT(*) FROM signals"

# Start server with PostgreSQL
export DATABASE_URL="postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus"
python /home/workspace/nexus/server/server.py

# Check which DB is active
grep "DB_PATH" /home/workspace/nexus/server/nexus_db.py
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `server/nexus_db.py` | SQLite connection + init (Python module imported by server.py) |
| `server/nexus_db_schema.sql` | PostgreSQL schema (full SQL, run manually against PG) |
| `server/server.py` | FastAPI server, uses `from nexus_db import conn, init_db` |
| `/home/workspace/nexus/nexus.db` | **Production SQLite DB** (active, has data) |
| `server/nexus.db` | Secondary SQLite (empty, not used) |