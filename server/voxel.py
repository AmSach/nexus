"""VOX Engine v2 — Geopolitical Forecast with DS Combination + Market Calibration"""
import sys, json, math
sys.path.insert(0, '/home/workspace/nexus/server')
from nexus_db import conn
from datetime import datetime, timedelta, time as dttime

ZONES = ['israel_gaza','ukraine','iran','taiwan','nato','north_korea','south_china','syria','afghanistan','climate','cyber','global']

REGIME_THRESHOLDS = {'CALM':0.2, 'TENSE':0.5, 'CRISIS':0.75}

# Keywords mapping for question → zone matching
ZONE_KEYWORDS = {
    'ukraine': ['ukrain','russia','russian','kyiv','moscow','putin','donbas','ceasefire','kremlin','zelensky'],
    'israel_gaza': ['israel','gaza','palestin','hamas','hezbollah','netanyahu','ceasefire','idf'],
    'iran': ['iran','tehran','hormuz','persian','nuclear','iaea','sanction'],
    'taiwan': ['taiwan','china','chinese','pla','beijing',' Tsai','spratly','manila'],
    'nato': ['nato','europe','baltic','trump','sanction','eu ','european union','brussels'],
    'north_korea': ['korea','pyongyang','kim','missile','nuclear',' Artillery'],
    'south_china': ['manila','philippine','spratly','south china sea','sea dispute','naval'],
    'syria': ['syria','aleppo','assad','idf','turkey','kurdish'],
    'afghanistan': ['afghanistan','taliban','kabul','kandahar'],
    'cyber': ['cyber','hack','breach','cve','ransomware','malware','phishing'],
    'climate': ['flood','drought','earthquake','volcano','typhoon','hurricane','wildfire','climate'],
}

def sigmoid(x):
    return 1 / (1 + math.exp(-max(-15, min(15, x))))

def get_signal_prob(question_words):
    """Get probability from DB signals using keyword matching"""
    cutoff = datetime.now() - timedelta(hours=24)
    q_lower = ' '.join(question_words).lower()
    
    # Find matching zones
    matched_zones = []
    for zone, kws in ZONE_KEYWORDS.items():
        if any(kw in q_lower for kw in kws):
            matched_zones.append(zone)
    if not matched_zones:
        matched_zones = ['global']
    
    # Query signals for matched zones
    total_score = 0.0
    signal_count = 0
    source_set = set()
    zone_scores = []
    
    for zone in matched_zones:
        rows = conn.execute(
            "SELECT severity, source FROM signals WHERE zone = ? AND ts > ? LIMIT 200",
            (zone, cutoff)
        ).fetchall()
        if not rows:
            # Fallback: search by content keywords
            kw_pattern = f"%{zone.split('_')[0]}%"
            rows = conn.execute(
                "SELECT severity, source FROM signals WHERE (LOWER(title)||LOWER(COALESCE(description,''))) LIKE ? AND ts > ? LIMIT 100",
                (kw_pattern, cutoff)
            ).fetchall()
        
        zone_sig = 0.0
        for severity, source in rows:
            sev = {'critical':4,'high':3,'medium':2,'low':1}.get(severity, 1)
            zone_sig += sev
            source_set.add(source)
            signal_count += 1
        zone_scores.append((zone, zone_sig))
    
    if signal_count == 0:
        return 0.5, 0.0, [], set()
    
    # Normalize: total_score → probability via sigmoid
    for zone, score in zone_scores:
        total_score += score
    
    raw_prob = sigmoid(total_score / max(signal_count, 20) * 0.3)
    
    # Source diversity bonus
    source_bonus = min(len(source_set) * 0.05, 0.25)
    prob = min(raw_prob + source_bonus, 0.95)
    
    top_zones = sorted(zone_scores, key=lambda x: x[1], reverse=True)[:5]
    evidence = [{'zone':z,'score':round(s,3),'sources':len([r for r in conn.execute("SELECT source FROM signals WHERE zone=? AND ts>?",(z,cutoff)).fetchall()])} for z,s in top_zones]
    
    return prob, signal_count, evidence, source_set

def get_market_prob(question_words):
    """Get probability from Polymarket/Kalshi market data"""
    cutoff = datetime.now() - timedelta(hours=48)
    
    q_lower = ' '.join(question_words).lower()
    
    # Map question keywords to topic
    topic = None
    for kw in question_words:
        if kw.lower() in ['ukraine','russia','putin','ceasefire']: topic='ukraine'; break
        if kw.lower() in ['iran','nuclear','tehran']: topic='iran'; break
        if kw.lower() in ['taiwan','china','pla']: topic='taiwan'; break
        if kw.lower() in ['israel','gaza','hamas']: topic='israel'; break
        if kw.lower() in ['trump','tariff','economy']: topic='economy'; break
    
    if not topic:
        return None
    
    rows = conn.execute(
        "SELECT question, prob, volume, source FROM markets WHERE ts > ? AND resolved = 0 ORDER BY volume DESC LIMIT 10",
        (cutoff,)
    ).fetchall()
    
    for q, prob, vol, src in rows:
        q_lower_m = q.lower()
        if any(k in q_lower_m for k in [topic, topic.replace('_',''), topic.replace('_',' ')]):
            # Weighted by volume
            weight = min(math.log1p(vol) / 10, 1.0)
            return prob * 0.7 + 0.5 * 0.3  # combine with flat prior
    
    return None

def get_regime():
    """Determine current global regime from alert density"""
    cutoff = datetime.now() - timedelta(hours=6)
    
    counts = {}
    for sev in ['critical','high','medium','low']:
        c = conn.execute("SELECT COUNT(*) FROM signals WHERE severity = ? AND ts > ?", (sev, cutoff)).fetchone()[0]
        counts[sev] = c
    
    intensity = counts['critical']*4 + counts['high']*3 + counts['medium']*2 + counts['low']
    
    if intensity > 30: return 'CRISIS', 0.9
    if intensity > 15: return 'TENSE', 0.65
    if intensity > 5:  return 'TENSE', 0.4
    return 'CALM', 0.2

def predict_vox(question):
    """Main VOX prediction: combine signals + markets + regime"""
    words = [w.strip() for w in question.split() if len(w) > 2]
    
    # Get signal-based probability
    sig_prob, sig_count, evidence, sources = get_signal_prob(words)
    
    # Get market-based probability
    mkt_prob = get_market_prob(words)
    
    # Dempster-Shafer combination
    if mkt_prob is not None:
        # Two independent sources: signals + market
        # m(A) = sig_prob, m(B) = mkt_prob, m(Θ) = 1 - sig_prob - mkt_prob
        combined = sig_prob * mkt_prob + sig_prob * (1 - mkt_prob) + (1 - sig_prob) * mkt_prob
        # Simpler: weighted average with market weight = min(log(vol)/5, 0.4)
        final_prob = sig_prob * 0.6 + mkt_prob * 0.4
    else:
        final_prob = sig_prob
    
    # Regime
    regime, regime_prob = get_regime()
    
    # Confidence: higher when multiple sources agree
    source_count = len(sources) if sources else 0
    confidence = min(0.5 + source_count * 0.08, 0.95)
    
    # Market alignment (correlation between signal and market)
    if mkt_prob is not None:
        alignment = 1 - abs(sig_prob - mkt_prob)
    else:
        alignment = None
    
    # Brier score tracking
    brier = None
    
    reasoning = (
        f"Signal:{int(sig_prob*100)}% | "
        f"Market:{int(mkt_prob*100) if mkt_prob else 'N/A'}% | "
        f"DS:{int(final_prob*100)}% | "
        f"Regime:{regime} | "
        f"Conf:{int(confidence*100)}%"
    )
    
    return {
        "question": question,
        "probability": round(final_prob, 4),
        "raw_prob": round(final_prob, 4),
        "signal_prob": round(sig_prob, 4),
        "market_prob": round(mkt_prob, 4) if mkt_prob is not None else None,
        "regime": regime,
        "regime_prob": round(regime_prob, 4),
        "confidence": round(confidence, 4),
        "signal_count": sig_count,
        "source_count": source_count,
        "evidence": evidence,
        "market_alignment": round(alignment, 4) if alignment is not None else None,
        "reasoning": reasoning,
        "brier_score": brier,
        "engine": "VOX"
    }


def predict(qid, question, market_prices=None):
    return predict_vox(question)
