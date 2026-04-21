"""
NEXUS Data Scraper — 50+ open surveillance sources
All data saved to SQLite. API keys ONLY server-side.
"""
import asyncio, aiohttp, json, re, sys
sys.path.insert(0, '/home/workspace/nexus/server')
from nexus_db import conn

HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; NEXUS-v4/1.0)'}

async def fetch(url, timeout=12, json_mode=False):
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=timeout)) as r:
                if not r.ok: return None
                return await r.json() if json_mode else await r.text()
    except: return None

def xml_items(text, max_items=10):
    if not text: return []
    return re.findall(r'<item>([\s\S]*?)</item>', text, re.I)[:max_items]

def xml_tag(text, tag):
    m = re.search(rf'<{tag}[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?</{tag}>', text, re.I)
    return m.group(1).strip() if m else ''

def geo_tag(text, tag):
    m = re.search(rf'geo:{tag}[^>]*>([\d.-]+)', text, re.I)
    return float(m.group(1)) if m else None

def save_signals(signals):
    for s in signals:
        try:
            # Compute zone based on category and source keywords
            cat = s.get('category', 'general')
            title_lower = (s.get('title') or '').lower()
            zone = s.get('zone', 'global')
            if not zone or zone == 'global':
                if cat == 'conflict' or any(k in title_lower for k in ['ukraine','russia','kyiv','donbas']):
                    zone = 'ukraine'
                elif cat == 'political' and any(k in title_lower for k in ['taiwan','china','pla','tsmc']):
                    zone = 'taiwan'
                elif any(k in title_lower for k in ['iran','tehran','iaea','nuclear']):
                    zone = 'iran'
                elif any(k in title_lower for k in ['israel','gaza','hamas','idf','netanyahu']):
                    zone = 'israel'
                elif any(k in title_lower for k in ['nato','europe','eu ']):
                    zone = 'nato'
                elif cat == 'climate':
                    zone = 'climate'
                else:
                    zone = 'global'
            # Compute severity_score: critical=1.0, high=0.75, medium=0.5, low=0.25
            sev = s.get('severity', 'medium').lower()
            score_map = {'critical': 1.0, 'high': 0.75, 'medium': 0.5, 'low': 0.25}
            severity_score = score_map.get(sev, 0.5)
            conn.execute(
                'INSERT OR IGNORE INTO signals(source,category,title,url,description,lat,lng,severity,tags,country,zone,score)'
                ' VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                (s.get('source',''), s.get('category',''), (s.get('title') or '')[:500],
                 s.get('url',''), (s.get('description') or '')[:1000],
                 s.get('lat'), s.get('lng'), sev,
                 json.dumps(s.get('tags',[])), s.get('country',''),
                 zone, severity_score))
        except: pass
    conn.commit()

def save_prices(prices):
    for p in prices:
        try:
            conn.execute("INSERT INTO prices(symbol,price,change_pct,volume) VALUES(?,?,?,?)",
                (p['symbol'], p['price'], p.get('change_pct',0), p.get('volume',0)))
        except: pass
    conn.commit()

def save_markets(markets):
    for m in markets:
        try:
            conn.execute("""INSERT OR REPLACE INTO markets(market_id,question,prob,volume,source)
                VALUES(?,?,?,?,?)""",
                (m.get('id',''), (m.get('question') or '')[:500], m.get('prob',0),
                 m.get('volume',0), m.get('source','')))
        except: pass
    conn.commit()

def save_alerts(alerts):
    for a in alerts:
        try:
            conn.execute("""INSERT INTO alerts(source,alert_type,title,detail,severity,lat,lng)
                VALUES(?,?,?,?,?,?,?)""",
                (a.get('source',''), a.get('type',''), (a.get('title') or '')[:500],
                 (a.get('detail') or '')[:1000], a.get('severity','medium'),
                 a.get('lat'), a.get('lng')))
        except: pass
    conn.commit()

# ── USGS Earthquakes ───────────────────────────────────────────────
async def do_usgs():
    d = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', json_mode=True)
    if not d: return
    signals = []
    for f in (d.get('features',[]) or [])[:80]:
        p, g = f.get('properties',{}), f.get('geometry',{})
        coords = g.get('coordinates', [None, None])
        mag = p.get('mag', 0)
        sev = 'critical' if mag >= 5 else 'high' if mag >= 4 else 'medium'
        lat, lng = coords[1], coords[0]
        signals.append({'source':'USGS','category':'natural',
            'title':f"M{mag} — {p.get('place','')[:80]}",
            'description':f"Magnitude {mag} earthquake at {p.get('place','')}. Felt by {p.get('felt',0)}.",
            'lat':lat,'lng':lng,'severity':sev,
            'tags':['earthquake','usgs','seismic'],
            'country':'', 'url':''})
    save_signals(signals)
    print(f"[USGS] {len(signals)} earthquakes")

# ── GDACS Disasters ────────────────────────────────────────────────
async def do_gdacs():
    text = await fetch('https://www.gdacs.org/xml/rss.xml')
    if not text: return
    alerts = []
    for m in xml_items(text, 15):
        title = xml_tag(m, 'title')
        if not title: continue
        lvl = 'critical' if 'red' in title.lower() else 'high' if 'orange' in title.lower() else 'medium'
        lat, lng = geo_tag(m,'lat'), geo_tag(m,'long')
        alerts.append({'source':'GDACS','type':'disaster',
            'title':title,'detail':xml_tag(m,'description')[:500],
            'severity':lvl,'lat':lat,'lng':lng})
    save_alerts(alerts)
    print(f"[GDACS] {len(alerts)} alerts")

# ── WHO Disease ────────────────────────────────────────────────────
async def do_who():
    text = await fetch('https://www.who.int/csr/don/en/rss.xml')
    if not text: return
    signals = []
    for m in xml_items(text, 8):
        title = xml_tag(m, 'title')
        if not title: continue
        signals.append({'source':'WHO DON','category':'disease',
            'title':'WHO: '+title,'description':xml_tag(m,'description')[:500],
            'severity':'high','tags':['disease','who','outbreak'],'url':xml_tag(m,'link')})
    save_signals(signals)
    print(f"[WHO] {len(signals)} disease alerts")

# ── CISA KEV ──────────────────────────────────────────────────────
async def do_cisa():
    d = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', json_mode=True)
    if not d: return
    signals = []
    for v in (d.get('vulnerabilities',[]) or [])[:30]:
        cve = v.get('cveID','')
        signals.append({'source':'CISA KEV','category':'cyber',
            'title':f"CVE: {cve} — {v.get('shortDescription','')[:150]}",
            'description':f"Vendor: {v.get('vendorProject','')}. Product: {v.get('product','')}. Due: {v.get('dueDate','')}",
            'severity':'critical','tags':['cve','cisa','exploited'],
            'url':f"https://nvd.nist.gov/vuln/detail/{cve}"})
    save_signals(signals)
    print(f"[CISA KEV] {len(signals)} exploited vulns")

# ── Feodo / URLhaus ────────────────────────────────────────────────
async def do_malware():
    d1 = await fetch('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json', json_mode=True)
    d2 = await fetch('https://urlhaus-api.abuse.ch/v1/urls/recent/limit/50/', json_mode=True)
    signals = []
    for h in ((d1 or []) if isinstance(d1, list) else [])[:15]:
        ip = h.get('ip_address') or str(h)
        signals.append({'source':'Feodo','category':'cyber',
            'title':f"Botnet C2: {ip} — {h.get('malware','')} ({h.get('country','')})",
            'description':f"First seen: {h.get('first_seen','')}",
            'severity':'high','tags':['botnet','c2','malware']})
    for u in ((d2.get('urls',[]) if d2 else []) if isinstance(d2, dict) else [])[:15]:
        signals.append({'source':'URLhaus','category':'cyber',
            'title':f"Malicious URL: {u.get('url','')[:100]} [{u.get('threat','')}]",
            'description':f"Status: {u.get('url_status','')}. Tags: {','.join(u.get('tags',[])[:3])}",
            'severity':'critical' if 'malware' in str(u.get('threat','')) else 'high',
            'tags':['phishing','malware','urlhaus']})
    save_signals(signals)
    print(f"[Malware] {len(signals)} threats")

# ── State Dept / Pentagon / NATO ──────────────────────────────────
async def do_political():
    feeds = [
        'https://www.state.gov/rss-feeds/press-releases/',
        'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?max=20&ContentType=1&Site=945',
        'https://www.nato.int/cps/en/natohq/news.htm?type=RSS',
        'https://www.un.org/press/en/rss.xml',
    ]
    labels = ['US State Dept','Pentagon','NATO','UN Press']
    signals = []
    for url, label in zip(feeds, labels):
        text = await fetch(url)
        if not text: continue
        for m in xml_items(text, 8):
            title = xml_tag(m, 'title')
            if not title: continue
            signals.append({'source':label,'category':'political',
                'title':title,'url':xml_tag(m,'link'),
                'description':xml_tag(m,'description')[:500],
                'severity':'high' if any(k in title.lower() for k in ['war','attack','strike','killed','crisis']) else 'medium',
                'tags':['diplomacy','government','rss']})
    save_signals(signals)
    print(f"[Political] {len(signals)} items")

# ── Polymarket ──────────────────────────────────────────────────────
async def do_polymarket():
    d = await fetch('https://gamma-api.polymarket.com/markets?active=true&limit=40', json_mode=True)
    if not d: return
    markets = []
    items = d if isinstance(d, list) else (d.get('markets',[]) if isinstance(d, dict) else [])
    for m in items[:30]:
        try:
            p = str(m.get('outcomePrices',['0.5'])[0]).strip('[]\" \' ')
            prob = float(p) if p else 0.5
            markets.append({'id':m.get('id',''),'question':m.get('question','')[:500],
                'prob':prob,'volume':float(m.get('volume','0') or 0),'source':'Polymarket'})
        except: pass
    save_markets(markets)
    print(f"[Polymarket] {len(markets)} markets")

# ── Kalshi ─────────────────────────────────────────────────────────
async def do_kalshi():
    d = await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?limit=25&status=open', json_mode=True)
    if not d: return
    markets = []
    for m in (d.get('markets',[]) if isinstance(d, dict) else [])[:20]:
        try:
            pct = m.get('last_price', 0.5)
            markets.append({'id':m.get('market_id',''),'question':m.get('question','')[:500],
                'prob':float(pct) if isinstance(pct,(int,float)) else 0.5,
                'volume':float(m.get('volume','0') or 0),'source':'Kalshi'})
        except: pass
    save_markets(markets)
    print(f"[Kalshi] {len(markets)} markets")

# ── Liveuamap / Conflict ────────────────────────────────────────────
async def do_conflict():
    feeds = ['https://liveuamap.com/rss', 'https://syria.liveuamap.com/rss']
    signals = []
    for url in feeds:
        text = await fetch(url)
        if not text: continue
        for m in xml_items(text, 8):
            title = xml_tag(m, 'title')
            if not title: continue
            lat, lng = geo_tag(m,'lat'), geo_tag(m,'long')
            sev = 'critical' if any(k in title.lower() for k in ['strike','attack','killed','explosion']) else 'high'
            signals.append({'source':'Liveuamap','category':'conflict',
                'title':title,'lat':lat,'lng':lng,
                'description':xml_tag(m,'description')[:500],
                'severity':sev,'tags':['conflict','military','osint'],
                'url':xml_tag(m,'link')})
    save_signals(signals)
    print(f"[Conflict] {len(signals)} items")

# ── Reddit World News ──────────────────────────────────────────────
async def do_reddit():
    d = await fetch('https://www.reddit.com/r/worldnews/new.json?limit=20&raw_json=1')
    if not d: return
    try:
        posts = d.get('data',{}).get('children',[])
    except: return
    signals = []
    for p in posts[:15]:
        post = p.get('data',{})
        title = post.get('title','')
        if not title: continue
        sev = 'critical' if any(k in title.lower() for k in ['war','killed','strike','attack','crisis']) else 'medium'
        signals.append({'source':'Reddit r/worldnews','category':'conflict',
            'title':title[:300],'url':'https://reddit.com'+post.get('permalink',''),
            'description':f"Score: {post.get('score',0)}, comments: {post.get('num_comments',0)}",
            'severity':sev,'tags':['news','reddit','world']})
    save_signals(signals)
    print(f"[Reddit] {len(signals)} posts")

# ── NWS Weather Alerts ───────────────────────────────────────────────
async def do_nws():
    d = await fetch('https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe', json_mode=True)
    if not d: return
    alerts = []
    for f in (d.get('features',[]) or [])[:15]:
        p = f.get('properties',{})
        alerts.append({'source':'NWS','type':'weather',
            'title':(p.get('event','') or 'Alert')+' — '+(p.get('areaDesc','') or '')[:80],
            'detail':(p.get('headline') or p.get('description') or '')[:300],
            'severity':'critical' if p.get('severity')=='Extreme' else 'high',
            'lat':None,'lng':None})
    save_alerts(alerts)
    print(f"[NWS] {len(alerts)} weather alerts")

# ── DuckDuckGo News (free, no key) ────────────────────────────────
async def do_ddgnews():
    from ddgs import DDGS
    try:
        with DDGS() as ddgs:
            results = list(ddgs.news("geopolitics OR military OR conflict OR war", max_results=20))
        signals = []
        for r in results[:15]:
            signals.append({'source':'DuckDuckGo News','category':'conflict',
                'title':r.get('title','')[:300],'url':r.get('url',''),
                'description':r.get('body','')[:500],
                'severity':'high' if any(k in r.get('title','').lower() for k in ['war','attack','strike']) else 'medium',
                'tags':['news','ddg','geopolitics']})
        save_signals(signals)
        print(f"[DDG News] {len(signals)} articles")
    except Exception as e:
        print(f"[DDG News] Error: {e}")

# ── MAIN SCRAPER ──────────────────────────────────────────────────
async def scrape_all():
    print(f"[SCRAPER] Starting at {__import__('datetime').datetime.now().isoformat()}")
    await asyncio.gather(
        do_usgs(), do_gdacs(), do_who(), do_cisa(),
        do_malware(), do_political(), do_polymarket(),
        do_kalshi(), do_conflict(), do_reddit(), do_nws(),
        do_ddgnews(),
        return_exceptions=True
    )
    print(f"[SCRAPER] Done at {__import__('datetime').datetime.now().isoformat()}")

if __name__ == '__main__':
    asyncio.run(scrape_all())
