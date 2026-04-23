import time
from datetime import datetime, timedelta
"""ACPL Engine — Adaptive Conflict Probability Locator"""
import sys, asyncio, aiohttp, math, re, json
sys.path.insert(0, '/home/workspace/nexus/server')
from nexus_db import conn

ZONE_WEIGHTS = {
    "ukraine":        {"base": 0.35, "instruments": ["NG", "CL", "GLD", "EUR"]},
    "israel_gaza":    {"base": 0.30, "instruments": ["CL", "WTI", "BRT"]},
    "taiwan":         {"base": 0.40, "instruments": ["TSLA", "AAPL", "NDX"]},
    "south_china_sea": {"base": 0.25, "instruments": ["FXI", "ED"]},
    "iran":           {"base": 0.30, "instruments": ["CL", "BRT", "XLE"]},
    "sahel":          {"base": 0.15, "instruments": ["NG", "GLD"]},
    "north_korea":   {"base": 0.20, "instruments": ["GLD", "JPY"]},
    "greece_turkey": {"base": 0.15, "instruments": ["EUR", "TRY"]},
}

ZONE_KWS = {
    "ukraine":        ["ukraine","russia","kyiv","donbas","crimea","kharkiv","zelensky","putin","kremlin","moscow","nato","mariupol"," Luhansk","russia ukraine","ukraine war","kremlin war","russian forces","moscow war"],
    "israel_gaza":    ["gaza","hamas","israel","palestinian","idf","netanyahu","gaza strip","west bank","hezbollah","lebanon","ceasefire","rafah","jerusalem","israel gaza","palestine","idf bombing","gaza war","israeli","palestinians"],
    "taiwan":         ["taiwan","china","pla","beijing","straits","tsmc","chinamil","xinjiang","hong kong","taipei","china taiwan","pla navy","south china sea","scs","beijing taiwan","taiwan strait","xi jinping"],
    "iran":           ["iran","tehran","iaea","uranium","JCPOA","persian","hormuz","sanctions","tehran","iran war","iran conflict","israel iran","hormuz blockade","iran attack","tehran war","iranian","persian gulf","revolutionary guard"],
    "north_korea":    ["north korea","kim","nuclear","missile","pyongyang","kim jong","musk","th nuclear","korean peninsula","dprk","korean","ballistic missile","nuclear test"],
    "south_china":    ["south china sea","scarborough","spratly","nansha","china sea","reef","vietnam","philippines","scs","china sea","manila","beijing sea","vietn"],
    "russia_nato":    ["nato","russia","baltic","poland","estonia","latvia","lithuania","finland","sweden nato","alliance","nato summit","europe nato","nato eastern","alliance","atlantic"],
    "syria":          ["syria","assad","aleppo","idlib","turkey","kurd","ros","damascus","syrian","homs","syrian war"],
    "yemen":          ["yemen","houthis","sanaa","red sea","aden","houthi","yemeni","saudi yemen","yemen war","houthi attack","red sea shipping"],
    "afghanistan":    ["afghanistan","taliban","kabul","kandahar","isis-k","afghan","taliban","kabul"],
    "nato":           ["nato","russia","baltic","poland","estonia","latvia","lithuania","finland","sweden nato","alliance","nato summit","europe nato","nato eastern","alliance","atlantic","nato defense"],
    "global":         ["conflict","war","attack","military","troops","invasion","standoff","crisis","escalation","breach","threat","security","tensions","dispute","clash"],
    "cyber":          ["cyber","hack","ransomware","breach","malware","phishing","apt","zero-day","cve","exploit","hacker","cyberattack","data breach","vulnerability","ransom","spyware"],
    "climate":        ["climate","flood","drought","heatwave","hurricane","wildfire","earthquake","tsunami","eruption","disaster","cyclone","typhoon","tornado","famine","heat","flooding"],
}


SEV_SCORES = {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.2}
CAT_WEIGHTS = {"conflict": 0.9, "military": 0.8, "disease": 0.7, "disaster": 0.6, "cyber": 0.5, "political": 0.5, "economic": 0.3}

def zone_score(title, desc):
    text = ((title or "") + " " + (desc or "")).lower()
    scores = {}
    for zone, kws in ZONE_KWS.items():
        score = sum(1 for kw in kws if kw in text)
        if score > 0:
            scores[zone] = score
    return scores

def recency_weight(ts_str):
    try:
        age_min = (time.time() - datetime.fromisoformat(ts_str).timestamp()) / 60
        return math.exp(-age_min / 120)
    except:
        return 0.1

def predict(question_id, question):
    cutoff = datetime.fromtimestamp(time.time() - 24 * 3600).isoformat()
    signals = conn.execute(
        "SELECT title, description, severity, category, ts, source FROM signals WHERE ts >= ? ORDER BY ts DESC LIMIT 500",
        (cutoff,)
    ).fetchall()
    
    if not signals:
        return {"prob": 0.5, "confidence": 0.05, "signal_count": 0, "reasoning": "No recent signals", "engine": "ACPL"}
    
    zone_scores = {z: {"raw": 0, "weighted": 0, "sources": set()} for z in ZONE_KWS}
    q_zones = zone_score(question, question)
    
    for title, desc, severity, category, ts, source in signals:
        rw = recency_weight(ts)
        ss = SEV_SCORES.get(severity, 0.1)
        cw = CAT_WEIGHTS.get(category, 0.3)
        raw = rw * ss * cw
        z_scores = zone_score(title or "", desc or "")
        for z, zs in z_scores.items():
            zone_scores[z]["raw"] += raw
            base = ZONE_WEIGHTS.get(z, {}).get("base", 0.25)
            zone_scores[z]["weighted"] += raw * base
            zone_scores[z]["sources"].add(source or "unknown")
    
    relevant = q_zones if q_zones else list(zone_scores.keys())
    total_w, total_s = 0, 0
    evidence = []
    for z in relevant:
        d = zone_scores[z]
        if d["weighted"] > 0:
            norm = math.tanh(d["weighted"] * 2)
            w = ZONE_WEIGHTS.get(z, {}).get("base", 0.25)
            total_s += norm * w
            total_w += w
            if d["sources"]:
                evidence.append({"zone": z, "score": round(d["weighted"], 3), "sources": len(d["sources"])})
    
    base = total_s / total_w if total_w > 0 else 0.1
    prob = max(0.01, min(0.99, base))
    
    n_sig = len(signals)
    n_src = len(set(s[5] for s in signals))
    conf = min(0.95, 0.1 + 0.002 * n_sig + 0.01 * n_src)
    
    prior = 0.5
    final = prior * 0.7 + prob * 0.3
    
    evidence.sort(key=lambda x: x["score"], reverse=True)
    top = evidence[0] if evidence else None
    reasoning = f"ACPL: {n_sig} signals from {n_src} sources, {len(evidence)} zone matches"
    if top:
        reasoning += f". Top: {top['zone']} (score={top['score']}, {top['sources']} sources)"
    
    return {
        "prob": round(final, 3),
        "confidence": round(conf, 3),
        "signal_count": n_sig,
        "source_count": n_src,
        "evidence": evidence[:5],
        "reasoning": reasoning,
        "engine": "ACPL",
    }

if __name__ == "__main__":
    print(json.dumps(predict("test", "Will there be a ceasefire in Ukraine by June 2026?")))
