#!/usr/bin/env python3
"""NEXUS v4 Full Scraper - stores signals, alerts, markets."""
import asyncio, aiohttp, json, time, sqlite3, re
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
try:
    from nexus_db import conn
except Exception:
    conn = sqlite3.connect("/home/workspace/nexus/nexus.db")


ZENODO = 'https://zenodo.org/record/15530072/files/acpl_zones_24h.csv'
HDRS = {'User-Agent': 'NEXUS-Intel/4.0', 'Accept': 'application/json,text/xml,*/*'}

async def get(url, to=15, js=False, extra=None):
    hh = dict(HDRS)
    if extra: hh.update(extra)
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(url, headers=hh, timeout=to) as r:
                if not r.ok:
                    return {} if js else None
                return await r.json() if js else await r.text()
    except Exception as e:
        print('[HTTP] FAIL ' + url[:50] + ': ' + str(e)[:60])
        return {} if js else None

async def fetch_usgs():
    d = await get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', js=True)
    if not d:
        return [], []
    alerts = []
    for f in (d.get('features') or [])[:50]:
        p = f.get('properties') or {}
        mag = p.get('mag') or 0
        sev = 'critical' if mag >= 6 else 'high' if mag >= 5 else 'medium'
        coords = f.get('geometry', {}).get('coordinates', [None, None])
        title = 'M' + str(mag) + ' -- ' + (p.get('place') or '')
        alerts.append({
            'title': title, 'url': p.get('url') or '',
            'source': 'USGS', 'category': 'natural', 'severity': sev,
            'lat': coords[1], 'lng': coords[0],
            'ts': datetime.now(timezone.utc).isoformat()
        })
    print('[USGS] ' + str(len(alerts)) + ' quakes')
    return [], alerts

async def fetch_cisa():
    d = await get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', js=True)
    if not d:
        return [], []
    signals = []
    for v in (d.get('vulnerabilities') or [])[:50]:
        cve = v.get('cveID') or ''
        signals.append({
            'title': 'CVE ' + cve + ': ' + (v.get('vulnerabilityName') or '')[:80],
            'url': 'https://nvd.nist.gov/vuln/detail/' + cve,
            'source': 'CISA KEV', 'category': 'cyber', 'severity': 'critical',
            'ts': v.get('dateAdded') or datetime.now(timezone.utc).strftime('%Y-%m-%d')
        })
    print('[CISA KEV] ' + str(len(signals)) + ' CVEs')
    return signals, []

async def fetch_feodo():
    d = await get('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json', js=True)
    if not d:
        return [], []
    signals = []
    for h in (d or [])[:20]:
        ip = h.get('ip_address') or ''
        if ip:
            signals.append({
                'title': 'Botnet C2: ' + ip + ':' + str(h.get('port') or '') + ' -- ' + (h.get('malware') or ''),
                'url': 'https://feodotracker.abuse.ch/browse/host/' + ip + '/',
                'source': 'Feodo', 'category': 'cyber', 'severity': 'high',
                'ts': h.get('last_seen') or datetime.now(timezone.utc).strftime('%Y-%m-%d')
            })
    print('[Feodo] ' + str(len(signals)) + ' C2s')
    return signals, []

async def fetch_polymarket():
    mkt = []
    for off in [0, 100]:
        d = await get('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&offset=' + str(off), js=True)
        if isinstance(d, list):
            mkt.extend(d[:30])
        elif isinstance(d, dict):
            mkt.extend(d.get('markets', [])[:30])
    _, markets = [], []
    for m in mkt[:60]:
        try:
            pr = json.loads(m.get('outcomePrices') or '[]')
            yes_p = float(pr[0]) if pr else 0.5
            slug = m.get('slug') or ''
            markets.append({
                'question': (m.get('question') or '')[:200],
                'source': 'Polymarket', 'price': yes_p,
                'volume': float(m.get('volume') or 0),
                'ts': datetime.now(timezone.utc).isoformat()
            })
        except Exception:
            pass
    print('[Polymarket] ' + str(len(markets)) + ' markets')
    return [], markets

async def fetch_nws():
    d = await get('https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe', js=True,
        extra={'Accept': 'application/geo+json', 'User-Agent': 'NEXUS'})
    if not d:
        return [], []
    alerts = []
    for f in (d.get('features') or [])[:15]:
        p = f.get('properties') or {}
        ev = p.get('event') or ''
        area = (p.get('areaDesc') or '')[:60]
        alerts.append({
            'title': ev + ' -- ' + area,
            'url': p.get('web') or 'https://www.weather.gov',
            'source': 'NWS', 'category': 'natural',
            'severity': 'critical' if p.get('severity') == 'Extreme' else 'high',
            'ts': p.get('sent') or datetime.now(timezone.utc).isoformat()
        })
    print('[NWS] ' + str(len(alerts)) + ' alerts')
    return [], alerts

async def fetch_gdacs():
    txt = await get('https://www.gdacs.org/xml/rss.xml')
    if not txt:
        return [], []
    alerts = []
    ITEM_RE = re.compile(r'<item>([\s\S]*?)</item>', re.I)
    TITLE_RE = re.compile(r'<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>', re.I)
    LINK_RE = re.compile(r'<link[^>]*>(.*?)</link>', re.I)
    LAT_RE = re.compile(r'geo:lat[^>]*>([^<]+)', re.I)
    LVL_RE = re.compile(r'gdacs:alertlevel[^>]*>([^<]+)', re.I)
    for m in ITEM_RE.findall(txt)[:15]:
        tm = TITLE_RE.search(m)
        lm = LINK_RE.search(m)
        la_m = LAT_RE.search(m)
        lv_m = LVL_RE.search(m)
        title = tm.group(1).strip() if tm else ''
        if title:
            alerts.append({
                'title': title,
                'url': lm.group(1).strip() if lm else '',
                'source': 'GDACS', 'category': 'natural',
                'severity': 'critical' if lv_m and 'red' in lv_m.group(1).lower() else 'high',
                'lat': float(la_m.group(1)) if la_m else None,
                'ts': datetime.now(timezone.utc).isoformat()
            })
    print('[GDACS] ' + str(len(alerts)) + ' alerts')
    return [], alerts

async def fetch_reuters():
    signals = []
    KW = {
        'ukraine': ['ukraine', 'russia', 'kyiv', 'donbas', 'zelensky'],
        'taiwan': ['taiwan', 'china', 'pla', 'tsmc'],
        'iran': ['iran nuclear', 'iaea', 'tehran'],
        'israel': ['israel', 'gaza', 'hamas', 'idf', 'netanyahu'],
    }
    ITEM_RE = re.compile(r'<item>([\s\S]*?)</item>', re.I)
    TITLE_RE = re.compile(r'<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>', re.I)
    LINK_RE = re.compile(r'<link[^>]*>([\s\S]*?)</link>', re.I)
    DATE_RE = re.compile(r'<pubDate[^>]*>([^<]+)</pubDate>')
    FEEDS = [
        ('https://feeds.reuters.com/reuters/worldNews', 'conflict'),
        ('https://feeds.reuters.com/reuters/businessNews', 'political'),
    ]
    for url, cat in FEEDS:
        txt = await get(url, to=10)
        if not txt:
            continue
        for m in ITEM_RE.findall(txt)[:20]:
            tm = TITLE_RE.search(m)
            lm = LINK_RE.search(m)
            pd = DATE_RE.search(m)
            t = tm.group(1).strip() if tm else ''
            if not t:
                continue
            zone = 'global'
            for z, kws in KW.items():
                if any(kw in t.lower() for kw in kws):
                    zone = z
                    break
            lnk = lm.group(1).strip() if lm else ''
            pts = pd.group(1).strip()[:16] if pd else datetime.now(timezone.utc).isoformat()
            sev = 'high' if any(kw in t.lower() for kw in ['killed', 'attack', 'missile', 'dead', 'war']) else 'medium'
            signals.append({
                'title': t[:200], 'url': lnk, 'source': 'Reuters',
                'category': cat, 'severity': sev, 'ts': pts, 'zone': zone
            })
    print('[Reuters] ' + str(len(signals)) + ' articles')
    return signals, []

async def fetch_gpsjam():
    _, alerts = [], []
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    d = await get('https://gpsjam.org/data/gpsjam_' + today + '.json', js=True)
    if not isinstance(d, list):
        return [], alerts
    for pt in d[:30]:
        jam = pt.get('jamming') or 0
        if jam > 0.4:
            alerts.append({
                'title': 'GPS Jamming ' + str(round(jam * 100)) + '% @ ' + str(pt.get('lat') or 0) + ',' + str(pt.get('lon') or 0),
                'url': 'https://gpsjam.org', 'source': 'GPSJam', 'category': 'signal',
                'severity': 'high' if jam > 0.7 else 'medium',
                'lat': pt.get('lat'), 'lng': pt.get('lon'),
                'ts': datetime.now(timezone.utc).isoformat(), 'zone': 'global'
            })
    print('[GPSJam] ' + str(len(alerts)) + ' jamming zones')
    return [], alerts

def store_sig(items):
    if not items:
        return 0
    now = datetime.now(timezone.utc)
    cur = conn.cursor()
    n = 0
    for it in items:
        t = (it.get('title') or '')[:500]
        if not t:
            continue
        try:
            cur.execute(
                'INSERT INTO signals (title,url,source,category,severity,ts,zone,lat,lng) VALUES (?,?,?,?,?,?,?,?,?)',
                (t, it.get('url') or '', it.get('source') or 'Unknown',
                 it.get('category') or 'general', it.get('severity') or 'medium',
                 it.get('ts') or now.isoformat(), it.get('zone') or 'global',
                 it.get('lat'), it.get('lng'))
            )
            n += 1
        except Exception as e:
            pass
    conn.commit()
    return n

def store_alrt(items):
    if not items:
        return 0
    now = datetime.now(timezone.utc)
    cur = conn.cursor()
    n = 0
    for it in items:
        t = (it.get('title') or '')[:500]
        if not t:
            continue
        try:
            cur.execute(
                'INSERT INTO alerts (title,detail,source,severity,ts,alert_type) VALUES (?,?,?,?,?,?)',
                (t, it.get('url') or '', it.get('source') or 'Unknown',
                 it.get('severity') or 'medium',
                 it.get('ts') or now.isoformat(),
                 it.get('category') or 'general')
            )
            n += 1
        except Exception:
            pass
    conn.commit()
    return n

def store_mkt(items):
    if not items:
        return 0
    now = datetime.now(timezone.utc)
    cur = conn.cursor()
    n = 0
    for m in items:
        try:
            cur.execute(
                'INSERT INTO markets (ts,question,prob,volume,source) VALUES (?,?,?,?,?)',
                (m.get('ts') or now.isoformat(),
                 (m.get('question') or '')[:200],
                 float(m.get('price') or 0.5),
                 float(m.get('volume') or 0),
                 m.get('source') or 'Unknown')
            )
            n += 1
        except Exception:
            pass
    conn.commit()
    return n

async def main():
    t0 = time.time()
    print('[SCRAPER] ' + datetime.now(timezone.utc).isoformat())
    res = await asyncio.gather(
        fetch_usgs(), fetch_cisa(), fetch_feodo(),
        fetch_polymarket(), fetch_nws(), fetch_gdacs(),
        fetch_reuters(), fetch_gpsjam(),
        return_exceptions=True
    )
    sigs, alrt, mkts = [], [], []
    for r in res:
        if isinstance(r, Exception):
            print('[ERR] ' + str(r)[:80])
            continue
        if not isinstance(r, tuple) or len(r) != 2:
            continue
        s, a = r
        if not isinstance(s, list) or not isinstance(a, list):
            continue
        if a and isinstance(a[0], dict) and ('price' in a[0] or 'question' in a[0]):
            mkts.extend(a)
        else:
            if s:
                sigs.extend(s)
            if a:
                alrt.extend(a)
    ns = store_sig(sigs)
    na = store_alrt(alrt)
    nm = store_mkt(mkts)
    print('[SCRAPER] Done in ' + str(round(time.time() - t0, 1)) + 's: ' + str(ns) + ' sigs, ' + str(na) + ' alrt, ' + str(nm) + ' mkts')
    now = datetime.now(timezone.utc)
    h24 = (now - timedelta(hours=24)).isoformat()
    try:
        print('[DB] sigs_24h=' + str(conn.execute('SELECT COUNT(*) FROM signals WHERE ts > ?', (h24,)).fetchone()[0]))
        print('[DB] alrt_24h=' + str(conn.execute('SELECT COUNT(*) FROM alerts WHERE ts > ?', (h24,)).fetchone()[0]))
        print('[DB] mkts=' + str(conn.execute('SELECT COUNT(*) FROM markets').fetchone()[0]))
    except Exception as e:
        print('[DB stats] ' + str(e))

if __name__ == '__main__':
    asyncio.run(main())
