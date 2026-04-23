# NEXUS Intelligence Platform — Database Setup

## Current Status

| Component | Status |
|-----------|--------|
| **Active DB** | SQLite (`nexus.db`) — PostgreSQL not running |
| **PostgreSQL** | ❌ Not running at `localhost:5432` |
| **.env configured** | ✅ `postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus` |
| **Schema file** | ❌ None exists (auto-generated in Python) |

**PostgreSQL fallback behavior:** If the `DATABASE_URL` env var is absent or unreachable, the server auto-falls back to SQLite. No manual switching needed.

---

## Database Paths

| File | Purpose |
|------|---------|
| `server/nexus.db` | Primary SQLite DB (actual data) |
| `server/nexus_db.py` | DB initialization + connection module |
| `.db.env` | PostgreSQL connection string (ignored currently — PG not running) |

---

## Schema (auto-created by `nexus_db.py`)

Tables are created with `CREATE TABLE IF NOT EXISTS` on startup. **No separate `.sql` schema file exists** — the schema lives in Python code.

### Core Intelligence Tables

| Table | Description | Key Columns |
|-------|-------------|-------------|
| `signals` | Intelligence signals (threats, geopolitical, market) | `source`, `category`, `title`, `url`, `description`, `lat/lng`, `severity`, `tags`, `score`, `entity_type`, `country` |
| `prices` | Price/volume data for trading symbols | `symbol`, `price`, `change_pct`, `volume` |
| `markets` | Prediction market questions (Kalshi, etc.) | `market_id` (UNIQUE), `question`, `prob`, `volume`, `source`, `resolved` |
| `predictions` | Model predictions vs actual outcomes | `question_id`, `predicted_prob`, `actual_outcome`, `engine`, `confidence`, `evidence` |
| `alerts` | Real-time alerts with geolocation | `source`, `alert_type`, `title`, `detail`, `severity`, `lat/lng`, `resolved` |
| `intel` | Cached intelligence query results | `query`, `result`, `source` |
| `surveillance` | Surveillance data (source, type, location, tags) | `source`, `surveillance_type`, `title`, `description`, `url`, `lat/lng`, `confidence`, `tags` |

### App-Level Tables (in `nexus.db`)

| Table | Description |
|-------|-------------|
| `settings` | Key-value app configuration |
| `saved_articles` | User-saved article IDs + content |
| `watchlist` | User watchlist terms |
| `feed_cache` | Cached RSS/feed responses (TTL-based) |
| `situations` | Named situation/incident tracking |
| `analytics` | Event tracking (page views, actions) |

### Indexes

```
idx_signals_ts, idx_signals_category
idx_prices_ts, idx_prices_symbol
idx_markets_ts
idx_alerts_ts
idx_feed_cache_cached_at, idx_saved_articles_saved_at
idx_watchlist_added_at, idx_situations_created_at, idx_analytics_ts
```

---

## Setting Up PostgreSQL (for production)

### 1. Install PostgreSQL

```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib
```

### 2. Create user + database

```bash
sudo -u postgres psql << 'EOF'
CREATE USER nexus_user WITH PASSWORD 'nexus_secure_pass_2024';
CREATE DATABASE nexus OWNER nexus_user;
GRANT ALL PRIVILEGES ON DATABASE nexus TO nexus_user;
EOF
```

### 3. Enable `.db.env` in server startup

Edit the startup command or `server.py` to load `.db.env`:

```python
import os
from dotenv import load_dotenv
load_dotenv("/home/workspace/nexus-vercel/.db.env")
```

Or export before running:
```bash
export DATABASE_URL="postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus"
python server/server.py
```

### 4. Create PostgreSQL schema

Since there's no `.sql` file, port the schema from `nexus_db.py` to SQL:

```sql
-- Signals table
CREATE TABLE signals (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT, category TEXT, title TEXT, url TEXT,
    description TEXT, lat REAL, lng REAL, severity TEXT,
    tags TEXT, score REAL DEFAULT 0, entity_type TEXT, country TEXT
);

-- Prices table
CREATE TABLE prices (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    symbol TEXT, price REAL, change_pct REAL, volume REAL
);

-- Markets table
CREATE TABLE markets (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    market_id TEXT UNIQUE, question TEXT, prob REAL,
    volume REAL, source TEXT, resolved INTEGER DEFAULT 0
);

-- Predictions table
CREATE TABLE predictions (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    question_id TEXT, predicted_prob REAL, actual_outcome INTEGER,
    resolved INTEGER DEFAULT 0, engine TEXT, confidence REAL, evidence TEXT
);

-- Alerts table
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT, alert_type TEXT, title TEXT, detail TEXT,
    severity TEXT, lat REAL, lng REAL, resolved INTEGER DEFAULT 0
);

-- Intel table
CREATE TABLE intel (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    query TEXT, result TEXT, source TEXT
);

-- Surveillance table
CREATE TABLE surveillance (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT, surveillance_type TEXT, title TEXT, description TEXT,
    url TEXT, lat REAL, lng REAL, confidence REAL, tags TEXT
);

-- Indexes
CREATE INDEX idx_signals_ts ON signals(ts);
CREATE INDEX idx_signals_category ON signals(category);
CREATE INDEX idx_prices_ts ON prices(ts);
CREATE INDEX idx_prices_symbol ON prices(symbol);
CREATE INDEX idx_markets_ts ON markets(ts);
CREATE INDEX idx_alerts_ts ON alerts(ts);
```

Save as `nexus_db_schema.sql` in `server/` for future reference.

---

## Migrating from SQLite → PostgreSQL

### Option A: Export/Import (quick)

```bash
# Export from SQLite
sqlite3 server/nexus.db .dump > nexus_backup.sql

# In PostgreSQL:
# psql -U nexus_user -d nexus -f nexus_backup.sql
# (Manual remapping of SQLite types to Postgres equivalents needed)
```

### Option B: Schema-first migration (recommended for production)

1. Stop the server
2. Create PostgreSQL schema using `nexus_db_schema.sql` above
3. Run a data migration script row-by-row (SQLite `INSERT` → PostgreSQL `INSERT`)
4. Update `nexus_db.py` to use `psycopg2` with the `DATABASE_URL`
5. Restart server with `DATABASE_URL` exported

### Option C: Dual-write during transition

Modify `nexus_db.py` to write to both SQLite and PostgreSQL simultaneously, then cut over once PostgreSQL is stable.

---

## Connection String Format

```
postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus
```

Format breakdown:
```
postgresql:// [user] : [password] @ [host] : [port] / [database]
```

For production, replace `localhost` with your DB host and use a stronger password.

---

## Missing / Needed Files

| File | Status | Action |
|------|--------|--------|
| `server/nexus_db_schema.sql` | ❌ Missing | **Create it** — the schema above |
| `server/.db.env` | ❌ Missing | Copy from `../.db.env` or create with `DATABASE_URL=` |
| `.db.env` | ✅ Exists at project root | Keep here; server must load it |

---

## Quick Start (current SQLite setup — works fine now)

```bash
# No changes needed — SQLite fallback is automatic
cd /home/workspace/nexus-vercel/server
python nexus_db.py   # initializes tables if not exist
python server.py     # starts server using SQLite
```

To monitor the SQLite DB:
```bash
sqlite3 server/nexus.db "SELECT COUNT(*) FROM signals;"
sqlite3 server/nexus.db ".tables"
```