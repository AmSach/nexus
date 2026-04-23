# NEXUS DATA GAPS vs PALANTIR GOTHAM
# What we need, why, volume, and how to get it

## WHAT PALANTIR HAS THAT WE DON'T

### TIER 1 — Critical Gaps (kills forecasting accuracy)

| Data | Why Critical | Volume | Source | Key Needed? |
|------|-------------|--------|--------|-------------|
| **ACLED full** (authenticated) | Every conflict event on Earth with fatality counts, actor names, location precision | 300k+ events, daily updates | acleddata.com/register | YES — email + password (FREE for researchers) |
| **GDELT GKG** (Graph of Names, Themes, Tones) | Named entity extraction from 100k+ news daily — WHO is doing WHAT WHERE | 1M+ records/day | gdelt.org | No key, just volume |
| **UCDP Georeferenced** full dataset | UN-verified conflict events with precise lat/lng, actor IDs, conflict IDs | 300k+ events | ucdpapi.pcr.uu.se | No key |
| **SIPRI arms transfers** | Who is selling weapons to whom — leading indicator of conflict escalation | 40k+ transfers | sipri.org/databases/armstransfers | No key (scraped) |
| **UN Security Council voting** | Veto patterns, bloc formation, what's getting blocked | Every vote since 1946 | unbisnet.un.org | No key |
| **OpenSanctions full** | 1M+ sanctioned entities — persons, companies, vessels, aircraft | 1M+ | opensanctions.org/api/ | No key (FREE) |
| **OFAC SDN list** | US Treasury sanctions — who's blocked from dollar system | 10k+ entries | ofac.treas.gov | No key |

### TIER 2 — Major Gaps (weakens intelligence)

| Data | Why Critical | Volume | Source | Key Needed? |
|------|-------------|--------|--------|-------------|
| **OSM Overpass API** | Building footprints, military bases, border crossings, infrastructure — geo context | Unlimited | overpass-api.de | No key |
| **Wikipedia Wikidata** | Structured facts about every entity, real-time edits as conflict signal | Unlimited | wikidata.org/w/api.php | No key |
| **Global Fishing Watch** full | IUU fishing = sanctions evasion + North Korea supply chain | 200M+ positions | globalfishingwatch.org/our-apis/ | YES — free registration |
| **Spire Maritime** (partial) | AIS dark vessel tracking — ships turning off transponders | Proprietary but free sandbox | spire.com | YES — free trial |
| **ICAO airspace NOTAMs** | Real NOTAM data, not FAA only | All global airspace | 4 × 4 = 16 regional NOTAM servers | No key |
| **EU CORDIS grants** | Research funding patterns → who's working on what weapons/dual-use tech | 50k+ projects | cordis.europa.eu/api | No key |
| **IMO ship registry** | Official vessel identity, flag state, owner — vs AIS name (often spoofed) | 100k+ vessels | ihs.com / equasis.org | Equasis: free registration |
| **PACER court records** | US federal litigation — sanctions enforcement, arms deals | Millions of filings | pacer.gov | YES — $0.10/page but first $30 free |

### TIER 3 — Enhances Pattern of Life

| Data | Why | Source | Key |
|------|-----|--------|-----|
| **Telegram channel metadata** (via MTProto) | Channel growth rate, member counts = radicalization signal | API: my.telegram.org | YES — phone + app_id |
| **Twitter/X Streaming** | Real-time conflict keywords, verified geolocation | api.twitter.com | YES — $100/month Basic |
| **Reddit pushshift** | Historical conflict discussion, early warning signals | pushshift.io | No key (free) |
| **Bellingcat Ukraine Map** | Verified geolocated incidents in Ukraine | bellingcat.com | Scrape — no API |
| **LiveUAMap** | Crowdsourced conflict incidents | liveuamap.com | Scrape |
| **OSINT caliber** (MilBlog posts) | Russian milblogger analysis | Various t.me | Telegram API |

## WHAT WE NEED TO FETCH RIGHT NOW (no key required)

These work today with zero API keys and will 10x our data quality:

1. **OpenSanctions API** — `https://api.opensanctions.org/entities/?schema=Vessel&limit=1000` — FREE
2. **OFAC SDN** — `https://www.treasury.gov/ofac/downloads/sdn.xml` — FREE
3. **GDELT GKG 2.0** — `http://data.gdeltproject.org/gdeltv2/lastupdate.txt` then fetch the GKG file — FREE, massive
4. **OSM Overpass** — military bases, borders, infrastructure — FREE
5. **UCDP Full** — `https://ucdpapi.pcr.uu.se/api/gedevents/23.1?pagesize=1000` — FREE
6. **Wikipedia Recent Changes** (conflict articles) — `https://en.wikipedia.org/w/api.php?action=query&list=recentchanges` — FREE
7. **Wikidata SPARQL** — named entity facts, country relationships — FREE
8. **Global Fishing Watch** — FREE with registration

## KEYS TO GET (send me these and I'll wire them in)

Priority order:
1. **ACLED key** — acleddata.com/register (academic email = instant approval, no academic = request research access)
   → Returns: every conflict event globally with lat/lng, actors, fatalities, event type
   → Without this: our conflict layer is GDELT approximations only

2. **Global Fishing Watch** — globalfishingwatch.org/our-apis/
   → Returns: vessel tracks, fishing detection, dark vessel alerts
   → Use: sanctions evasion detection, DPRK supply chains

3. **Telegram App ID** — my.telegram.org
   → Returns: full channel metadata, member counts, growth rates
   → Use: radicalization signals, early warning

4. **OpenAlex** (academic) — FREE, no key needed
   → Returns: 250M+ academic papers with citations
   → Use: track which labs are publishing on weapons/dual-use research

5. **Spire Maritime sandbox** — spire.com/maritime/
   → Returns: dark vessel tracking (AIS-silent ships)
   → Use: sanctions evasion, submarine movements

## APIs FROM YOUR LIST — Assessment

- **Marketstack** (500 req/month free): Already covered by Yahoo Finance (unlimited) — skip
- **Numverify** (100/month free): Too low volume for intel — skip  
- **AviationStack** (100/month free): Too low — our WebSocket handles this better
- **ExchangeRate.host** (FREE unlimited): ✅ Already integrated in v101
- **MalDatabase**: Can't find a public API — may be defunct
- **Walltime** (Brazilian BTC): Too narrow — already have CoinGecko
- **Charity Search**: No strategic intel value — skip
- **Orb Intelligence**: Company data — integrate into entity board (has free tier)
- **Tomba** (25/month free): Too low — skip
- **BTCTurk**: Regional crypto — skip
- **ByBit** (FREE, no key): ✅ Useful — BTC/USDT perpetual funding rate = war premium
- **Hasura**: Backend GraphQL — needs server, not Vercel-compatible
- **ip-fast.com**: Covered by ipinfo.io — skip
- **BrainShop AI**: Inferior to Groq — skip
- **CORSProxy**: Already using allorigins + corsproxy.io — skip

