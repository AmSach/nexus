#!/usr/bin/env python3
"""NEXUS v4.3.8 — Populate SQLite database with seed data"""
import sqlite3, json, time
from datetime import datetime, timedelta

DB = '/home/workspace/nexus/nexus.db'

def seed():
    conn = sqlite3.connect(DB)
    c = conn.cursor()

    # Seed prices
    prices = [
        ('SPY', 512.34, 0.45, 82000000),
        ('QQQ', 438.21, 0.82, 45000000),
        ('GLD', 231.50, -0.12, 12000000),
        ('CL=F', 78.42, 1.23, 0),
        ('BTC', 67450.00, 2.15, 0),
        ('ETH', 3520.00, 1.87, 0),
        ('EUR/USD', 1.0842, 0.03, 0),
        ('USD/JPY', 154.82, 0.15, 0),
        ('USD/ILS', 3.72, 0.28, 0),
        ('USD/RUB', 92.50, 0.45, 0),
    ]
    now = datetime.now()
    for sym, price, chg, vol in prices:
        c.execute('INSERT OR IGNORE INTO prices(symbol,price,change_pct,volume,ts) VALUES(?,?,?,?,?)',
                  (sym, price, chg, vol, now.isoformat()))

    # Seed market predictions
    markets = [
        ('kalshi-ukraine-ceasefire', 'Ukraine ceasefire before 2025?', 0.32, 12000000, 'kalshi', 0),
        ('kalshi-fed-cut', 'Fed rate cut June 2025?', 0.65, 8500000, 'kalshi', 0),
        ('polymarket-gaza', 'Gaza ceasefire Q2 2025?', 0.28, 5200000, 'polymarket', 0),
        ('polymarket-iran', 'Iran nuclear deal 2025?', 0.41, 3100000, 'polymarket', 0),
    ]
    for mid, q, prob, vol, src, res in markets:
        c.execute('INSERT OR IGNORE INTO markets(market_id,question,prob,volume,source,resolved,ts) VALUES(?,?,?,?,?,?,?)',
                  (mid, q, prob, vol, src, res, now.isoformat()))

    # Seed signals
    hotspots = [
        (52.52, 13.405, 'Berlin, Germany', 'conflict', 'high', ['Ukraine', 'NATO']),
        (48.86, 2.35, 'Paris, France', 'political', 'medium', ['EU', 'France']),
        (31.77, 35.21, 'Jerusalem', 'conflict', 'critical', ['Israel', 'Gaza', 'Middle East']),
        (50.11, 8.68, 'Frankfurt', 'financial', 'low', ['ECB', 'Euro']),
        (55.75, 37.62, 'Moscow, Russia', 'conflict', 'critical', ['Russia', 'Ukraine', 'NATO']),
        (40.71, -74.01, 'New York, USA', 'financial', 'medium', ['Fed', 'USD']),
        (39.90, 116.41, 'Beijing, China', 'geopolitical', 'high', ['China', 'Taiwan', 'South China Sea']),
        (-33.87, 151.21, 'Sydney, Australia', 'commodity', 'low', ['AUD', 'Commodities']),
        (1.35, 103.82, 'Singapore', 'financial', 'medium', ['Asia', 'FX']),
        (21.51, 39.18, 'Red Sea', 'conflict', 'critical', ['Houthi', 'Shipping', 'Maritime']),
        (34.05, -118.24, 'Los Angeles, USA', 'social', 'low', ['US', 'Markets']),
        (31.05, 30.10, 'Suez Canal', 'maritime', 'critical', ['Shipping', 'Energy', 'Commodities']),
        (22.32, 114.17, 'Hong Kong', 'financial', 'medium', ['China', 'Hang Seng']),
        (15.5, 90.0, 'Bay of Bengal', 'cyclone', 'high', ['Cyclone', 'India', 'Bangladesh']),
    ]
    categories = ['conflict', 'financial', 'political', 'maritime', 'disease', 'cyber', 'social', 'commodity']
    sources = ['GDELT', 'Telegram', 'RSS', 'Reddit', 'OpenSanctions', 'NWS', 'GPSJam']
    for lat, lng, name, cat, sev, tags in hotspots:
        title = f"Signal: {name}"
        c.execute('''INSERT OR IGNORE INTO signals(title,source,category,severity,lat,lng,country,tags,score,ts)
                      VALUES(?,?,?,?,?,?,?,?,?,?)''',
                  (title, sources[hash(name) % len(sources)], cat, sev, lat, lng,
                   name.split(',')[-1].strip(), ','.join(tags), 0.5 + (hash(name) % 50)/100,
                   (now - timedelta(hours=hash(name) % 72)).isoformat()))

    # Seed alerts
    alert_types = [
        ('nws', 'critical', 'Tornado Warning — Kansas City Metro', 'KS, MO area until 6PM CDT', 39.10, -94.58),
        ('gpsjam', 'high', 'GPS Jamming Detected — Baltic Region', 'Estonia/Finland border corridor', 59.50, 25.00),
        ('disease', 'high', 'ProMED: H5N1 Avian Flu — Midwest US', 'Iowa poultry farms affected', 41.88, -93.10),
        ('gdacs', 'critical', 'Earthquake M6.2 — Papua New Guinea', '5km depth, 30km NW of Kimbe', -5.50, 150.00),
        ('oref', 'critical', 'Red Alert: rocket fire toward Tel Aviv', 'Central Israel impact zones', 32.08, 34.78),
        ('weather', 'high', 'Flash Flood Warning — Houston Metro', 'Harris County until 8PM CDT', 29.76, -95.37),
    ]
    for atype, sev, title, detail, lat, lng in alert_types:
        c.execute('''INSERT OR IGNORE INTO alerts(source,alert_type,title,detail,severity,lat,lng,ts)
                      VALUES(?,?,?,?,?,?,?,?)''',
                  (sources[hash(title) % len(sources)], atype, title, detail, sev, lat, lng,
                   (now - timedelta(minutes=hash(title) % 180)).isoformat()))

    conn.commit()
    print(f"Seeded DB at {DB}")

    # Verify counts
    for table in ['signals', 'prices', 'markets', 'alerts']:
        c.execute(f'SELECT COUNT(*) FROM {table}')
        print(f"  {table}: {c.fetchone()[0]} rows")

    conn.close()

if __name__ == '__main__':
    seed()
