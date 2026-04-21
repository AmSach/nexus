// VOX Engine v2 - Bun route handler
import { Database } from 'bun:sqlite';

export default async function handler(c) {
  const q = (c.req.query('question') || '').toLowerCase();
  const DB = '/home/workspace/nexus/nexus.db';
  const KW = {ukraine:['ukraine','russia','war','ceasefire','kiev','kyiv','donbas'],taiwan:['taiwan','china','beijing','pla'],iran:['iran','tehran','nuclear','iaea'],israel_palestine:['israel','gaza','hamas','ceasefire']};
  const ZW = {ukraine:0.9,taiwan:0.85,iran:0.75,israel_palestine:0.7};
  let zone='global', best=0;
  for (const [z,kws] of Object.entries(KW)) { const s=kws.filter(k=>q.includes(k)).length; if(s>best){best=s;zone=z;} }
  let db;
  try { db = new Database(DB, {readonly:true}); } catch { return c.json({error:'DB unavailable'}); }
  const h24 = new Date(Date.now()-86400000).toISOString().replace('T',' ').slice(0,19);
  const h6 = new Date(Date.now()-21600000).toISOString().replace('T',' ').slice(0,19);
  const a24 = db.query('SELECT source,severity FROM alerts WHERE ts>? LIMIT 1000').all(h24);
  const a6 = db.query('SELECT source,severity FROM alerts WHERE ts>? LIMIT 500').all(h6);
  const SEV = {critical:3,high:2,medium:1,low:0};
  const confSig = a24.filter(a=>['USNI','Liveuamap','BNO','Oref','Crisis24'].includes(a.source));
  const mediaP = Math.min(a24.length,60)/60*0.6 + a24.filter(a=>a.severity==='critical'||a.severity==='high').length/Math.max(a24.length,1)*0.4;
  const signalP = Math.min(confSig.length,20)/20*0.5 + a6.filter(a=>a.severity==='critical'||a.severity==='high').length/Math.max(a6.length,1)*0.5;
  const mkts = db.query('SELECT prob FROM markets WHERE ts>? AND resolved=0 LIMIT 20').all(h24);
  const mktP = mkts.length ? mkts.reduce((s,m)=>s+parseFloat(m.prob||0.5),0)/mkts.length : 0.5;
  // DS combination
  const ds = p => Math.min(0.99, Math.max(0.01, p));
  const dsM = ds(mediaP * 0.7 + mktP * 0.3);
  const dsS = ds(signalP * 0.6 + mktP * 0.4);
  const final = Math.max(dsM, dsS, 0.02);
  const prob = Math.min(98, Math.round((final * (ZW[zone]||0.5) * 100 + 30) * 100) / 100);
  const regime = prob>70?'CRISIS':prob>50?'TENSE':'CALM';
  const esc = a24.filter(a=>a.severity==='critical').length > 0 || confSig.length > 5;
  db.close();
  return c.json({
    question: q, zone, probability: prob, regime, escalation: esc?'HIGH':false,
    confidence: Math.min(95, Math.round((a24.length/60 + mkts.length/20) * 50)),
    evidence: {media: parseFloat(mediaP.toFixed(3)), signal: parseFloat(signalP.toFixed(3)), market: parseFloat(mktP.toFixed(3)), dsMedia: parseFloat(dsM.toFixed(3)), dsSignal: parseFloat(dsS.toFixed(3))},
    markets: {count: mkts.length, avgProb: mkts.length ? parseFloat((mkts.reduce((s,m)=>s+parseFloat(m.prob||0),0)/mkts.length).toFixed(3)) : null, aligned: mktP > 0.5 ? 'CONFIRMS' : mktP < 0.35 ? 'CONTRADICTS' : 'NEUTRAL'},
    alerts_24h: a24.length, conflict_signals: confSig.length, engine: 'VOX-JS', ts: new Date().toISOString()
  });
}
