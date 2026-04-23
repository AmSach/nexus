# NEXUS Intelligence Platform — Feature Inventory

## Backend API Endpoints (12)

### `/api/satellite` — God View
Real-time global intelligence aggregation. Primary sources:
- **USGS** earthquakes (M1.5+ weekly GeoJSON)
- **IRIS** seismic network (M4.5+)
- **GVP** Smithsonian active volcanoes
- **NOAA NHC** tropical storm tracks
- **NWS** weather alerts (US)
- **GDACS** disaster RSS feed
- **ReliefWeb** humanitarian crises (UN)
- **DFO** Dartmouth Flood Observatory
- **OpenSky Network** ADS-B aircraft (12 strategic zones, hardcoded auth)
- **MarineCadastre** US AIS ship tracking
- **Digitraffic** Finnish AIS (Baltic)
- **UCDP** Uppsala Conflict Data Program
- **NASA FIRMS** VIIRS global fires + 18 conflict zones
- **EONET** NASA natural events
- **ACLED** armed conflict events
- **GPSJam** GPS jamming detection
- **OpenSanctions** 1M+ sanctioned entities
- **OpenStreetMap** military infrastructure
- **Telegram OSINT** (36 public channels)
- **Fleet Registry** warship positions (hardcoded 19 vessels)
- **OpenAQ** air quality locations
- **Solar X-ray flux** (NOAA SWPC)
- **Celestrak** satellite conjunctions
- **ESA DISCOS** space debris
- **CelesTrak** ISS position + launches
- **NASA Earthdata** VIIRS global thermal
- **OpenSanctions API** entities
- **Wikipedia** conflict zone edits
- **GDELT** conflict events
- **Bing News** airspace closures
- **NOTAMs** ICAO/FAA
- **BGP** BGP route anomalies
- **SpaceTrack** orbital catalog
- **Hoppie ACARS** oceanic aircraft
- **EU CORDIS** defense projects
- **ArmsTransfer** signals
- **Wikidata** conflict items
- **Wikipedia** conflict edits
- **OpenNotify** ISS position
- **Telegram** military news

### `/api/alerts` — Live Alerts
- **NWS** weather alerts
- **GDACS** disaster RSS
- **USNI** fleet tracker RSS
- **Israel Oref** red alert API (with 6 fallback endpoints)
- **GPSJam** jamming detection
- **WHO** disease outbreak RSS
- **ProMED** infectious disease RSS
- **ECDC** disease surveillance
- **Cloudflare Radar** internet outages
- **BNO News** breaking news
- **Liveuamap** conflict zone feeds
- **Crisis24/OSAC** security alerts
- **NewsData** conflict news
- **Reddit** conflict signals
- **Wikipedia** edit monitoring
- **NOTAMs** airspace closures
- **BGP** route anomalies
- **Telegram** OSINT channels
- **Planet Labs** satellite imagery
- **NASA EONET** events
- **Cloudflare** internet outages

### `/api/signals` — Signal Intelligence
- **SpaceTrack** TLE orbital catalog (auth or CelesTrak fallback)
- **CelesTrak** satellite positions + conjunctions
- **Hoppie ACARS** oceanic position reports
- **Reddit** breaking news (10 subreddits)
- **50+ RSS** intelligence feeds (government, threat intel, geopolitical, conflict)
- **OpenSanctions** sanctioned entities
- **OFAC** SDN list
- **GDELT GKG** feed
- **OSM Overpass** military bases
- **ByBit** funding rate (war premium indicator)
- **AISStream** WebSocket (REST fallback: MarineCadastre)
- **TinyFish AI** web scraper (optional)
- **Modes:** `sanctions`, `military-infra`, `scrape`, `crypto-war`

### `/api/fred` — Financial Intelligence
- **Yahoo Finance** quote API
- **Alpha Vantage** batch quotes
- **Twelve Data** quote API
- **Stooq** EU market data
- **FMP** FinancialModelingPrep
- **ExchangeRate.host** currency rates (UAH, ILS, RUB, IRR, PKR, etc.)
- **CoinGecko** crypto prices
- **Yahoo Finance chart** OHLCV history
- **Conflict Financial Index (FCI)** composite score
- **Defense stocks:** LMT, RTX, NOC, BA, GD, KTOS, HII, AXON
- **Commodities:** WTI, Gold, NatGas, Wheat, Copper
- **War currencies** with 30-day trend
- **Crypto capital flight** monitoring
- **Modes:** `conflict`, `history`, `multi`, `quote`

### `/api/intel` — Entity Intelligence Engine
Multi-source entity investigation:
- **Wikipedia** summary + links + categories
- **Wikidata** entity graph (birth/death, positions, memberships, sanctions)
- **GDELT** article search (12 query variants, timeline)
- **Google News** RSS
- **Bing News** RSS
- **OpenSanctions** sanctions search
- **OFAC** Treasury sanctions
- **Interpol** notices
- **US Courts** PACER (civil/criminal)
- **US Dockets** CourtListener
- **Company registries:** US (SEC EDGAR), UK (Companies House), India (MCA), UAE, Panama, Cyprus, Malta, Netherlands, Denmark, France
- **Officerships:** US, UK, Cyprus, Netherlands
- **ICIJ Offshore** leaks
- **SEC EDGAR** full-text search
- **FEC** campaign finance
- **World Bank** debarred firms
- **DocumentCloud** document search
- **OCCRP Aleph** investigations
- **OpenStreetMap/Nominatim** locations
- **IntelX** document search
- **VirusTotal** IP/domain search
- **HaveIBeenPwned** breach search
- **Hunter.io** email discovery
- **URLscan** domain scanning
- **LeakIX** exposed services
- **GreyNoise** IP context
- **ThreatFox** IOC database
- **RDAP/WHOIS** domain registration
- **EmailRep** email reputation
- **AbuseIPDB** IP reputation
- **SecurityTrails** DNS subdomains
- **Dehashed** data breach search
- **Wigle** WiFi geolocation
- **DocSearch** panel (IntelX bypass)

### `/api/threats` — Cyber Threat Intelligence
- **CISA KEV** known exploited vulnerabilities (200 entries)
- **NVD** CVE database (90-day CRITICAL/HIGH)
- **Exploit-DB** published exploits RSS
- **OSV.dev** open source vulnerabilities
- **Vulhub** Chinese vuln feed
- **CISA Alerts** RSS
- **Abuse.ch Feodo Tracker** botnet C2 servers
- **Abuse.ch URLhaus** malicious URLs (200)
- **Abuse.ch MalwareBazaar** malware samples
- **OTX AlienVault** threat pulses
- **GreyNoise** community stats + tags
- **SpamHaus DROP** blocklist
- **PhishTank** phishing URLs
- **MITRE ATT&CK** technique database
- **OpenPhish** phishing feed
- **Shodan InternetDB** exposed services
- **Censys** anomalous hosts
- **BinaryEdge** exposed services
- **Exposed Infrastructure** composite view

### `/api/firms` — FIRMS Thermal Anomalies
18 conflict zones monitored:
Ukraine/Donbas, Gaza, Lebanon, Syria, Yemen, Sudan, Myanmar, Sahel, Ethiopia, DRC, Iran, Pakistan, Somalia, Nigeria, Libya, Afghanistan, Iraq, Mozambique (+ 11 more)
- **VIIRS SNPP/NOAA20/NOAA21** (NRT)
- **MODIS** (NRT)
- Severity scoring, dedup, high-confidence filtering

### `/api/gdelt` — GDELT Article Search
- Multi-variant query (general, exact, broad, crime, legal, sanctions, financial, network, military, death, WMD, cyber)
- Timeline volume
- Tone-sorted (controversy signal)
- Passthrough mode for pre-built URLs

### `/api/rss` — RSS/Atom Feed Proxy
- RSS 2.0, Atom 1.0, JSON Feed parsers
- Telegram t.me/s/ scraper
- User-Agent rotation
- CORS bypass via direct server fetch
- 218 feeds in production

### `/api/kalshi` — Prediction Markets
- Live open markets (500 limit)
- Polymarket API proxy
- Recently resolved markets (ground truth calibration)

### `/api/ingest` — Supplemental Data
- GLEIF LEI legal entity lookup
- ByBit BTC/ETH/USDT quotes
- UCDP conflict events

## Frontend Tabs/Components

| Tab | Component | Description |
|-----|-----------|-------------|
| Feed | `LiveFeed.jsx` | Live RSS + GDELT + API news, auto-translate |
| Feed | `LiveFeedSidebar.jsx` | Category sidebar |
| Feed | `GDELTSearch.jsx` | GDELT OSINT search (2,368 lines) |
| Feed | `Situations.jsx` | Conflict zone tracker |
| Feed | `VoxSimulator.jsx` | Geopolitical forecast terminal |
| Feed | `CIIDashboard.jsx` | Critical Infrastructure Intelligence |
| Board | `IntelBoard.jsx` | Entity relationship graph (1,715 lines) |
| Map | `IntelMap.jsx` | 3D WebGL globe (Three.js), 13 static hotspots |
| View | `ViewMode.jsx` | 4-panel theater display (24/7 TV mode) |
| Finance | `FinancePanel.jsx` | FRED data + stock quotes + war currencies |
| Health | `HealthCheck.jsx` | System health monitoring |
| Settings | `SettingsPanel.jsx` | API key management |
| Saved | `SavedPanel.jsx` | Bookmarked items |
| Ticker | `KalshiTicker.jsx` | Prediction market ticker bar |

## Data Sources Summary

| Source | Type | API Key Required | Status |
|--------|-------|-----------------|--------|
| USGS Earthquake | Free | No | ✅ Working |
| GVP Volcanoes | Free | No | ✅ Working |
| NOAA NHC | Free | No | ✅ Working |
| NWS Weather | Free | No | ✅ Working |
| GDACS | Free | No | ✅ Working |
| ReliefWeb | Free | No | ✅ Working |
| DFO Floods | Free | No | ✅ Working |
| NASA FIRMS | **Yes** | Hardcoded (broken) | ⚠️ Needs key |
| OpenSky | **Yes** | Hardcoded (broken) | ⚠️ Needs key |
| AISStream | **Yes** | Hardcoded (broken) | ⚠️ Needs key |
| OpenSanctions | Free | No | ✅ Working |
| CISA KEV | Free | No | ✅ Working |
| NVD CVEs | Free | No | ✅ Working |
| Abuse.ch | Free | No | ✅ Working |
| MITRE ATT&CK | Free | No | ✅ Working |
| GDELT | Free | No | ✅ Working |
| CoinGecko | Free | No | ✅ Working |
| CoinMarketCap | **Yes** | Hardcoded | ⚠️ Verify |
| ExchangeRate.host | Free | No | ✅ Working |
| Kalshi | Free | No | ✅ Working |
| Polymarket | Free | No | ✅ Working |
| FRED | **Yes** | Required | ⚠️ Needs key |
| Yahoo Finance | Free | No | ✅ Working |
| Stooq | Free | No | ✅ Working |
| Alpha Vantage | **Yes** | Hardcoded demo | ⚠️ Needs key |
| Twelve Data | **Yes** | Hardcoded demo | ⚠️ Needs key |
| Wikipedia | Free | No | ✅ Working |
| Wikidata | Free | No | ✅ Working |
| WHO | Free | No | ✅ Working |
| ProMED | Free | No | ✅ Working |
| Liveuamap | Free | No | ✅ Working |
| Reddit | Free | No | ✅ Working |
| Cloudflare Radar | **Yes** | Hardcoded (broken) | ⚠️ Needs key |
| IntelX | **Yes** | Hardcoded (broken) | ⚠️ Needs key |
| VirusTotal | **Yes** | Hardcoded (broken) | ⚠️ Needs key |
| Shodan | **Yes** | Hardcoded (broken) | ⚠️ Needs key |
| Censys | **Yes** | Hardcoded (broken) | ⚠️ Needs key |
| OTX AlienVault | **Yes** | Hardcoded (broken) | ⚠️ Needs key |

## Intelligence Algorithms

1. **Signal Convergence** (`useSignalConvergenceV4.js`) — cross-references Telegram + Reddit + RSS signals by geographic zone
2. **Pattern-of-Life** (`usePatternOfLife.js`) — behavioral baseline for entities
3. **Financial Conflict Index (FCI)** — composite score from defense stocks + currencies + commodities
4. **Conflict Zones** — 18 geopolitical watch zones with severity scoring
5. **AIS Chokepoint Density** — maritime awareness at 16 strategic straits
6. **Fleet Registry** — hardcoded warship positions for military tracking
7. **GPS Jamming Detection** — GPSJam.org integration for military EW detection
8. **BGP Anomaly Detection** — route leak/blackhole detection
9. **Severity Scoring** — brightness × confidence × zone for FIRMS; composite for conflict

## Prediction Markets

- **Kalshi** (`/api/kalshi`) — election/outcome markets via `api.elections.kalshi.com`
- **Polymarket** (`/api/polymarket`) — yes/no markets via `gamma-api.polymarket.com`
- **Conflict Financial Index** — derived from crypto funding rates (ByBit)
- **War Currencies** — UAH/ILS/RUB/IRR devaluation as conflict indicators

## Known Issues

1. **Hardcoded API keys** — FIRMS key, OpenSky credentials, AISStream key all hardcoded in source
2. **IntelX key** hardcoded in `api/intel.js`
3. **VirusTotal key** hardcoded in `api/intel.js` and `api/threats.js`
4. **Shodan key** hardcoded in `api/satellite.js` and `api/threats.js`
5. **Censys credentials** hardcoded in `api/threats.js`
6. **OTX key** hardcoded in `api/threats.js`
7. **Cloudflare token** hardcoded in `api/alerts.js`
8. **OpenCorp key** hardcoded in `api/intel.js`
9. **No CISA KEV auth** — endpoint works but format may have changed
10. **NVD CVE date range** — API may require ISO 8601 with time component