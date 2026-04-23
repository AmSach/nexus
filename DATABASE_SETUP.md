# NEXUS Intelligence Platform — Database Setup

## Current Status

| Component | Status |
|-----------|--------|
| **Active DB** | SQLite (`nexus.db`) — PostgreSQL unavailable |
| **PostgreSQL** | Not running on `localhost:5432` |
| **Fallback** | Working — SQLite used automatically when Postgres is down |
| **DB Location** | `/home/workspace/nexus/nexus.db` |

---

## Database Connection

### SQLite (Active / Default)
```
/home/workspace/nexus/nexus.db
```
No credentials needed. WAL mode enabled for concurrent reads.

### PostgreSQL (Production Target)
```
postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus
```
Set via `DATABASE_URL` environment variable before starting the server.

---

## Schema Overview

### Core Intelligence Tables (both SQLite & PostgreSQL)

| Table | Purpose |
|-------|---------|
| `signals` | Geo-tagged intelligence signals — protests, disasters, military activity |
| `prices` | Crypto/fiat price data — symbol, price, change_pct, volume |
| `markets` | Prediction market questions (Kalshi, Metaculus) — question, prob, volume |
| `predictions` | Model predictions linked to market `question_id` |
| `alerts` | Alert feed with severity, location, resolved flag |
| `intel` | Query/result log for intelligence lookups |
| `surveillance` | Surveillance activity records — type, confidence, geo-tags |

### App-Level Tables (PostgreSQL only — not in SQLite init)

| Table | Purpose |
|-------|---------|
| `settings` | Key-value app settings |
| `saved_articles` | User saved articles cache |
| `watchlist` | Watchlist terms |
| `feed_cache` | Feed URL cache with TTL |
| `situations` | Named situation tracking |
| `analytics` | Event analytics log |

### Indexes
```
idx_signals_ts, idx_signals_category
idx_prices_ts, idx_prices_symbol
idx_markets_ts
idx_alerts_ts
idx_feed_cache_cached_at
idx_saved_articles_saved_at
idx_watchlist_added_at
idx_situations_created_at
idx_analytics_ts
```

---

## Switching SQLite → PostgreSQL

### 1. Start PostgreSQL
```bash
# Check if running
pg_isready -h localhost -p 5432

# Start PostgreSQL (system-dependent)
# e.g. docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=... postgres:16
# or systemctl start postgresql
```

### 2. Create Database & User
```sql
CREATE USER nexus_user WITH PASSWORD 'nexus_secure_pass_2024';
CREATE DATABASE nexus OWNER nexus_user;
GRANT ALL PRIVILEGES ON DATABASE nexus TO nexus_user;
```

### 3. Run Schema
```bash
psql -U nexus_user -d nexus -f /home/workspace/nexus-vercel/server/nexus_db_schema.sql
```

### 4. Export Connection String & Restart Server
```bash
export DATABASE_URL="postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus"
# Then restart the NEXUS server
```

---

## Data Migration (SQLite → PostgreSQL)

Once PostgreSQL is live, migrate existing data:

```python
import sqlite3, psycopg2

sqlite_db = "/home/workspace/nexus/nexus.db"
pg_conn = "postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus"

sqlite_conn = sqlite3.connect(sqlite_db)
pg_conn = psycopg2.connect(pg_conn)

tables = ["signals", "prices", "markets", "predictions", "alerts", "intel", "surveillance"]

for table in tables:
    rows = sqlite_conn.execute(f"SELECT * FROM {table}").fetchall()
    cols = [desc[0] for desc in sqlite_conn.execute(f"PRAGMA table_info({table})").fetchall()]
    placeholders = ",".join(["%s"] * len(cols))
    insert_sql = f"INSERT INTO {table} ({','.join(cols)}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
    
    with pg_conn.cursor() as cur:
        for row in rows:
            cur.execute(insert_sql, row)
    pg_conn.commit()
    print(f"Migrated {len(rows)} rows into {table}")
```

> **Note:** App-level tables (`settings`, `saved_articles`, `watchlist`, `feed_cache`, `situations`, `analytics`) exist only in PostgreSQL — no SQLite source data for those.

---

## Key Implementation Notes

- `nexus_db.py` — defines `init_db()` with inline SQLite CREATE TABLE statements. **Do not edit `DB_PATH`** without updating all references.
- `server.py` — uses raw `conn.execute()` with SQLite parameter substitution (`?`). Works with SQLite; requires **psycopg2** and PostgreSQL for the production backend.
- The `DATABASE_URL` from `.db.env` is the target — it's currently unused because PostgreSQL is not running.
- `nexus_db_schema.sql` is PostgreSQL-compatible and can be run idempotently (`CREATE TABLE IF NOT EXISTS`).

---

## Production Checklist

- [ ] PostgreSQL running on port `5432`
- [ ] Database `nexus` created with owner `nexus_user`
- [ ] Schema applied via `psql -f nexus_db_schema.sql`
- [ ] `DATABASE_URL` exported before server start
- [ ] `nexus_db.py` updated to use psycopg2 (or SQLAlchemy) instead of sqlite3
- [ ] Data migrated from `nexus.db`
- [ ] App-level tables populated if needed
- [ ] `nexus.db` backed up before switching