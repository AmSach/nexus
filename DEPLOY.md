# NEXUS Deploy — Exact Steps

## Prerequisites
- GitHub repo: `github.com/AmSach/nexus`
- Vercel account connected to that repo
- Supabase account (free tier works)

---

## Step 1 — Push to GitHub

```bash
git remote add origin https://github.com/AmSach/nexus.git
git branch -m main
git push -u origin main
```

---

## Step 2 — Supabase Setup

**2a. Create project** at supabase.com → New Project

**2b. Run the schema** — go to SQL Editor → paste contents of `supabase/migrations/001_schema.sql` → Run

**2c. Deploy Edge Functions**

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF   # from Supabase dashboard URL
supabase functions deploy ingest
supabase functions deploy acpl-engine
supabase functions deploy vox-engine
```

**2d. Set Edge Function secrets** (Supabase Dashboard → Edge Functions → Manage Secrets):

```
FIRMS_KEY  = 08be3187f8c1526e0fd30249ee2c3374
OTX_KEY    = fb9962a963a512fcfb63be7053b1f66ab3de6818d8bd2d5330510d0c1edea4a0
```

SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

---

## Step 3 — GitHub Secrets (for the cron workflows)

GitHub repo → Settings → Secrets → Actions → New secret:

```
SUPABASE_URL              = https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY = eyJ...  (from Supabase → Settings → API → service_role key)
```

This is what makes ingest actually run every minute.  
After pushing, go to GitHub → Actions tab — you should see the workflows trigger.  
Check the ingest workflow logs to confirm it's hitting the Edge Function.

---

## Step 4 — Vercel env vars

Vercel Dashboard → Project → Settings → Environment Variables:

```
VITE_SUPABASE_URL       = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY  = eyJ...  (from Supabase → Settings → API → anon/public key)
```

Redeploy (or Vercel auto-redeploys on env var change).

---

## Verify it's working

1. **GitHub Actions** → ingest workflow → should show HTTP 200 in logs
2. **Supabase** → Table Editor → `ingest_log` → should have rows within 1 minute of setup
3. **Supabase** → `signals` table → should have thousands of rows
4. **NEXUS app** → Health tab → signals coming from Supabase (instant, no 504s)

---

## Without Supabase

Everything still works — falls back to `/api/satellite` (legacy mode).  
Just don't set `VITE_SUPABASE_URL` and the app behaves exactly as before.

---

## Architecture

```
GitHub Actions (cron, every 1min)
  → POST /functions/v1/ingest
    → fetches: USGS, GDACS, FIRMS, NHC, WHO, ProMED, CISA, Feodo,
               OTX, GDELT, NWS, IAEA, ReliefWeb, Kalshi, Polymarket, 20 RSS feeds
    → runs ACPL on every signal (server-side matrix ML)
    → upserts to signals/markets/articles tables
    → logs to ingest_log

GitHub Actions (every 5min) → acpl-engine → SGD replay on CE weights
GitHub Actions (every 10min) → vox-engine → score all markets M1-M6

Client (browser)
  → reads signals from Supabase REST (10ms)  ← was /api/satellite (55s)
  → Realtime WebSocket: instant push on new inserts
  → ACPL client: loads CE weights from DB on mount, pushes updates back
  → VOX: loads calibration from DB on mount
  → useADSBLive: browser WebSocket for live aircraft (bypasses Vercel IP blocks)
  → Groq LLM: BYOK, user's key, client-side only
```
