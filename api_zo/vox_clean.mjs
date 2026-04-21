import { Database } from 'bun:sqlite';
const DB = '/home/workspace/nexus/nexus.db';
const KW = {ukraine:['ukraine','russia','war','ceasefire','kiev','kyiv','donbas'],taiwan:['taiwan','china','beijing','pla'],iran:['iran','tehran','nuclear'],israel_palestine:['israel','gaza','hamas','ceasefire']};
const ZW = {ukraine:0.9,taiwan:0.85,iran:0.75,israel_palestine:0.7};
const CONFLICT_SOURCES = new Set(['USNI','Liveuamap','BNO','Oref','Crisis24','Wiki','Reddit','Newsdata','Telegram']);
const SEV = {critical:3,high:2,medium:1,low:0};
function ds(p) { return Math.min(0.99,Math.max(0.01,p)); }

export default async (c) => {
  const q = (c.req.query('question')||'').toLowerCase();
  let zone='global', best=0;
  for (const [z,kws] of Object.entries(KW)) {
    const s = kws.filter(k=>q.includes(k)).length;
    if (s>best) { best=s; zone=z; }
  }
  let db;
  try { db = new Database(DB,{readonly:true}); }
  catch(e) { return c.json({error:'DB unavailable:'+e.message}); }
  const h24 = new Date(Date.now()-86400000).toISOString().replace('T',' ').slice(0,19);
  const h6 = new Date(Date.now()-21600000).toISOString().replace('T',' ').slice(0,19);
  const a24 = db.query('SELECT source,alert_type,severity FROM alerts WHERE ts>? LIMIT 2000').all(h24);
  const a6 = db.query('SELECT source,alert_type,severity FROM alerts WHERE ts>? LIMIT 1000').all(h6);
  const mkts = db.query('SELECT prob,volume FROM markets WHERE ts>? AND resolved=0 LIMIT 50').all(h24);
  const confSig = a24.filter(a=>CONFLICT_SOURCES.has(a.source)||['conflict','naval','red_alert'].includes(a.alert_type));
  const hi24 = a24.filter(a=>a.severity==='critical'||a.severity==='high').length;
  const hi6 = a6.filter(a=>a.severity==='critical'||a.severity==='high').length;
  const avgSev = a24.length ? a24.reduce((s,a)=>s+(SEV[a.severity]||0),0)/a24.length : 0;
  const mediaP = Math.min(a24.length,60)/60*0.5 + hi24/Math.max(a24.length,1)*0.5;
  const signalP = Math.min(confSig.length,20)/20*0.6 + hi6/Math.max(a6.length,1)*0.4;
  const mktP = mkts.length ? mkts.reduce((s,m)=>s+parseFloat(m.prob||0.5),0)/mkts.length : 0.5;
  const dsMedia = ds(mediaP*0.7+mktP*0.3);
  const dsSignal = ds(signalP*0.6+mktP*0.4);
  const finalProb = Math.max(dsMedia,dsSignal,0.02);
  const prob = Math.min(98,Math.round((finalProb*(ZW[zone]||0.5)*100+30)*100)/100);
  const regime = prob>70?'CRISIS':prob>50?'TENSE':'CALM';
  const escalation = hi24>0||confSig.length>5;
  const aligned = mktP>0.5?'CONFIRMS':mktP<0.35?'CONTRADICTS':'NEUTRAL';
  db.close();
  return c.json({
    question:q, zone, probability:prob, regime, escalation,
    confidence: Math.min(95,Math.round((a24.length/60+mkts.length/20)*50)),
    evidence:{media:parseFloat(mediaP.toFixed(3)),signal:parseFloat(signalP.toFixed(3)),market:parseFloat(mktP.toFixed(3)),dsMedia:parseFloat(dsMedia.toFixed(3)),dsSignal:parseFloat(dsSignal.toFixed(3))},
    markets:{count:mkts.length,avgProb:mkts.length?parseFloat((mkts.reduce((s,m)=>s+parseFloat(m.prob||0),0)/mkts.length).toFixed(3)):null,aligned},
    alerts_24h:a24.length,conflict_signals:confSig.length,highSeverity_24h:hi24,avgSeverity:parseFloat(avgSev.toFixed(2)),
    engine:'VOX-JS-v2',ts:new Date().toISOString()
  });
};