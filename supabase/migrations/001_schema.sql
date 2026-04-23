-- NEXUS Backend Schema v2
-- Run: supabase db push
-- Cron jobs are in GitHub Actions (.github/workflows/) — NOT pg_cron.
-- pg_cron + pg_net with current_setting() doesn't work on Supabase free tier.
-- GitHub Actions calls the Edge Functions directly via curl.

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Signals — every geospatial data point ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS signals (
  id          TEXT PRIMARY KEY,          -- contentId hash: type_<hash>
  type        TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'low',
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  name        TEXT,
  description TEXT,
  url         TEXT,
  source      TEXT,
  meta        JSONB DEFAULT '{}',
  fetched_at  TIMESTAMPTZ DEFAULT NOW(),
  event_date  TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  acpl_action TEXT DEFAULT 'surface_low',
  acpl_ce     DOUBLE PRECISION DEFAULT 0,
  acpl_risk_w DOUBLE PRECISION DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_signals_type     ON signals(type);
CREATE INDEX IF NOT EXISTS idx_signals_severity ON signals(severity);
CREATE INDEX IF NOT EXISTS idx_signals_fetched  ON signals(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_latlon   ON signals(lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signals_expires  ON signals(expires_at);

-- ── Articles — RSS content ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS articles (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title       TEXT NOT NULL,
  url         TEXT UNIQUE NOT NULL,
  source      TEXT,
  category    TEXT DEFAULT 'general',
  severity    TEXT DEFAULT 'low',
  region      TEXT,
  pub         TIMESTAMPTZ,
  fetched_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_fetched  ON articles(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_pub      ON articles(pub DESC);

-- ── Markets — Kalshi + Polymarket ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS markets (
  id          TEXT PRIMARY KEY,
  platform    TEXT NOT NULL,
  title       TEXT,
  probability DOUBLE PRECISION,
  volume      DOUBLE PRECISION,
  url         TEXT,
  category    TEXT DEFAULT 'general',
  is_geo      BOOLEAN DEFAULT FALSE,
  meta        JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ACPL — Q-table and CE network weights ────────────────────────────────────
CREATE TABLE IF NOT EXISTS acpl_qtable (
  state_key  TEXT PRIMARY KEY,
  q_suppress DOUBLE PRECISION DEFAULT 0.3,
  q_low      DOUBLE PRECISION DEFAULT 0.5,
  q_high     DOUBLE PRECISION DEFAULT 0.4,
  q_escalate DOUBLE PRECISION DEFAULT 0.2,
  visit_count INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acpl_ce_weights (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  weights     JSONB NOT NULL DEFAULT '{}',
  opt_state   JSONB DEFAULT '{}',
  replay_count INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acpl_replay (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  signal_snap JSONB NOT NULL,
  action      INTEGER NOT NULL,
  reward      DOUBLE PRECISION,
  was_negative BOOLEAN DEFAULT FALSE,
  delay_min   DOUBLE PRECISION DEFAULT 0,
  ts          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acpl_replay_ts ON acpl_replay(ts DESC);

-- ── VOX calibration ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vox_calibration (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  platt_a       DOUBLE PRECISION DEFAULT 1.0,
  platt_b       DOUBLE PRECISION DEFAULT 0.0,
  temperature   DOUBLE PRECISION DEFAULT 1.0,
  stack_weights JSONB DEFAULT '{}',
  round_count   INTEGER DEFAULT 0,
  brier_score   DOUBLE PRECISION,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vox_predictions (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  market_id    TEXT REFERENCES markets(id) ON DELETE CASCADE,
  probability  DOUBLE PRECISION,
  resolved     BOOLEAN,
  resolution   DOUBLE PRECISION,
  predicted_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

-- ── Ingest log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingest_log (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  run_at       TIMESTAMPTZ DEFAULT NOW(),
  duration_ms  INTEGER,
  signals_new  INTEGER DEFAULT 0,
  articles_new INTEGER DEFAULT 0,
  markets_new  INTEGER DEFAULT 0,
  acpl_updates INTEGER DEFAULT 0,
  errors       JSONB DEFAULT '[]',
  summary      JSONB DEFAULT '{}'
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE signals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE acpl_qtable     ENABLE ROW LEVEL SECURITY;
ALTER TABLE acpl_ce_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE acpl_replay     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vox_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE vox_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_log      ENABLE ROW LEVEL SECURITY;

-- Anon key: read-only on public data
CREATE POLICY "anon_read_signals"      ON signals         FOR SELECT USING (true);
CREATE POLICY "anon_read_articles"     ON articles        FOR SELECT USING (true);
CREATE POLICY "anon_read_markets"      ON markets         FOR SELECT USING (true);
CREATE POLICY "anon_read_acpl"         ON acpl_qtable     FOR SELECT USING (true);
CREATE POLICY "anon_read_vox"          ON vox_calibration FOR SELECT USING (true);
CREATE POLICY "anon_read_log"          ON ingest_log      FOR SELECT USING (true);

-- Service role: full write (used by Edge Functions)
CREATE POLICY "service_write_signals"  ON signals         FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_articles" ON articles        FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_markets"  ON markets         FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_acpl_q"   ON acpl_qtable     FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_acpl_ce"  ON acpl_ce_weights FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_acpl_rep" ON acpl_replay     FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_vox"      ON vox_calibration FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_vox_pred" ON vox_predictions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_log"      ON ingest_log      FOR ALL USING (auth.role() = 'service_role');

-- ── Cleanup function (called manually or via pg_cron if available) ────────────
CREATE OR REPLACE FUNCTION prune_expired()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM signals      WHERE expires_at < NOW();
  DELETE FROM acpl_replay  WHERE ts < NOW() - INTERVAL '7 days';
  DELETE FROM vox_predictions WHERE predicted_at < NOW() - INTERVAL '30 days' AND resolved IS NOT NULL;
  DELETE FROM ingest_log   WHERE run_at < NOW() - INTERVAL '3 days';
$$;
