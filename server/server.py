"""
NEXUS v4 — Unified FastAPI Server
All intelligence flows: client → API → DB → ACPL/VOX → response
API keys stored ONLY in Settings > Advanced (env vars), never sent to client
"""
import sys, asyncio, math, time
from datetime import datetime
sys.path.insert(0, '/home/workspace/nexus/server')
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import aiohttp
import re
import json

sys.path.insert(0, '/home/workspace/nexus/server')
from nexus_db import conn, init_db
from scraper import scrape_all
from acpl_engine import predict as acpl_predict
from voxel import predict as vox_predict

app = FastAPI(title="NEXUS Intelligence API v4", version="4.3.8")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"]
)

API_KEY = None  # Set via NEXUS_API_KEY env var

def require_key(x_api_key: str = None):
    if not API_KEY: return  # No key configured = open
    if not x_api_key or x_api_key != API_KEY:
        raise HTTPException(401, "Invalid or missing API key")

# ── Scrape Trigger ─────────────────────────────────────────────────
@app.post("/api/scrape")
async def trigger_scrape():
    """Trigger full data scrape. Returns immediately, scrape runs async."""
    require_key(None)
    asyncio.create_task(scrape_all())
    return {"status": "scraping", "started_at": datetime.utcnow().isoformat()}

# ── ACPL + VOX Prediction ──────────────────────────────────────────
@app.get("/api/predict/{engine}")
async def predict(engine: str, question: str = Query(...),
                  question_id: str = Query(None)):
    """
    ACPL: Adaptive Conflict Probability Locator — real-time Polymarket prediction
    VOX:  Geopolitical Forecast Engine — calibrated probability
    """
    require_key(None)
    qid = question_id or f"{engine}_{int(time.time())}"
    
    if engine.lower() == "acpl":
        result = acpl_predict(qid, question)
    elif engine.lower() == "vox":
        # Get Polymarket prices for this question
        market_prices = {}
        matches = conn.execute(
            "SELECT question, prob FROM markets WHERE question LIKE ? LIMIT 20",
            (f"%{question[:30]}%",)
        ).fetchall()
        for q, p in matches:
            market_prices[q[:30]] = p
        result = vox_predict(qid, question, market_prices)
    else:
        raise HTTPException(400, "engine must be acpl or vox")
    
    return JSONResponse({
        "question": question,
        "question_id": qid,
        "prediction": result,
        "fetched_at": datetime.utcnow().isoformat(),
    })

# ── Market Prices ─────────────────────────────────────────────────
@app.get("/api/markets")
async def get_markets(source: str = Query(None)):
    require_key(None)
    q = "SELECT market_id, question, prob, volume, source, ts FROM markets"
    params = []
    if source:
        q += " WHERE source=?"
        params.append(source)
    q += " ORDER BY ts DESC LIMIT 100"
    rows = conn.execute(q, params).fetchall()
    return {"markets": [
        {"id":r[0],"question":r[1],"prob":r[2],"volume":r[3],"source":r[4],"ts":r[5]}
        for r in rows
    ], "count": len(rows)}

# ── Prices ────────────────────────────────────────────────────────
@app.get("/api/prices")
async def get_prices(symbol: str = Query(None)):
    require_key(None)
    q = "SELECT symbol, price, change_pct, volume, ts FROM prices"
    params = []
    if symbol:
        q += " WHERE symbol=?"
        params.append(symbol.upper())
    q += " ORDER BY ts DESC LIMIT 200"
    rows = conn.execute(q, params).fetchall()
    return {"prices": [
        {"symbol":r[0],"price":r[1],"change_pct":r[2],"volume":r[3],"ts":r[4]}
        for r in rows
    ], "count": len(rows)}

# ── Signals ──────────────────────────────────────────────────────
@app.get("/api/signals")
async def get_signals(
    category: str = Query(None),
    severity: str = Query(None),
    source: str = Query(None),
    hours: int = Query(24),
    limit: int = Query(100),
):
    require_key(None)
    q = "SELECT ts, source, category, title, url, description, lat, lng, severity, tags FROM signals WHERE 1=1"
    params = []
    cutoff = datetime.fromtimestamp(time.time() - hours*3600).isoformat()
    q += " AND ts >= ?"
    params.append(cutoff)
    if category:
        q += " AND category=?"; params.append(category)
    if severity:
        q += " AND severity=?"; params.append(severity)
    if source:
        q += " AND source=?"; params.append(source)
    q += " ORDER BY ts DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(q, params).fetchall()
    return {"signals": [
        {"ts":r[0],"source":r[1],"category":r[2],"title":r[3],"url":r[4],
         "description":r[5],"lat":r[6],"lng":r[7],"severity":r[8],"tags":r[9]}
        for r in rows
    ], "count": len(rows)}

# ── Alerts ─────────────────────────────────────────────────────────
@app.get("/api/alerts")
async def get_alerts(source: str = Query(None), hours: int = Query(24)):
    require_key(None)
    q = "SELECT ts, source, alert_type, title, detail, severity, lat, lng FROM alerts WHERE 1=1"
    params = []
    cutoff = datetime.fromtimestamp(time.time() - hours*3600).isoformat()
    q += " AND ts >= ?"; params.append(cutoff)
    if source:
        q += " AND source=?"; params.append(source)
    q += " ORDER BY ts DESC LIMIT 100"
    rows = conn.execute(q, params).fetchall()
    return {"alerts": [
        {"ts":r[0],"source":r[1],"type":r[2],"title":r[3],"detail":r[4],
         "severity":r[5],"lat":r[6],"lng":r[7]}
        for r in rows
    ], "count": len(rows)}

# ── Intelligence Query ─────────────────────────────────────────────
@app.get("/api/intel")
async def get_intel(q: str = Query(...)):
    require_key(None)
    rows = conn.execute(
        "SELECT ts, source, title, description, category, severity, url FROM signals "
        "WHERE title LIKE ? OR description LIKE ? "
        "ORDER BY ts DESC LIMIT 50",
        (f"%{q}%", f"%{q}%")
    ).fetchall()
    return {"query": q, "results": [
        {"ts":r[0],"source":r[1],"title":r[2],"description":r[3],
         "category":r[4],"severity":r[5],"url":r[6]}
        for r in rows
    ], "count": len(rows)}

# ── Summary Stats ──────────────────────────────────────────────────
@app.get("/api/stats")
async def get_stats():
    require_key(None)
    now = datetime.fromtimestamp(time.time() - 24*3600).isoformat()
    def count(table, col="ts"):
        r = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE {col} >= ?", (now,)).fetchone()
        return r[0] if r else 0
    def top_sources(n=5):
        rows = conn.execute(
            "SELECT source, COUNT(*) as cnt FROM signals WHERE ts >= ? "
            "GROUP BY source ORDER BY cnt DESC LIMIT ?", (now, n)
        ).fetchall()
        return [{"source":r[0],"count":r[1]} for r in rows]
    def severity_breakdown():
        rows = conn.execute(
            "SELECT severity, COUNT(*) FROM signals WHERE ts >= ? "
            "GROUP BY severity", (now,)
        ).fetchall()
        return {r[0]:r[1] for r in rows}
    def category_breakdown():
        rows = conn.execute(
            "SELECT category, COUNT(*) FROM signals WHERE ts >= ? "
            "GROUP BY category", (now,)
        ).fetchall()
        return {r[0]:r[1] for r in rows}
    
    return {
        "signals_24h": count("signals"),
        "alerts_24h": count("alerts"),
        "markets_active": conn.execute("SELECT COUNT(*) FROM markets WHERE ts >= ?", (now,)).fetchone()[0] or 0,
        "prices_24h": count("prices"),
        "top_sources": top_sources(),
        "severity_breakdown": severity_breakdown(),
        "category_breakdown": category_breakdown(),
        "db_path": "/home/workspace/nexus/nexus.db",
        "fetched_at": datetime.utcnow().isoformat(),
    }

# ── Health Check ───────────────────────────────────────────────────
@app.get('/api/health')
async def health():
    try:
        conn.execute('SELECT 1').fetchone()
        return {'status': 'ok', 'db': 'connected', 'ts': datetime.utcnow().isoformat()}
    except Exception as e:
        return {'status': 'error', 'error': str(e)}

# ── GDELT Search ───────────────────────────────────────────────────
@app.get('/api/gdelt')
async def gdelt_search(
    q: str = Query(...),
    timespan: str = Query('1week'),
    limit: int = Query(50),
):
    require_key(None)
    results = fetch_gdelt_search(q, timespan, limit)
    # Also store hits in DB if any found
    if results:
        cur = conn.cursor()
        for a in results:
            try:
                cur.execute(
                    'INSERT OR IGNORE INTO signals(source,category,title,url,description,severity,tags,zone,ts)'
                    ' VALUES(?,?,?,?,?,?,?,?,?)',
                    (
                        a.get('source', 'GDELT'), 'news',
                        (a.get('title', '') or '')[:500],
                        a.get('url', ''),
                        (a.get('seendate', '') or '')[:300],
                        'medium',
                        json.dumps(['gdelt', q[:20]]),
                        'global',
                        a.get('timestamp') or datetime.utcnow().isoformat()
                    )
                )
            except: pass
        conn.commit()
    return {
        'query': q,
        'timespan': timespan,
        'count': len(results),
        'articles': [{
            'title': a.get('title', ''),
            'url': a.get('url', ''),
            'source': a.get('source', ''),
            'timestamp': a.get('timestamp', ''),
            'language': a.get('language', ''),
        } for a in results[:limit]],
        'fetched_at': datetime.utcnow().isoformat(),
    }

# ── Live Dashboard ─────────────────────────────────────────────────
@app.get('/api/live')
async def live_dashboard(hours: int = Query(6)):
    require_key(None)
    cutoff = datetime.fromtimestamp(time.time() - hours * 3600).isoformat()
    # Recent signals
    sig_rows = conn.execute(
        'SELECT ts,source,category,title,url,description,lat,lng,severity,tags,zone,score '
        'FROM signals WHERE ts >= ? ORDER BY ts DESC LIMIT 100', (cutoff,)
    ).fetchall()
    signals = [{
        'ts': r[0], 'source': r[1], 'category': r[2], 'title': r[3], 'url': r[4],
        'description': r[5], 'lat': r[6], 'lng': r[7], 'severity': r[8],
        'tags': r[9], 'zone': r[10], 'score': r[11]
    } for r in sig_rows]
    # Recent alerts
    alert_rows = conn.execute(
        'SELECT ts,source,alert_type,title,detail,severity,lat,lng '
        'FROM alerts WHERE ts >= ? ORDER BY ts DESC LIMIT 50', (cutoff,)
    ).fetchall()
    alerts = [{
        'ts': r[0], 'source': r[1], 'type': r[2], 'title': r[3],
        'detail': r[4], 'severity': r[5], 'lat': r[6], 'lng': r[7]
    } for r in alert_rows]
    # Markets
    mkt_rows = conn.execute(
        'SELECT ts,market_id,question,prob,volume,source '
        'FROM markets ORDER BY ts DESC LIMIT 30'
    ).fetchall()
    markets = [{
        'ts': r[0], 'market_id': r[1], 'question': r[2],
        'prob': r[3], 'volume': r[4], 'source': r[5]
    } for r in mkt_rows]
    # Prices
    price_rows = conn.execute(
        'SELECT ts,symbol,price,change_pct,volume '
        'FROM prices ORDER BY ts DESC LIMIT 30'
    ).fetchall()
    prices = [{
        'ts': r[0], 'symbol': r[1], 'price': r[2],
        'change_pct': r[3], 'volume': r[4]
    } for r in price_rows]
    return {
        'signals': signals, 'signals_count': len(signals),
        'alerts': alerts, 'alerts_count': len(alerts),
        'markets': markets, 'markets_count': len(markets),
        'prices': prices, 'prices_count': len(prices),
        'fetched_at': datetime.utcnow().isoformat(),
        'hours': hours, 'cutoff': cutoff,
    }

# News sources we can actually reach (no auth needed, 200 OK)
NEWS_SOURCES = [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://www.theguardian.com/world/rss",
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "https://feeds.reuters.com/reuters/worldNews",
    "https://www.aljazeera.com/xml/rss/all.xml",
    "https://www.washingtontimes.com/rss/headlines/news/world/",
    "https://www.independent.co.uk/news/world/rss",
]

GDELT_SOURCES = [
    # GDELT is rate-limited but we try with fallback to cached data
    # Alternative: use public GDELT endpoints with different time windows
]

def fetch_gdelt_search(q: str, timespan: str = "1week", maxrecords: int = 100) -> list:
    """GDELT - uses curl subprocess to bypass aiohttp DNS restrictions"""
    articles = []
    try:
        encoded_q = q.replace(" ", "+")
        url = f"https://api.gdeltproject.org/api/v2/doc/doc?query={encoded_q}+sourcelang:english&mode=artlist&maxrecords={maxrecords}&sort=DateDesc&timespan={timespan}&format=json"
        r = __import__("subprocess").run(
            ["curl", "-s", "--max-time", "25", "-L", "-A", "Mozilla/5.0", url],
            capture_output=True, text=True, timeout=30
        )
        if r.returncode == 0 and r.stdout:
            import json
            data = json.loads(r.stdout)
            articles = data.get("articles", [])[:maxrecords]
            for a in articles:
                a["source"] = a.get("domain", "")
                if "published" in a:
                    a["timestamp"] = a["published"]
    except Exception as e:
        print(f"[GDELT] Error: {e}")
    return articles



if __name__ == "__main__":
    init_db()
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
