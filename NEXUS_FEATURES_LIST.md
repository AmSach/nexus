# NEXUS v4.3.8 — Feature Inventory

## Backend API Endpoints (12)

| Endpoint | File | Status | Description |
|----------|------|--------|-------------|
| `/api/satellite` | `api/satellite.js` | ✅ WORKING | God View — earthquakes, volcanoes, storms, aircraft, ships, FIRMS, conflicts |
| `/api/alerts` | `api/alerts.js` | ✅ WORKING | Live alerts: NWS, GDACS, USNI, Oref, GPSJam, WHO, ProMED, ECDC |
| `/api/signals` | `api/signals.js` | ✅ WORKING | SpaceTrack, AISStream, Reddit, OpenSanctions, OFAC, RSS aggregation |
| `/api/fred` | `api/fred.js` | ✅ WORKING | FRED macro, Yahoo Finance quotes, CoinGecko, FX rates, conflict indices |
| `/api/intel` | `api/intel.js` | ✅ WORKING | Entity search: Wikipedia, Wikidata, GDELT, OpenSanctions, IntelX*, VirusTotal* |
| `/api/gdelt` | `api/gdelt.js` | ✅ WORKING | GDELT article search + RSS aggregation |
| `/api/rss` | `api/rss.js` | ✅ WORKING | Server-side RSS proxy, 218 feeds, UA rotation |
| `/api/kalshi` | `api/kalshi.js` | ✅ WORKING | Kalshi prediction markets |
| `/api/polymarket` | `api/polymarket.js` | ✅ WORKING | Polymarket prediction markets |
| `/api/firms` | `api/firms.js` | ✅ WORKING | NASA FIRMS VIIRS thermal anomalies (18 conflict zones) |
| `/api/threats` | `api/threats.js` | ✅ WORKING | CISA KEV, NVD CVEs, Exploit-DB, Abuse.ch, OTX, Shodan |
| `/api/ingest` | `api/ingest.js` | ✅ WORKING | GLEIF, ByBit, UCDP conflict events |

*Requires user-provided API key (graceful degradation if missing)

## Frontend Tabs

| Tab | Component | Status |
|-----|-----------|--------|
| Feed | `LiveFeed.jsx` | ✅ WORKING |
| Feed Sidebar | `LiveFeedSidebar.jsx` | ✅ WORKING |
| Situations (AI) | `Situations.jsx` | ✅ WORKING |
| CII Dashboard | `CIIDashboard.jsx` | ✅ WORKING |
| Vox Simulator | `VoxSimulator.jsx` | ✅ WORKING |
| Intel Board | `IntelBoard.jsx` | ✅ WORKING |
| Intel Map | `IntelMap.jsx` | ✅ WORKING |
| Finance | `FinancePanel.jsx` | ✅ WORKING |
| GDELT Search | `GDELTSearch.jsx` | ✅ WORKING |
| View Mode | `ViewMode.jsx` | ✅ WORKING |
| Health Check | `HealthCheck.jsx` | ✅ WORKING |
| Saved | `SavedPanel.jsx` | ✅ WORKING |
| Settings | `SettingsPanel.jsx` | ✅ WORKING |
| NEXUSPredict | `NEXUSPredict.jsx` | ✅ WORKING |
| KalshiTicker | `KalshiTicker.jsx` | ✅ WORKING |
| TopBar | `TopBar.jsx` | ✅ WORKING |
| Sidebar | `Sidebar.jsx` | ✅ WORKING |

## Data Sources

| Source | Type | Status |
|--------|------|--------|
| USGS Earthquake | Free | ✅ WORKING |
| GVP Volcanoes | Free | ✅ WORKING |
| NOAA NHC | Free | ✅ WORKING |
| NWS Weather | Free | ✅ WORKING |
| GDACS | Free | ✅ WORKING |
| ReliefWeb | Free | ✅ WORKING |
| NASA FIRMS | **API Key** | ⚠️ Requires FIRMS_KEY env var |
| OpenSky ADS-B | Auth | ⚠️ Requires OPENSKY_USER/PASS or guest fallback |
| AISStream | **API Key** | ⚠️ Requires AISSTREAM_KEY env var |
| OpenSanctions | Free | ✅ WORKING |
| CISA KEV | Free | ✅ WORKING |
| NVD CVEs | Free | ✅ WORKING |
| Abuse.ch | Free | ✅ WORKING |
| MITRE ATT&CK | Free | ✅ WORKING |
| GDELT | Free | ✅ WORKING |
| CoinGecko | Free | ✅ WORKING |
| ExchangeRate.host | Free | ✅ WORKING |
| Kalshi | Free | ✅ WORKING |
| Polymarket | Free | ✅ WORKING |
| FRED | **API Key** | ⚠️ Requires FRED_API_KEY |
| Yahoo Finance | Free | ✅ WORKING |
| Stooq | Free | ✅ WORKING |
| Alpha Vantage | **API Key** | ⚠️ Optional |
| Wikipedia | Free | ✅ WORKING |
| Wikidata | Free | ✅ WORKING |
| WHO | Free | ✅ WORKING |
| ProMED | Free | ✅ WORKING |
| Liveuamap | Free | ✅ WORKING |
| Reddit | Free | ✅ WORKING |
| Telegram | Free | ✅ WORKING |
| SpaceTrack | **Auth** | ⚠️ Requires SPACETRACK credentials |

## Intelligence Algorithms

| Algorithm | Hook | Status |
|-----------|------|--------|
| Signal Convergence V4 | `useSignalConvergenceV4.js` | ✅ WORKING |
| Pattern of Life | `usePatternOfLife.js` | ✅ WORKING |
| Financial Conflict Index | `useConflictMarkets.js` | ✅ WORKING |
| CUSUM Change Detection | `useIntelAlgorithms.js` | ✅ WORKING |
| Bayesian Network | `useIntelAlgorithms.js` | ✅ WORKING |
| Poisson Clustering | `useIntelAlgorithms.js` | ✅ WORKING |
| Entity Link Scoring | `useIntelAlgorithms.js` | ✅ WORKING |
| GPS Jamming Detection | `useLiveAlerts.js` | ✅ WORKING |
| BGP Anomaly Detection | `useLiveAlerts.js` | ✅ WORKING |
| AIS Chokepoint Density | `useSatellite.js` | ✅ WORKING |

## Desktop Features

- 3D WebGL globe (Three.js) with 13 hotspot zones ✅
- 218+ RSS feeds with auto-translation ✅
- 51 Telegram channels (t.me scraper) ✅
- ADSB live aircraft WebSocket (browser-side) ✅
- Military warship registry tracking ✅
- Kalshi + Polymarket prediction markets ✅
- FRED economic indicators dashboard ✅
- Groq LLM briefings ✅
- GDELT full-text OSINT search ✅
- Entity intelligence board (multi-source) ✅
- 4-panel View Mode (theater display) ✅
- Multi-board support with drag nodes ✅
- SVG toolbar with layer toggles ✅

## Mobile Features

- 5-tab bottom navigation (Feed/Signals/AI/Map/Settings) ✅
- Pull-to-refresh on Feed ✅
- Touch-optimized scrolling ✅
- Safe-area-inset support ✅
- Mobile map (simplified 2D fallback for WebGL) ⚠️ NEEDS WORK
- Dynamic bundle loading ✅
- BottomNav with active indicator dot ✅

## Database (SQLite)

Tables: `signals` (45,310 rows), `alerts` (18,220 rows), `prices`, `markets`, `predictions`, `intel`, `surveillance`
Location: `/home/workspace/nexus/nexus.db`

## Infrastructure

- **Build**: Vite + React 18 + Tailwind CSS
- **State**: Zustand with localStorage persistence
- **Server**: Bun + Hono (server.js, 12 API routes unified)
- **Zo Space**: Assets at `/nexus/assets/`, routes at `/nexus`, `/nexus-desktop`, `/nexus-mobile`
- **GitHub**: `https://github.com/AmSach/nexus` (branch: clean)
- **Vercel**: Auto-deploys from GitHub on push
- **Hardcoded keys removed**: FIRMS, AISStream, OpenSky, Shodan, Alpha Vantage, VirusTotal, IntelX

## Deployment URLs

- Desktop: `https://man44.zo.space/nexus`
- Mobile: `https://man44.zo.space/nexus-mobile`
- API: `https://man44.zo.space/api/*`
