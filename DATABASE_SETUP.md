# NEXUS Intelligence Platform — Database Setup

## Current Status

| Item | Value |
|------|-------|
| **Active DB** | SQLite (`nexus.db`) — 139KB |
| **PostgreSQL** | Not running |
| **Schema File** | `nexus_db_schema.sql` — complete |
| **DB Module** | `nexus_db.py` — auto-detects backend |

**PostgreSQL is NOT running locally.** The system falls back to SQLite automatically.

---

## Database Schema

### Core Intelligence Tables

| Table | Description | Key Columns |
|-------|-------------|-------------|
| `signals` | Intelligence signals (news events, threats, opportunities) | source, category, title, url, description, lat, lng, severity, tags, score, entity_type, country |
| `prices` | Financial price data | symbol, price, change_pct, volume |
| `markets` | Prediction market questions (Kalshi, Metaculus) | market_id, question, prob, volume, source, resolved |
| `predictions` | Model predictions vs actual outcomes | question_id, predicted_prob, actual_outcome, engine, confidence, evidence |
| `alerts` | Alert notifications | source, alert_type, title, detail, severity, lat, lng, resolved |
| `intel` | Query/intelligence lookup cache | query, result, source |
| `surveillance` | Surveillance zone data | source, surveillance_type, title, description, url, lat, lng, confidence, tags |

### App-Level Tables

| Table | Description | Key Columns |
|-------|-------------|-------------|
| `settings` | Key-value config store | key, value |
| `saved_articles` | User saved articles | id, article, saved_at |
| `watchlist` | User watchlist terms | term, added_at |
| `feed_cache` | RSS/API feed cache | url, data, cached_at |
| `situations` | User situations/notes | id, name, notes, created_at |
| `analytics` | Event tracking | event, data, ts |

### Indexes (PostgreSQL)

```
idx_signals_ts, idx_signals_category
idx_prices_ts, idx_prices_symbol
idx_markets_ts
idx_alerts_ts
idx_feed_cache_cached_at, idx_saved_articles_saved_at
idx_watchlist_added_at, idx_situations_created_at, idx_analytics_ts
```

---

## Switching to PostgreSQL

### 1. Start PostgreSQL

```bash
# Example with Docker
docker run -d \
  --name nexus-postgres \
  -e POSTGRES_DB=nexus \
  -e POSTGRES_USER=nexus_user \
  -e POSTGRES_PASSWORD=nexus_secure_pass_2024 \
  -p 5432:5432 \
  postgres:16-alpine
```

Or locally via `pg_ctl` or your system's service manager.

### 2. Create Database & Schema

```bash
# Connect as postgres superuser
psql -U postgres -c "CREATE USER nexus_user WITH PASSWORD 'nexus_secure_pass_2024';"
psql -U postgres -c "CREATE DATABASE nexus OWNER nexus_user;"
psql -U nexus_user -d nexus -f /home/workspace/nexus-vercel/server/nexus_db_schema.sql
```

### 3. Set Environment Variable

```bash
export DATABASE_URL="postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus"
```

### 4. Verify Connection

```bash
pg_isready -h localhost -p 5432
```

---

## Connection String Format

```
postgresql://username:password@host:port/database
```

**Current configured values:**
- Username: `nexus_user`
- Password: `nexus_secure_pass_2024`
- Host: `localhost`
- Port: `5432`
- Database: `nexus`

---

## Migrating SQLite → PostgreSQL

### Option A: Fresh schema (no data migration)

If you don't need existing data, simply set `DATABASE_URL` and restart the server. `init_db()` runs the `nexus_db_schema.sql` automatically on PostgreSQL connect.

### Option B: Export/Import with Python

```python
import sqlite3, psycopg2

sqlite_db = '/home/workspace/nexus-vercel/server/nexus.db'
pg_url = "postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus"

src = sqlite3.connect(sqlite_db)
dst = psycopg2.connect(pg_url)
dst.autocommit = True

tables = ['signals','prices','markets','predictions','alerts','intel','surveillance',
          'settings','saved_articles','watchlist','feed_cache','situations','analytics']

for table in tables:
    rows = src.execute(f"SELECT * FROM {table}").fetchall()
    cols = [desc[0] for desc in src.execute(f"PRAGMA table_info({table})").fetchall()]
    placeholders = ','.join(['%s'] * len(cols))
    for row in rows:
        dst.cursor().execute(
            f"INSERT INTO {table} ({','.join(cols)}) VALUES ({placeholders}) ON CONFLICT DO NOTHING",
            row
        )
    print(f"Migrated {len(rows)} rows to {table}")
```

---

## Environment Variable

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | Selects DB backend | Empty → SQLite |

**Values:**
- `unset` or `sqlite://...` → SQLite at `/home/workspace/nexus/nexus.db`
- `postgresql://...` → PostgreSQL

---

## For Production

1. **Use PostgreSQL** — set `DATABASE_URL` env var
2. **Run schema** — `psql -U nexus_user -d nexus -f nexus_db_schema.sql`
3. **Configure connection** — `postgresql://nexus_user:<password>@<host>:5432/nexus`
4. **Optional** — migrate existing SQLite data using the Python script above
5. **Health check** — the server's `GET /api/health` endpoint checks DB connectivity