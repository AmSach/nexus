/**
 * Supabase Edge Function: ingest v3
 * Covers ALL data sources that hooks previously fetched client-side.
 * Runs every 60s via pg_cron. Each source has independent timeout.
 * No circular Vercel calls. Direct fetches only.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const FIRMS_KEY = Deno.env.get('FIRMS_KEY') || ''
const OTX_KEY   = Deno.env.get('OTX_KEY') || ''
const GROQ_KEY  = Deno.env.get('GROQ_KEY') || ''

async function shouldRun(): Promise<boolean> {
  // Don't use .single() — it throws when table is empty (first ever run)
  const { data } = await sb.from('ingest_log').select('run_at').order('run_at',{ascending:false}).limit(1)
  const last = data?.[0]
  return !last || (Date.now() - new Date(last.run_at).getTime()) > 80_000
}

async function get(url: string, ms=8000, hdrs: Record<string,string>={}): Promise<Response|null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(ms), headers: {'User-Agent':'NEXUS-Ingest/3.0',...hdrs} })
      .then(r => r.ok ? r : null)
  } catch { return null }
}

function contentId(type: string, name: string, src: string): string {
  const s = `${type}:${(name||'').slice(0,80)}:${src||''}`
  let h = 0; for (let i=0;i<s.length;i++) h=((h<<5)-h+s.charCodeAt(i))|0
  return `${type}_${Math.abs(h).toString(36)}`
}

const TTL: Record<string,number> = {
  earthquake:86400, aircraft:300, ship:600, milaircraft:300, warship:1800,
  conflict:172800, gdacs:21600, hurricane:10800, volcano:43200, flood:21600,
  disease:43200, nuclear:86400, cyber:21600, maritime:10800, firms:7200,
  telegram:86400, notam:7200, sigmet:3600, iss:120, alert:3600, finance:1800, default:14400,
}
const ttl = (t: string) => new Date(Date.now()+(TTL[t]||TTL.default)*1000).toISOString()

// ── ACPL (server-side) ────────────────────────────────────────────────────────
const BETA=0.35, LAMBDA=0.02
type M={data:number[];rows:number;cols:number}
const mat=(r:number,c:number):M=>({data:new Array(r*c).fill(0),rows:r,cols:c})
const mmul=(A:M,B:M):M=>{const C=mat(A.rows,B.cols);for(let i=0;i<A.rows;i++)for(let j=0;j<B.cols;j++){let s=0;for(let p=0;p<A.cols;p++)s+=A.data[i*A.cols+p]*B.data[p*B.cols+j];C.data[i*B.cols+j]=s}return C}
const vadd=(v:M,b:M):M=>({data:v.data.map((x,i)=>x+b.data[i]),rows:v.rows,cols:1})
const relu=(A:M):M=>({data:A.data.map(x=>Math.max(0,x)),rows:A.rows,cols:A.cols})
const sig=(x:number)=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))))
const vec=(a:number[]):M=>({data:a,rows:a.length,cols:1})

function ceForward(ce:any,f:M):{out:number} {
  if (!ce?.W1) return {out:0.3}
  const h1=relu(vadd(mmul(ce.W1,f),ce.b1))
  const h2=relu(vadd(mmul(ce.W2,h1),ce.b2))
  return {out:sig(vadd(mmul(ce.W3,h2),ce.b3).data[0])}
}

function acplAction(ce:any,signal:any,qRow:any):{action:number;ceScore:number;riskW:number} {
  const sm:Record<string,number>={critical:1,high:0.67,medium:0.33,low:0.1}
  const q=qRow?[qRow.q_suppress,qRow.q_low,qRow.q_high,qRow.q_escalate]:[0.3,0.5,0.4,0.2]
  let bestA=1,bestV=-Infinity
  for(let a=0;a<4;a++){
    const f=vec([sm[signal.severity]??0.33,Math.min((signal.sourceCount||1)/10,1),signal.convergenceScore||0,Math.min((signal.ageMinutes||0)/120,1),signal.noisySource?1:0,a/3])
    const{out}=ceForward(ce,f)
    const tau=([0,45,20,10][a]??30)*Math.max(0.2,1-(signal.ageMinutes||0)/180)
    const pen=q[a]-BETA*out*Math.exp(-LAMBDA*tau)
    if(pen>bestV){bestV=pen;bestA=a}
  }
  const fB=vec([sm[signal.severity]??0.33,Math.min((signal.sourceCount||1)/10,1),signal.convergenceScore||0,Math.min((signal.ageMinutes||0)/120,1),signal.noisySource?1:0,bestA/3])
  const{out:ceScore}=ceForward(ce,fB)
  const tau=([0,45,20,10][bestA]??30)*Math.max(0.2,1-(signal.ageMinutes||0)/180)
  return{action:bestA,ceScore,riskW:ceScore*Math.exp(-LAMBDA*tau)}
}

// ── XML/RSS parser ────────────────────────────────────────────────────────────
function parseRSS(xml: string, type: string, source: string, defaultSev='medium'): any[] {
  const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>m[1])
  return items.slice(0,30).map(it=>{
    const tag=(t:string)=>it.match(new RegExp(`<${t}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>(?:\\s*)`, 'i'))?.[1]?.trim().replace(/<[^>]+>/g,'')||''
    const title=tag('title'), link=tag('link'), desc=tag('description')
    if(!title) return null
    const latM=it.match(/geo:lat>([^<]+)/i),lngM=it.match(/geo:long>([^<]+)/i)
    return {type,severity:defaultSev,lat:latM?+latM[1]:null,lng:lngM?+lngM[1]:null,
      name:title.slice(0,200),desc:desc.slice(0,400),url:link,source,meta:{}}
  }).filter(Boolean)
}

// ── ALL DATA SOURCES ──────────────────────────────────────────────────────────

async function fetchEarthquakes() {
  const r=await get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/1.5_week.geojson')
  if(!r)return[]
  const d=await r.json().catch(()=>null)
  return(d?.features||[]).map((f:any)=>({
    type:'earthquake',severity:f.properties.mag>=7?'critical':f.properties.mag>=5?'high':f.properties.mag>=3?'medium':'low',
    lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0],
    name:`M${f.properties.mag.toFixed(1)} — ${f.properties.place}`,
    desc:`Depth ${f.geometry.coordinates[2]}km${f.properties.tsunami?' ⚠ TSUNAMI':''}`,
    url:f.properties.url,source:'USGS',meta:{mag:f.properties.mag,depth:f.geometry.coordinates[2],tsunami:f.properties.tsunami>0},
    event_date:new Date(f.properties.time).toISOString()
  }))
}

async function fetchGDACS() {
  const r=await get('https://www.gdacs.org/xml/rss.xml')
  if(!r)return[]
  return parseRSS(await r.text(),'gdacs','GDACS','high')
    .map(x=>({...x,lat:x.lat||0,lng:x.lng||0}))
}

async function fetchFIRMS() {
  const r=await get(`https://firms.modaps.eosdis.nasa.gov/api/country/csv/${FIRMS_KEY}/VIIRS_SNPP_NRT/World/1`)
  if(!r)return[]
  const txt=await r.text(),lines=txt.trim().split('\n')
  if(lines.length<2)return[]
  const h=lines[0].split(',')
  const latI=h.indexOf('latitude'),lngI=h.indexOf('longitude'),brI=h.indexOf('bright_ti4')>=0?h.indexOf('bright_ti4'):h.indexOf('brightness')
  return lines.slice(1,201).map((l:string)=>{
    const v=l.split(','),lat=+v[latI],lng=+v[lngI],bright=+v[brI]||0
    if(isNaN(lat)||isNaN(lng))return null
    return{type:'firms',severity:bright>450?'critical':bright>380?'high':'medium',lat,lng,
      name:`🔥 Fire (${bright.toFixed(0)}K)`,desc:'NASA VIIRS thermal anomaly',
      url:`https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${lng},${lat},10z`,source:'NASA FIRMS',meta:{bright}}
  }).filter(Boolean)
}

async function fetchNHC() {
  const r=await get('https://www.nhc.noaa.gov/CurrentStorms.json')
  if(!r)return[]
  const d=await r.json().catch(()=>null)
  return(d?.activeStorms||[]).map((s:any)=>({
    type:'hurricane',severity:'critical',lat:s.latLon?.lat||0,lng:s.latLon?.lon||0,
    name:`🌀 ${s.classification} ${s.name}`,desc:`${s.headline||''} Wind: ${s.intensity}kt`,
    url:s.publicAdvisoryUrl||'https://nhc.noaa.gov',source:'NHC',meta:{intensity:s.intensity}
  }))
}

async function fetchWHO() {
  const r=await get('https://www.who.int/rss-feeds/news-english.xml')
  if(!r)return[]
  return parseRSS(await r.text(),'disease','WHO','medium').map(x=>({...x,lat:x.lat||0,lng:x.lng||20}))
}

async function fetchProMED() {
  const r=await get('https://promedmail.org/feed/',8000,{'User-Agent':'Mozilla/5.0'})
  if(!r)return[]
  return parseRSS(await r.text(),'disease','ProMED','high').map(x=>({...x,lat:0,lng:20}))
}

async function fetchCISA() {
  const r=await get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json')
  if(!r)return[]
  const d=await r.json().catch(()=>null)
  return(d?.vulnerabilities||[]).slice(0,80).map((v:any)=>({
    type:'cyber',severity:'critical',lat:37.1,lng:-95.7,
    name:`⚠ KEV: ${v.cveID} — ${v.vendorProject}`,desc:`${v.product}: ${v.shortDescription}`.slice(0,200),
    url:`https://nvd.nist.gov/vuln/detail/${v.cveID}`,source:'CISA KEV',meta:{cveID:v.cveID}
  }))
}

async function fetchFeodo() {
  const r=await get('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json')
  if(!r)return[]
  const d=await r.json().catch(()=>null)
  const CLOCS:Record<string,number[]>={US:[37.1,-95.7],RU:[55.7,37.6],CN:[35.8,104.2],DE:[51.2,10.4],NL:[52.1,5.3]}
  return(d||[]).slice(0,50).map((b:any)=>{
    const co=CLOCS[b.country]||[0,0]
    return{type:'cyber',severity:'high',lat:co[0]+(Math.random()-0.5)*3,lng:co[1]+(Math.random()-0.5)*3,
      name:`💻 Botnet C2: ${b.ip_address||'server'}`,desc:`${b.malware||'Malware'} C2 · ${b.country}`,
      url:'https://feodotracker.abuse.ch',source:'Feodo Tracker',meta:{ip:b.ip_address,country:b.country}}
  })
}

async function fetchOTX() {
  const r=await get('https://otx.alienvault.com/api/v1/pulses/subscribed?limit=20',8000,{'X-OTX-API-KEY':OTX_KEY})
  if(!r)return[]
  const d=await r.json().catch(()=>null)
  return(d?.results||[]).slice(0,20).map((p:any)=>({
    type:'cyber',severity:'high',lat:37.1+(Math.random()-0.5)*20,lng:-95.7+(Math.random()-0.5)*40,
    name:`🎯 OTX: ${(p.name||'').slice(0,60)}`,desc:(p.description||'').slice(0,200),
    url:`https://otx.alienvault.com/pulse/${p.id}`,source:'AlienVault OTX',meta:{tags:p.tags}
  }))
}

async function fetchGDELT() {
  const queries=['conflict war military attack strike','ukraine russia nato','israel gaza hamas','iran nuclear weapons','china taiwan south china sea']
  const results:any[]=[]
  for(const q of queries){
    const r=await get(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=15&sort=HybridRel&format=json&timespan=24h`,8000)
    if(!r)continue
    const d=await r.json().catch(()=>null)
    ;(d?.articles||[]).forEach((a:any)=>{
      results.push({type:'conflict',severity:'medium',
        lat:a.geolocation?.latitude||null,lng:a.geolocation?.longitude||null,
        name:(a.title||'').slice(0,200),desc:(a.title||'').slice(0,300),
        url:a.url,source:'GDELT',meta:{tone:a.tone,domain:a.domain},
        event_date:a.seendate?new Date(a.seendate).toISOString():null})
    })
  }
  return results
}

async function fetchNWS() {
  const r=await get('https://api.weather.gov/alerts/active?status=actual&message_type=alert&severity=Extreme,Severe',8000,{'User-Agent':'NEXUS-Ingest/3.0 (nexus-intel.vercel.app)'})
  if(!r)return[]
  const d=await r.json().catch(()=>null)
  return(d?.features||[]).slice(0,30).map((f:any)=>{
    const p=f.properties
    return{type:'alert',severity:p.severity==='Extreme'?'critical':'high',
      lat:f.geometry?.coordinates?.[1]||null,lng:f.geometry?.coordinates?.[0]||null,
      name:`⛈ ${p.event}: ${p.areaDesc?.slice(0,60)}`,desc:(p.headline||'').slice(0,300),
      url:p.web||'https://weather.gov',source:'NWS',meta:{event:p.event,urgency:p.urgency}}
  })
}

async function fetchIAEA() {
  const r=await get('https://www.iaea.org/feeds/topstories.xml')
  if(!r)return[]
  return parseRSS(await r.text(),'nuclear','IAEA','medium').map(x=>({...x,lat:x.lat||48.2,lng:x.lng||16.4}))
}

async function fetchReliefWeb() {
  const r=await get('https://api.reliefweb.int/v1/disasters?appname=nexus&fields[include][]=name,country,primary_type,date,status&filter[field]=status&filter[value]=current&limit=50')
  if(!r)return[]
  const d=await r.json().catch(()=>null)
  const COUNTRY_LOCS:Record<string,number[]>={Ukraine:[48.4,31.2],Syria:[34.8,38.9],Sudan:[15,30],Afghanistan:[33.9,67.7],Yemen:[15.5,48.5],Somalia:[5.2,46.2],Myanmar:[21.9,95.9]}
  return(d?.data||[]).map((e:any)=>{
    const country=e.fields?.country?.[0]?.name||''
    const co=COUNTRY_LOCS[country]||[0,20]
    return{type:'humanitarian',severity:'high',lat:co[0]+(Math.random()-0.5)*3,lng:co[1]+(Math.random()-0.5)*3,
      name:`🆘 ${e.fields?.name||'Crisis'}`,desc:`${country} · ${e.fields?.primary_type?.name||''}`,
      url:`https://reliefweb.int/disaster/${e.id}`,source:'ReliefWeb',meta:{country}}
  })
}

async function fetchGCaptain() {
  const r=await get('https://gcaptain.com/feed/')
  if(!r)return[]
  return parseRSS(await r.text(),'maritime','gCaptain','low').map(x=>({...x,lat:x.lat||0,lng:x.lng||0}))
}

async function fetchKalshi() {
  const r=await get('https://trading-api.kalshi.com/trade-api/v2/markets?limit=200&status=open',10000)
  if(!r)return{markets:[]}
  return r.json().catch(()=>({markets:[]}))
}

async function fetchPolymarket() {
  const r=await get('https://clob.polymarket.com/markets?next_cursor=&limit=100',10000)
  if(!r)return{data:[]}
  return r.json().catch(()=>({data:[]}))
}

async function fetchRSSFeeds() {
  // Top 20 highest-value RSS feeds — covers what useNewsFeed does server-side
  const FEEDS=[
    {url:'https://feeds.bbci.co.uk/news/world/rss.xml',src:'BBC World',cat:'conflict'},
    {url:'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',src:'NYT World',cat:'conflict'},
    {url:'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml',src:'BBC Middle East',cat:'conflict'},
    {url:'https://feeds.reuters.com/Reuters/worldNews',src:'Reuters World',cat:'conflict'},
    {url:'https://www.aljazeera.com/xml/rss/all.xml',src:'Al Jazeera',cat:'conflict'},
    {url:'https://feeds.bbci.co.uk/news/technology/rss.xml',src:'BBC Tech',cat:'cyber'},
    {url:'https://krebsonsecurity.com/feed/',src:'Krebs Security',cat:'cyber'},
    {url:'https://www.bellingcat.com/feed/',src:'Bellingcat',cat:'conflict'},
    {url:'https://warontherocks.com/feed/',src:'War on the Rocks',cat:'conflict'},
    {url:'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',src:'WSJ Markets',cat:'finance'},
    {url:'https://www.navalnews.com/feed/',src:'Naval News',cat:'military'},
    {url:'https://gcaptain.com/feed/',src:'gCaptain',cat:'maritime'},
    {url:'https://oilprice.com/rss/main',src:'OilPrice',cat:'finance'},
    {url:'https://www.coindesk.com/arc/outboundfeeds/rss/',src:'CoinDesk',cat:'finance'},
    {url:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.atom',src:'USGS Quakes',cat:'earthquake'},
    {url:'https://www.crisisgroup.org/rss.xml',src:'Crisis Group',cat:'conflict'},
    {url:'https://outbreaknewstoday.com/feed/',src:'Outbreak News',cat:'disease'},
    {url:'https://www.bankofengland.co.uk/rss/news',src:'Bank of England',cat:'finance'},
    {url:'https://www.ecb.europa.eu/rss/press.html',src:'ECB',cat:'finance'},
    {url:'https://thediplomat.com/feed/',src:'The Diplomat',cat:'conflict'},
  ]
  const articles:any[]=[]
  await Promise.allSettled(FEEDS.map(async feed=>{
    const r=await get(feed.url,6000)
    if(!r)return
    const txt=await r.text()
    const items=[...txt.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>m[1])
    items.slice(0,5).forEach(it=>{
      const tag=(t:string)=>it.match(new RegExp(`<${t}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`, 'i'))?.[1]?.trim().replace(/<[^>]+>/g,'')||''
      const title=tag('title'),link=tag('link'),pubDate=tag('pubDate')
      if(!title||!link)return
      articles.push({title:title.slice(0,300),url:link,source:feed.src,category:feed.cat,
        severity:'low',pub:pubDate?new Date(pubDate).toISOString():null,fetched_at:new Date().toISOString()})
    })
  }))
  return articles
}

// ── Upsert helper ─────────────────────────────────────────────────────────────
async function upsertSignal(sig:any, ce:any, qMap:Record<string,any>): Promise<boolean> {
  if(!sig?.type||!sig?.name)return false
  const{action,ceScore,riskW}=acplAction(ce,sig,qMap[`${({critical:3,high:2,medium:1,low:0} as any)[sig.severity]??1}_1_0_0_0`])
  const{error}=await sb.from('signals').upsert({
    id:contentId(sig.type,sig.name||'',sig.source||''),
    type:sig.type,severity:sig.severity||'low',
    lat:sig.lat??null,lng:sig.lng??null,
    name:(sig.name||'').slice(0,200),description:(sig.desc||'').slice(0,500),
    url:sig.url,source:sig.source,meta:sig.meta||{},
    fetched_at:new Date().toISOString(),event_date:sig.event_date||null,
    expires_at:ttl(sig.type),
    acpl_action:['suppress','surface_low','surface_high','escalate'][action],
    acpl_ce:Math.round(ceScore*1000)/1000,acpl_risk_w:Math.round(riskW*1000)/1000,
  },{onConflict:'id'})
  return!error
}

// ── Main ──────────────────────────────────────────────────────────────────────
serve(async()=>{
  const t0=Date.now()
  if(!(await shouldRun()))return new Response(JSON.stringify({skipped:true}),{status:200})

  const errors:string[]=[]
  let sigNew=0,artNew=0,mktNew=0

  // Load ACPL state
  const[{data:ceRow},{data:qRows}]=await Promise.all([
    sb.from('acpl_ce_weights').select('weights').eq('id',1).limit(1),
    sb.from('acpl_qtable').select('*'),
  ])
  const ce=ceRow?.[0]?.weights||null
  const qMap:Record<string,any>={}
  ;(qRows||[]).forEach((r:any)=>qMap[r.state_key]=r)

  // Fetch all sources in parallel
  const[quakes,gdacs,fires,nhc,who,promed,cisa,feodo,otx,gdelt,nws,iaea,rw,kalshi,pm,rssArts]=
    await Promise.allSettled([
      fetchEarthquakes(),fetchGDACS(),fetchFIRMS(),fetchNHC(),fetchWHO(),fetchProMED(),
      fetchCISA(),fetchFeodo(),fetchOTX(),fetchGDELT(),fetchNWS(),fetchIAEA(),fetchReliefWeb(),
      fetchKalshi(),fetchPolymarket(),fetchRSSFeeds(),
    ])

  // Collect all signals
  const allSigs:any[]=[
    ...ok(quakes),...ok(gdacs),...ok(fires),...ok(nhc),...ok(who),...ok(promed),
    ...ok(cisa),...ok(feodo),...ok(otx),...ok(gdelt),...ok(nws),...ok(iaea),...ok(rw),
  ]

  // Upsert signals
  for(const sig of allSigs){
    if(await upsertSignal(sig,ce,qMap))sigNew++
    else errors.push(`${sig?.type}:${sig?.name?.slice(0,30)}`)
  }

  // Upsert markets
  const kalshiMkts=(ok(kalshi) as any)?.markets||[]
  const pmMkts=(ok(pm) as any)?.data||[]
  for(const m of [...kalshiMkts.slice(0,500),...pmMkts.slice(0,500)]){
    const id=m.ticker||m.market_slug||m.conditionId||m.id
    if(!id)continue
    const{error}=await sb.from('markets').upsert({
      id:String(id).slice(0,100),
      platform:m.ticker?'kalshi':'polymarket',
      title:(m.title||m.question||'').slice(0,300),
      probability:m.result?.price??m.lastPrice??m.bestYesPrice??null,
      volume:m.volume||m.volumeNum||null,
      url:m.ticker?`https://kalshi.com/markets/${m.ticker}`:`https://polymarket.com/event/${m.market_slug||id}`,
      category:m.category||'general',
      is_geo:/war|conflict|election|russia|china|iran|israel|ukraine|nato/i.test(m.title||m.question||''),
      meta:{title:m.title||m.question,probability:m.result?.price||m.lastPrice},
      updated_at:new Date().toISOString(),
    },{onConflict:'id'})
    if(!error)mktNew++
  }

  // Upsert articles
  const arts=ok(rssArts) as any[]||[]
  for(const a of arts){
    if(!a.title||!a.url)continue
    const{error}=await sb.from('articles').upsert({
      title:a.title,url:a.url,source:a.source,category:a.category,
      severity:a.severity||'low',pub:a.pub,fetched_at:new Date().toISOString(),
    },{onConflict:'url',ignoreDuplicates:true})
    if(!error)artNew++
  }

  await sb.from('ingest_log').insert({
    duration_ms:Date.now()-t0,signals_new:sigNew,articles_new:artNew,markets_new:mktNew,
    errors:errors.slice(0,20),summary:{sources:allSigs.length},
  })

  return new Response(JSON.stringify({ok:true,duration_ms:Date.now()-t0,sigNew,artNew,mktNew,errors:errors.length}),
    {status:200,headers:{'Content-Type':'application/json'}})
})

function ok<T>(r:PromiseSettledResult<T>):T extends any[]?T:never {
  return (r.status==='fulfilled'?r.value:[]) as any
}
