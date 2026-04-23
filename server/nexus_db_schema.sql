-- NEXUS Intelligence Platform — PostgreSQL Schema
-- Run this file after creating the nexus database and user.
--
-- psql -U nexus_user -d nexus -f nexus_db_schema.sql

-- ============================================================================
-- Core Intelligence Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS signals (
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

CREATE TABLE IF NOT EXISTS prices (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    symbol TEXT,
    price REAL,
    change_pct REAL,
    volume REAL
);

CREATE TABLE IF NOT EXISTS markets (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    market_id TEXT UNIQUE,
    question TEXT,
    prob REAL,
    volume REAL,
    source TEXT,
    resolved INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS predictions (
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

CREATE TABLE IF NOT EXISTS alerts (
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

CREATE TABLE IF NOT EXISTS intel (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    query TEXT,
    result TEXT,
    source TEXT
);

CREATE TABLE IF NOT EXISTS surveillance (
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

-- ============================================================================
-- App-Level Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS saved_articles (
    id TEXT PRIMARY KEY,
    article TEXT,
    saved_at INTEGER
);

CREATE TABLE IF NOT EXISTS watchlist (
    term TEXT PRIMARY KEY,
    added_at INTEGER
);

CREATE TABLE IF NOT EXISTS feed_cache (
    url TEXT PRIMARY KEY,
    data TEXT,
    cached_at INTEGER
);

CREATE TABLE IF NOT EXISTS situations (
    id TEXT PRIMARY KEY,
    name TEXT,
    notes TEXT,
    created_at INTEGER
);

CREATE TABLE IF NOT EXISTS analytics (
    id SERIAL PRIMARY KEY,
    event TEXT,
    data TEXT,
    ts INTEGER
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals(ts);
CREATE INDEX IF NOT EXISTS idx_signals_category ON signals(category);
CREATE INDEX IF NOT EXISTS idx_prices_ts ON prices(ts);
CREATE INDEX IF NOT EXISTS idx_prices_symbol ON prices(symbol);
CREATE INDEX IF NOT EXISTS idx_markets_ts ON markets(ts);
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts);
CREATE INDEX IF NOT EXISTS idx_feed_cache_cached_at ON feed_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_saved_articles_saved_at ON saved_articles(saved_at);
CREATE INDEX IF NOT EXISTS idx_watchlist_added_at ON watchlist(added_at);
CREATE INDEX IF NOT EXISTS idx_situations_created_at ON situations(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_ts ON analytics(ts);

-- ============================================================================
-- Notes
-- ============================================================================
--
-- To switch from SQLite to PostgreSQL:
-- 1. Ensure PostgreSQL is running and the nexus database exists
-- 2. Run this schema file against it
-- 3. Export DATABASE_URL before starting the server:
--      export DATABASE_URL="postgresql://nexus_user:nexus_secure_pass_2024@localhost:5432/nexus"
-- 4. Optionally migrate existing data from nexus.db (see DATABASE_SETUP.md)
--