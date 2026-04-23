# NEXUS Intelligence Platform — Database Setup

## Current Status

| Item | Status |
|------|--------|
| **Database Engine** | SQLite (fallback) |
| **DB Path** | `/home/workspace/nexus/nexus.db` |
| **PostgreSQL** | Not running |
| **Schema File** | None (defined in `nexus_db.py`) |

---

## Database Schema

All tables are created via `nexus_db.py::init_db()`.

### Table: `signals`
Geopolitical/information signals from various sources.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `ts` | TIMESTAMP | Record timestamp |
| `source` | TEXT | Signal source name |
| `category` | TEXT | Category (e.g. conflict, diplomatic, economic) |
| `title` | TEXT | Signal title |
| `url` | TEXT | Source URL |
| `description` | TEXT | Full description |
| `lat` | REAL | Latitude |
| `lng` | REAL | Longitude |
| `severity` | TEXT | Severity level |
| `tags` | TEXT | Comma-separated tags |
| `score` | REAL | Computed score (default 0) |
| `entity_type` | TEXT | Type of entity |
| `country` | TEXT | Country code |

**Indexes**: `idx_signals_ts`, `idx_signals_category`

---

### Table: `prices`
Financial asset prices.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `ts` | TIMESTAMP | Record timestamp |
| `symbol` | TEXT | Ticker symbol |
| `price` | REAL | Current price |
| `change_pct` | REAL | % change |
| `volume` | REAL | Volume |

**Indexes**: `idx_prices_ts`, `idx_prices_symbol`

---

### Table: `markets`
Prediction market questions (Kalshi-style).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `ts` | TIMESTAMP | Record timestamp |
| `market_id` | TEXT UNIQUE | Unique market ID |
| `question` | TEXT | Market question |
| `prob` | REAL | Probability (0-1) |
| `volume` | REAL | Market volume |
| `source` | TEXT | Source (e.g. Kalshi) |
| `resolved` | INTEGER | 1 if resolved |

**Indexes**: `idx_markets_ts`

---

### Table: `predictions`
Prediction tracking and outcomes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `ts` | TIMESTAMP | Record timestamp |
| `question_id` | TEXT | FK to markets.market_id |
| `predicted_prob` | REAL | Predicted probability |
| `actual_outcome` | INTEGER | 1/0 outcome |
| `resolved` | INTEGER | 1 if resolved |
| `engine` | TEXT | Engine used (e.g. gpt4) |
| `confidence` | REAL | Confidence score |
| `evidence` | TEXT | Evidence text |

---

### Table: `alerts`
Active alerts with geospatial data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `ts` | TIMESTAMP | Record timestamp |
| `source` | TEXT | Alert source |
| `alert_type` | TEXT | Type of alert |
| `title` | TEXT | Alert title |
| `detail` | TEXT | Full details |
| `severity` | TEXT | Severity (critical/high/medium/low) |
| `lat` | REAL | Latitude |
| `lng` | REAL | Longitude |
| `resolved` | INTEGER | 1 if resolved |

**Indexes**: `idx_alerts_ts`

---

### Table: `intel`
General intelligence queries and results.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `ts` | TIMESTAMP | Record timestamp |
| `query` | TEXT | User query |
| `result` | TEXT | Result text |
| `source` | TEXT | Source system |

---

### Table: `surveillance`
Mass surveillance program data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `ts` | TIMESTAMP | Record timestamp |
| `source` | TEXT | Source (e.g. The Intercept) |
| `surveillance_type` | TEXT | Type of program |
| `title` | TEXT | Title |
| `description` | TEXT | Description |
| `url` | TEXT | Source URL |
| `lat` | REAL | Latitude |
| `lng` | REAL | Longitude |
| `confidence` | REAL | Confidence score |
| `tags` | TEXT | Comma-separated tags |

---

## PostgreSQL Setup (Production)

### Prerequisites

PostgreSQL must be installed and running. The recommended connection string format:

```
postgresql://<user>:<password>@<host>:<port>/<database>
```

### Step 1: Install PostgreSQL

```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib

# Start service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Step 2: Create Database and User

```bash
sudo -u postgres psql <<EOF
CREATE USER nexus_user WITH PASSWORD 'nexus_secure_pass_2024';
CREATE DATABASE nexus OWNER nexus_user;
GRANT ALL PRIVILEGES ON DATABASE nexus TO nexus_user;
EOF
```

### Step 3: Create Schema File

Save as `nexus_db_schema.sql`:

```sql
-- NEXUS Intelligence Platform — PostgreSQL Schema

CREATE TABLE signals(
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT,
    category TEXT,
    title TEXT,
    url TEXT,
    description TEXT,
    lat REAL,
    lng REAL,
    severity TEXT,
    tags TEXT,
    score REAL DEFAULT 0,
    entity_type TEXT,
    country TEXT
);

CREATE TABLE prices(
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    symbol TEXT,
    price REAL,
    change_pct REAL,
    volume REAL
);

CREATE TABLE markets(
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    market_id TEXT UNIQUE,
    question TEXT,
    prob REAL,
    volume REAL,
    source TEXT,
    resolved INTEGER DEFAULT 0
);

CREATE TABLE predictions(
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    question_id TEXT,
    predicted_prob REAL,
    actual_outcome INTEGER,
    resolved INTEGER DEFAULT 0,
    engine TEXT,
    confidence REAL,
    evidence TEXT
);

CREATE TABLE alerts(
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT,
    alert_type TEXT,
    title TEXT,
    detail TEXT,
    severity TEXT,
    lat REAL,
    lng REAL,
    resolved INTEGER DEFAULT 0
);

CREATE TABLE intel(
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    query TEXT,
    result TEXT,
    source TEXT
);

CREATE TABLE surveillance(
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT,
    surveillance_type TEXT,
    title TEXT,
    description TEXT,
    url TEXT,
    lat REAL,
    lng REAL,
    confidence REAL,
    tags TEXT
);

-- Indexes
CREATE INDEX idx_signals_ts ON signals(ts);
CREATE INDEX idx_signals_category ON signals(category);
CREATE INDEX idx_prices_ts ON prices(ts);
CREATE INDEX idx_prices_symbol ON prices(symbol);
CREATE INDEX idx_markets_ts ON markets(ts);
CREATE INDEX idx_alerts_ts ON alerts(ts);
```

### Step 4: Apply Schema

```bash
PGPASSWORD=nexus_secure_pass_2024 psql -h localhost -U nexus_user -d nexus -f nexus_db_schema.sql
```

### Step 5: Environment Configuration

Create `server/.db.env`:

```env
DATABASE_URL=postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus
```

---

## SQLite to PostgreSQL Migration

### Option 1: Full Export/Import

```bash
# Export from SQLite
sqlite3 /home/workspace/nexus/nexus.db .dump > nexus_backup.sql

# For each table, run in PostgreSQL:
# (Requires manual conversion of SQLite syntax to PostgreSQL)
```

### Option 2: Application-Level Migration

Modify `nexus_db.py` to support both engines:

```python
import os
import sqlite3
import psycopg2
from contextlib import contextmanager

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # PostgreSQL
    import psycopg2
    from psycopg2.extras import RealDictCursor
    
    def get_pg_conn():
        return psycopg2.connect(DATABASE_URL)
    
    def init_db():
        with get_pg_conn() as conn:
            with conn.cursor() as cur:
                # PostgreSQL schema here
                pass
else:
    # SQLite fallback
    DB_PATH = "/home/workspace/nexus/nexus.db"
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
    # ... existing code ...
```

---

## Connection String Format

```
postgresql://username:password@hostname:port/database
```

**Examples:**
- Local: `postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus`
- Production: `postgresql://user:pass@prod-host.com:5432/nexus_prod`

---

## Production Checklist

- [ ] PostgreSQL installed and running
- [ ] `nexus_user` created with proper permissions
- [ ] `nexus` database created
- [ ] Schema applied (`nexus_db_schema.sql`)
- [ ] `DATABASE_URL` set in environment
- [ ] Connection verified
- [ ] SQLite data migrated (if applicable)
- [ ] Application restarted
