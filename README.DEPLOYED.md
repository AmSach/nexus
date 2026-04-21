# NEXUS Intelligence Platform v4.3.8 — DEPLOYMENT COMPLETE

## Live URLs

**Desktop (full resolution):** https://man44.zo.space/nexus

**Mobile (optimized):** https://man44.zo.space/nexus-mobile  

**Homepage:** https://man44.zo.space/

---

## API Endpoints (all live)

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `/api/satellite` | Global intel: aircraft, ships, earthquakes, fires, storms | ✅ LIVE |
| `/api/alerts` | Live alerts: NWS, GDACS, Oref, GPSJam, WHO, ProMED, Telegram | ✅ LIVE |
| `/api/signals` | Signals: satellites, sanctions, Reddit, RSS feeds, AISStream | ✅ LIVE |
| `/api/threats` | Threat intel: CVEs, CISA KEV, Abuse.ch, OTX, MITRE ATT&CK | ✅ LIVE |
| `/api/intel` | Entity intel: GDELT, Wikipedia, WikiData, OpenCorporates | ✅ LIVE |
| `/api/gdelt` | GDELT full-text search with 12-angle variants | ✅ LIVE |
| `/api/ingest` | Data ingestion: GLEIF, UN Comtrade, ECDC, ReliefWeb | ✅ LIVE |
| `/api/firms` | NASA FIRMS thermal anomalies in 28 conflict zones | ✅ LIVE |
| `/api/fred` | FRED macro data + conflict finance + stock quotes | ✅ LIVE |
| `/api/rss` | RSS/Atom parser + Telegram channel scraper | ✅ LIVE |
| `/api/kalshi` | Kalshi prediction markets | ✅ LIVE |
| `/api/polymarket` | Polymarket prediction markets | ✅ LIVE |

---

## Features Working

### Live Feed
- 218 RSS sources + NewsAPI + GNews
- Auto-refresh every 90s
- Severity classifier
- Watchlist alerts
- AI analysis per article (Groq)

### Intel Board
- SVG canvas with drag nodes
- Typed relationships
- Multi-board support
- Groq AI: full analysis, connection suggestions, timeline builder

### Threat Map (3D Globe)
- SVG world map with 15 live hotspots
- Zoom/pan navigation
- Add to board directly
- Aircraft, ships, earthquakes, fires, storms layers

### Markets
- Equities, Commodities, Crypto, FX
- Economic calendar
- Geopolitical-financial nexus notes

### Prediction Markets
- Kalshi + Polymarket live markets
- Resolution tracking for calibration

### Saved & Settings
- Bookmark articles (localStorage persistence)
- API key configuration
- Watchlist management

---

## Database Setup

PostgreSQL needs to be configured externally:
1. Go to [Settings > Advanced](/?t=settings&s=advanced)
2. Add `NEXUS_DATABASE_URL` secret with your PostgreSQL connection string

Schema available in: `/home/workspace/nexus/nexus_db_schema.sql`

---

## Mobile Optimization

The `/nexus-mobile` route serves a touch-optimized version with:
- Larger touch targets
- Single-column layout
- Bottom navigation
- Condensed panels

The `/nexus` route serves the full desktop experience.

---

## API Keys (all FREE tier — configure in Settings)

| Key | Source | Required |
|-----|--------|----------|
| Groq | console.groq.com | Recommended (AI features) |
| NewsAPI | newsapi.org | Optional |
| GNews | gnews.io | Optional |
| Alpha Vantage | alphavantage.co | Optional |
| ExchangeRate | exchangerate-api.com | Optional |

Keys stored in browser localStorage only. Never leave your device.

---

## Build Info

- **Version:** 4.3.8
- **Frontend:** React 18 + Vite + Tailwind CSS
- **State:** Zustand (persist)
- **AI:** Groq llama-3.3-70b-versatile (7-model fallback chain)
- **Build size:** 1.18 MB JS + 13.8 KB CSS (gzipped: 337 KB + 3.7 KB)
- **Deployed:** 2026-04-16