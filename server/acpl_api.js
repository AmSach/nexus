// ACPL Engine — JavaScript version reading directly from SQLite via Bun
import { Database } from 'bun:sqlite';

// Open the shared DB
const DB_PATH = '/home/workspace/nexus/nexus.db';

export async function GET(request) {
  const url = new URL(request.url);
  const question = url.searchParams.get('question') || '';
  const hours = parseInt(url.searchParams.get('hours') || '6');

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (e) {
    return Response.json({ error: 'DB not found', prob: 0, confidence: 0, signals: 0, engine: 'ACPL-JS' });
  }

  // Keywords → zone mapping
  const KEYWORDS = {
    ukraine: ['ukraine', 'russia', 'kiev', 'moscow', 'kyiv', 'donbas', 'Crimea', 'zelensky', 'putin', 'NATO ukraine', 'kremlin'],
    taiwan: ['taiwan', 'china', 'beijing', 'pla', 'tsmc', 'straits', 'xi jinping'],
    iran: ['iran', 'tehran', 'nuclear', 'iaea', 'khamenei', 'raisi', 'sanctions'],
    israe_palestine: ['israel', 'gaza', 'hamas', 'netanyahu', 'palestin', 'idf', 'west bank', 'jerusalem'],
    nato: ['nato', 'alliance', 'article 5', 'baltic', 'poland', 'russia nato', 'eastern europe'],
    cyber: ['cyber', 'hack', 'breach', 'ransomware', 'apt', 'malware', 'zero-day'],
    climate: ['climate', 'flood', 'drought', 'hurricane', 'wildfire', 'earthquake', 'storm'],
    military: ['military', 'troops', 'aircraft', 'warship', 'missile', 'drone', 'strike'],
    trade: ['tariff', 'trade', 'sanction', 'oil', 'sanctions', 'export', 'import'],
  };

  const ZONE_WEIGHTS = {
    ukraine: 0.9, taiwan: 0.85, iran: 0.75, israel_palestine: 0.7,
    nato: 0.65, military: 0.6, cyber: 0.5, trade: 0.5, climate: 0.3,
  };

  // Score keywords by zone relevance
  const q = question.toLowerCase();
  let bestZone = 'global', bestScore = 0;
  for (const [zone, kws] of Object.entries(KEYWORDS)) {
    const score = kws.filter(kw => q.includes(kw.toLowerCase())).length;
    if (score > bestScore) { bestScore = score; bestZone = zone; }
  }

  // Fetch alerts for window
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const alerts = db.query(
    "SELECT source, alert_type, severity, title, ts FROM alerts WHERE ts > ? ORDER BY ts DESC"
  ).all(cutoff);

  // Fetch GPSJam signals specifically
  const gpsSignals = alerts.filter(a => a.source === 'GPSJam');
  const conflictSources = new Set(['USNI', 'Liveuamap', 'Oref', 'BNO', 'Crisis24', 'Wiki', 'Reddit', 'Newsdata', 'Telegram']);
  const conflictSignals = alerts.filter(a =>
    conflictSources.has(a.source) ||
    ['conflict', 'naval', 'red_alert', 'gps_jam'].includes(a.alert_type)
  );

  const sevScore = { critical: 3, high: 2, medium: 1, low: 0 };
  const totalSev = alerts.reduce((s, a) => s + (sevScore[a.severity] || 0), 0);
  const avgSev = alerts.length ? totalSev / alerts.length : 0;
  const highCount = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;
  const alertCount = alerts.length;

  const p1 = Math.min(alertCount, 60) / 60 * 0.3;
  const p2 = Math.min(highCount, 10) / 10 * 0.25;
  const p3 = avgSev / 3 * 0.15;
  const p4 = Math.min(conflictSignals.length, 30) / 30 * 0.2;
  const p5 = Math.min(gpsSignals.length, 5) / 5 * 0.1;
  const rawProb = Math.max(p1 + p2 + p3 + p4 + p5, 0.02);

  const zoneMultiplier = ZONE_WEIGHTS[bestZone] || 0.4;
  const prob = Math.min(98, Math.round((rawProb * zoneMultiplier * 100 + 30) * 100) / 100);
  const confidence = Math.min(95, Math.round((alertCount / 60 + conflictSignals.length / 30) * 50));
  const escalation = alerts.filter(a => a.severity === 'critical').length > 0 ? 'HIGH' : alerts.filter(a => a.severity === 'high').length > 2 ? 'ELEVATED' : 'BASELINE';

  const sources = [...new Set(alerts.map(a => a.source))].slice(0, 8).map(s => ({ name: s, count: alerts.filter(a => a.source === s).length }));

  db.close();

  return Response.json({
    question, zone: bestZone, prob, confidence, escalation,
    signals: alertCount, conflictSignals: conflictSignals.length,
    highSeverity: highCount, avgSeverity: parseFloat(avgSev.toFixed(2)),
    gpsJams: gpsSignals.length, sources, engine: 'ACPL-JS', ts: new Date().toISOString()
  });
}
