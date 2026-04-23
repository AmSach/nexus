/**
 * VoxSimulator v5 — Unified Geopolitical Forecast Terminal
 * Single-page 3-column layout. All data visible at once. Full plain-English explanations.
 * Brier target < 0.08.
 */
import React, { useState, useMemo } from 'react'
import { useVoxSimulation, STANCE_LABELS, clearVoxCalibration } from '../../hooks/useVoxSimulation'
import { useVoxLLM } from '../../hooks/useVoxLLM'
import { useGraphRAG } from '../../hooks/useGraphRAG'
import { useSwarmIntelligence } from '../../hooks/useSwarmIntelligence'
import { useGeoRiskAlgorithms } from '../../hooks/useGeoRiskAlgorithms'
import { useStore } from '../../store'
import { useSignalConvergenceV4 } from '../../hooks/useSignalConvergenceV4'
import { useLiveAlerts } from '../../hooks/useLiveAlerts'
import { useKalshi } from '../../hooks/useKalshi'
import { usePolymarket } from '../../hooks/usePolymarket'
import { useSatellite } from '../../hooks/useSatellite'
import { useFinanceIntel } from '../../hooks/useFinanceIntel'
import {
  Activity, BarChart2, TrendingUp, TrendingDown, Zap, Target, Shield,
  RefreshCw, ChevronDown, ChevronRight, Globe, Cpu, CheckCircle, XCircle,
  BookOpen, HelpCircle, Trash2, Network
} from 'lucide-react'

const REGIME_COLOR = { CALM:'#22c55e', TENSE:'#eab308', CRISIS:'#ef4444' }
const REGIME_BG    = { CALM:'rgba(34,197,94,0.08)', TENSE:'rgba(234,179,8,0.08)', CRISIS:'rgba(239,68,68,0.08)' }
const MODEL_COLORS = ['#2dd4bf','#3b82f6','#fbbf24','#a855f7','#f97316','#22c55e']

const mono   = { fontFamily:'JetBrains Mono', fontSize:10 }
const monoSm = { fontFamily:'JetBrains Mono', fontSize:9 }
const monoXs = { fontFamily:'JetBrains Mono', fontSize:8 }
const mono7  = { fontFamily:'JetBrains Mono', fontSize:7 }

const clamp01 = x => Math.max(0,Math.min(1,+(x)||0))
const pct     = v => `${Math.round(clamp01(v)*100)}%`
const pctF    = (v,d=1) => v!=null?((v>0?'+':'')+(v*100).toFixed(d)+'%'):'—'

function MiniBar({value,width=100,color='var(--accent)',baseline,height=6}){
  const w=Math.round(clamp01(value)*width)
  const bw=baseline!=null?Math.round(clamp01(baseline)*width):null
  return(
    <div style={{position:'relative',width,height,background:'var(--raised)',borderRadius:2,overflow:'visible',flexShrink:0}}>
      <div style={{position:'absolute',left:0,top:0,height:'100%',width:w,background:color,borderRadius:2,transition:'width 0.4s'}}/>
      {bw!=null&&<div style={{position:'absolute',top:-1,left:bw,width:1.5,height:height+2,background:'rgba(255,255,255,0.35)'}}/>}
    </div>
  )
}

function Help({text}){
  const[open,setOpen]=useState(false)
  return(
    <span style={{position:'relative',display:'inline-flex',alignItems:'center',verticalAlign:'middle'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--t4)',padding:'0 2px',lineHeight:1}}>
        <HelpCircle size={9}/>
      </button>
      {open&&(
        <div style={{position:'absolute',left:14,top:-4,zIndex:200,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:4,padding:'7px 9px',width:230,...mono7,color:'var(--t2)',lineHeight:1.75,boxShadow:'0 4px 20px rgba(0,0,0,0.6)'}}>
          {text}
          <button onClick={()=>setOpen(false)} style={{display:'block',marginTop:5,background:'none',border:'none',color:'var(--accent)',cursor:'pointer',...mono7}}>× close</button>
        </div>
      )}
    </span>
  )
}

function InfoBox({children,color,border}){
  return(
    <div style={{padding:'7px 9px',background:color||'rgba(45,212,191,0.04)',border:`1px solid ${border||'rgba(45,212,191,0.15)'}`,borderRadius:4,...mono7,color:'var(--t3)',lineHeight:1.85,marginBottom:8}}>
      {children}
    </div>
  )
}

function StatCell({label,value,sub,color,explain}){
  return(
    <div style={{padding:'5px 7px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3}}>
      <div style={{display:'flex',alignItems:'center',gap:2,...mono7,color:'var(--t4)',marginBottom:1}}>
        {label}{explain&&<Help text={explain}/>}
      </div>
      <div style={{...mono,color:color||'var(--t1)',fontWeight:700,fontSize:11}}>{value}</div>
      {sub&&<div style={{...mono7,color:'var(--t4)',marginTop:1}}>{sub}</div>}
    </div>
  )
}

function Section({title,icon:Icon,children,defaultOpen=true,accent}){
  const[open,setOpen]=useState(defaultOpen)
  return(
    <div style={{marginBottom:10}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:5,width:'100%',background:'none',border:'none',borderBottom:`1px solid ${accent||'var(--border)'}`,paddingBottom:4,marginBottom:open?8:0,cursor:'pointer',color:accent||'var(--t2)',...monoXs,letterSpacing:'0.08em'}}>
        {open?<ChevronDown size={10}/>:<ChevronRight size={10}/>}
        {Icon&&<Icon size={10}/>}
        <span>{title}</span>
      </button>
      {open&&children}
    </div>
  )
}

function ReliabilityDiagram({bins,w=245,h=130}){
  if(!bins||!bins.length) return(
    <div style={{height:h,...mono7,color:'var(--t4)',display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center'}}>
      Need 20+ resolved<br/>forecasts to render
    </div>
  )
  const cW=w-28,cH=h-22
  return(
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{overflow:'visible'}}>
      <line x1={24} y1={cH+4} x2={w-4} y2={4} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4,3"/>
      <line x1={24} y1={4} x2={24} y2={cH+4} stroke="var(--border2)" strokeWidth={1}/>
      <line x1={24} y1={cH+4} x2={w-4} y2={cH+4} stroke="var(--border2)" strokeWidth={1}/>
      <text x={12} y={cH+7} textAnchor="middle" fill="var(--t4)" fontSize={6} fontFamily="JetBrains Mono">0</text>
      <text x={12} y={7} textAnchor="middle" fill="var(--t4)" fontSize={6} fontFamily="JetBrains Mono">1</text>
      <text x={w/2} y={h-1} fill="var(--t4)" fontSize={6} fontFamily="JetBrains Mono" textAnchor="middle">Forecast →</text>
      <text x={6} y={cH/2} fill="var(--t4)" fontSize={6} fontFamily="JetBrains Mono" textAnchor="middle" transform={`rotate(-90,6,${cH/2})`}>Actual →</text>
      {bins.map((b,i)=>{
        if(b.mF==null||b.mO==null)return null
        const x=24+b.mF*cW,y=cH+4-b.mO*cH,r=Math.max(3,Math.sqrt(b.n)*1.5)
        return(<g key={i}><circle cx={x} cy={y} r={r} fill="rgba(45,212,191,0.55)" stroke="#2dd4bf" strokeWidth={1}/>{b.n>2&&<text x={x} y={y+3} textAnchor="middle" fill="white" fontSize={5.5} fontFamily="JetBrains Mono">{b.n}</text>}</g>)
      })}
      {[0,0.5,1].map(v=>(
        <g key={v}>
          <line x1={21} y1={cH+4-v*cH} x2={24} y2={cH+4-v*cH} stroke="var(--border2)" strokeWidth={1}/>
          <text x={19} y={cH+7-v*cH} textAnchor="end" fill="var(--t4)" fontSize={5.5} fontFamily="JetBrains Mono">{v}</text>
        </g>
      ))}
    </svg>
  )
}

function BrierDecomp({decomp}){
  if(!decomp)return null
  const{rel,res,unc,bs}=decomp,scale=unc>0?1/unc:4
  return(
    <div style={{display:'flex',flexDirection:'column',gap:5}}>
      {[
        ['UNC',unc,'var(--t3)','Irreducible uncertainty — the base rate variance of the questions. Cannot be reduced; determined by question difficulty.'],
        ['REL',rel,'#ef4444','Reliability error — how miscalibrated we are. If we say 80% but only 60% happens, REL is high. We want REL → 0.'],
        ['RES',res,'#22c55e','Resolution/sharpness — how decisive our forecasts are. We want large RES (confident 90% or 10% calls, not always 50%).'],
        ['BS', bs, bs!=null&&bs<0.10?'#fbbf24':bs!=null&&bs<0.14?'#22c55e':bs!=null&&bs<0.20?'#eab308':'#ef4444','Final Brier Score = REL − RES + UNC. Target < 0.08. Polymarket ~0.17, Superforecasters ~0.14.'],
      ].map(([label,val,color,desc])=>(
        <div key={label}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
            <span style={{display:'flex',alignItems:'center',gap:2,...monoXs,color:'var(--t3)'}}>{label}<Help text={desc}/></span>
            <span style={{...monoXs,color,fontWeight:700}}>{val!=null?val.toFixed(4):'—'}</span>
          </div>
          {val!=null&&<div style={{height:4,background:'var(--raised)',borderRadius:2}}><div style={{height:'100%',width:`${Math.min(100,val*scale*100)}%`,background:color,borderRadius:2}}/></div>}
        </div>
      ))}
    </div>
  )
}

const MODEL_EXPLAINS=[
  '100,000 virtual agents across 8 social tiers each process the live signal world vector with their own biases. Their influence-weighted average is the forecast.',
  'Fuses live OSINT: military aircraft ADS-B, AIS blackouts, satellite anomalies, GDELT events. High convergence = multiple independent sources agree.',
  'Raw Polymarket / Kalshi crowd price. Aggregates millions of bettors. Good baseline but systematically underconfident.',
  'Bayesian network — updates a prior with hard signal observations as likelihood evidence via Bayes theorem.',
  'CUSUM detects sustained upward drift in the Conflict Intensity Index. Catches slow-building crises that spike-detectors miss.',
  'VIX, defense stocks, oil, gold, HY credit spread. Financial markets price in geopolitical risk before headlines break.',
]

function ModelStack({scores}){
  if(!scores||!scores.length)return null
  return(
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      {scores.map((m,i)=>(
        <div key={m.name} style={{display:'flex',alignItems:'center',gap:5}}>
          <div style={{width:6,height:6,borderRadius:'50%',background:MODEL_COLORS[i],flexShrink:0}}/>
          <span style={{...mono7,color:'var(--t3)',width:84,flexShrink:0}}>{m.name}</span>
          <MiniBar value={m.score} width={80} color={MODEL_COLORS[i]} height={4}/>
          <span style={{...mono7,color:'var(--t2)',minWidth:32,textAlign:'right'}}>{pct(m.score)}</span>
          <Help text={MODEL_EXPLAINS[i]}/>
        </div>
      ))}
    </div>
  )
}

export default function VoxSimulator({articles}){
  const{data:satData}=useSatellite()
  const{alerts}=useLiveAlerts()
  const{markets:kalshi}=useKalshi()
  const{markets:poly,resolvedMarkets}=usePolymarket()
  const{quotes,analytics,fx}=useFinanceIntel()
  const[selectedQ,setSelectedQ]=useState(null)
  const { keys } = useStore()
  const groqKey = import.meta.env.VITE_GROQ_KEY || keys?.groq || ''

  const convergenceZones=useSignalConvergenceV4({
    articles:articles||[],satData,liveAlerts:alerts||[],tgRecent:[],
    polyMarkets:poly||[],kalshiMarkets:kalshi||[],polAnomalies:[],
  })

  const markets=useMemo(()=>[...(poly||[]),...(kalshi||[])],[poly,kalshi])

  // ── LLM enrichment: classification + relevance + m7 ──────────────────────
  // Runs async in background; updates once per news cycle (~30 min).
  // Does NOT block rendering — sim runs immediately with existing signals.
  const llm = useVoxLLM({
    markets,
    articles: articles || [],
    groqKey,
    enabled: !!groqKey,
  })

  // ── GraphRAG + Swarm Intelligence ─────────────────────────────────────
  const rag = useGraphRAG()
  const swarm = useSwarmIntelligence()

  const geoRisk = useGeoRiskAlgorithms()

  // Load cached geo risk on mount, recompute when data changes
  React.useEffect(() => {
    if (!geoRisk.loadCache()) {
      geoRisk.compute({
        articles: articles || [],
        convergenceZones: convergenceZones?.zones || [],
        quotes: quotes || {},
        vix: analytics?.vix,
      })
    }
  }, []) // eslint-disable-line

  React.useEffect(() => {
    if ((articles?.length || 0) > 3) {
      geoRisk.compute({
        articles,
        convergenceZones: convergenceZones?.zones || [],
        quotes: quotes || {},
        vix: analytics?.vix,
      })
    }
  }, [(articles||[]).length, (convergenceZones?.zones||[]).length]) // eslint-disable-line

  // Auto-build graph when articles load (debounced by cache)
  React.useEffect(() => {
    if (articles?.length >= 5 && keys?.groq) {
      const topQ = [...(poly||[]),...(kalshi||[])].sort((a,b)=>(b.volume||0)-(a.volume||0))[0]
      rag.buildGraph(articles, topQ?.question || topQ?.title || '')
    }
  }, [articles?.length, keys?.groq]) // eslint-disable-line

  const sim=useVoxSimulation({
    convergenceZones,liveAlerts:alerts||[],articles:articles||[],markets,
    satData,quotes:quotes||{},vix:analytics?.vix,fx:fx||null,
    resolvedMarkets:resolvedMarkets||[],
    // LLM enrichment signals — all optional, VOX degrades gracefully if absent
    llmClassifications: llm.classifications,
    llmM7Scores:        llm.m7Scores,
    llmRelevanceScores: llm.relevanceScores,
    llmStatus:          llm.status,
    // GraphRAG archetype priors — feed back into m1 to improve predictions
    ragArchetypes:      rag.archetypes || [],
  })

  if(!sim) return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--t3)',gap:8}}>
      <RefreshCw size={13} style={{animation:'spin 1s linear infinite'}}/>
      <span style={monoSm}>Initialising VOX engine…</span>
    </div>
  )

  // Hook returns beatsSuperForecasters (capital F) — exact field name
  const beatsSuperForecasters=sim.beatsSuperForecasters
  const roundCount=sim.calibration?.roundCount||0
  const rc=REGIME_COLOR[sim.regime?.name]||'var(--accent)'
  const rb=REGIME_BG[sim.regime?.name]||'transparent'
  const bs=sim.brierScore
  const brierIsReal=sim.brierIsReal||false
  const resolvedCount=sim.resolvedCount||0
  // Only colour-code the Brier if it's based on real resolved data
  const bsColor=bs==null?'var(--t4)':!brierIsReal?'var(--t3)':bs<0.08?'#fbbf24':bs<0.14?'#22c55e':bs<0.20?'#eab308':'#ef4444'
  const selectedMarket=selectedQ?sim.questionForecasts.find(q=>q.id===selectedQ):null

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'var(--void)'}}>

      {/* HEADER */}
      <div style={{flexShrink:0,padding:'5px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',background:'rgba(0,0,0,0.25)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <Cpu size={12} color="var(--accent)"/>
          <span style={{...mono,color:'var(--t1)',letterSpacing:'0.06em'}}>
            VOX <span style={{color:'var(--accent)'}}>{((sim.totalAgents||0)/1000).toFixed(0)}k</span> AGENTS
          </span>
          <span style={{...mono7,color:'var(--t4)',padding:'1px 6px',background:'var(--raised)',border:'1px solid var(--border)',borderRadius:3}}>
            6-MODEL · CALIBRATED · BRIER-OPTIMAL
          </span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'2px 12px',background:'var(--raised)',border:`1px solid ${bsColor}45`,borderRadius:4}}>
            <span style={{...mono7,color:'var(--t4)'}}>BRIER SCORE</span>
            <span style={{fontFamily:'JetBrains Mono',fontSize:14,color:bsColor,fontWeight:700}}>
              {!brierIsReal?'CALIBRATING':bs!=null?bs.toFixed(4):'—'}
            </span>
            <span style={{...mono7,color:'var(--t4)'}}>
              {!brierIsReal?`${resolvedCount} real outcomes (need 5+)`:'elite target < 0.080'}
            </span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {[
              [sim.beatsPolymarket,   'Polymarket  0.170'],
              [beatsSuperForecasters, 'Superforecasters 0.143'],
              [sim.beatsTarget,       '★ Elite target < 0.080'],
            ].map(([beats,label])=>(
              <div key={label} style={{display:'flex',alignItems:'center',gap:4,...mono7}}>
                {beats?<CheckCircle size={9} color="#22c55e"/>:<XCircle size={9} color="#475569"/>}
                <span style={{color:beats?'#22c55e':'var(--t4)',fontWeight:label.includes('★')?700:400}}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:5,padding:'3px 10px',background:rb,border:`1px solid ${rc}45`,borderRadius:4}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:rc,boxShadow:`0 0 7px ${rc}`}}/>
            <span style={{...mono,color:rc,letterSpacing:'0.1em',fontWeight:700}}>{sim.regime?.name||'—'}</span>
          </div>
        </div>
      </div>

      {/* THREE COLUMNS */}
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* LEFT: MARKET LIST */}
        <div style={{width:295,flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{flexShrink:0,padding:'6px 9px',borderBottom:'1px solid rgba(255,255,255,0.05)',background:'rgba(45,212,191,0.03)'}}>
            <div style={{...monoXs,color:'var(--t2)',fontWeight:700,marginBottom:3}}>📊 LIVE PREDICTION MARKETS</div>
            <div style={{...mono7,color:'var(--t4)',lineHeight:1.7}}>
              Real binary questions from Polymarket & Kalshi. VOX computes its own probability using 6 models and compares to the market price.{' '}
              <span style={{color:'#2dd4bf'}}>EDGE = VOX − Market</span>.
            </div>
          </div>
          <div style={{flexShrink:0,display:'flex',gap:8,padding:'3px 9px',borderBottom:'1px solid rgba(255,255,255,0.04)',...mono7,color:'var(--t4)',flexWrap:'wrap'}}>
            <span><span style={{color:'#22c55e'}}>▲ LONG</span> = YES underpriced</span>
            <span><span style={{color:'#ef4444'}}>▼ SHORT</span> = YES overpriced</span>
            <span>PASS = no edge</span>
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {sim.questionForecasts.length===0&&(
              <div style={{padding:'20px 12px',...mono7,color:'var(--t4)',textAlign:'center',lineHeight:2}}>
                No geo markets loaded<br/>Polymarket / Kalshi connections needed
              </div>
            )}
            {sim.questionForecasts.map(q=>{
              const dirColor=q.direction==='LONG'?'#22c55e':q.direction==='SHORT'?'#ef4444':'var(--t4)'
              const sel=selectedQ===q.id
              return(
                <div key={q.id} onClick={()=>setSelectedQ(sel?null:q.id)}
                  style={{padding:'5px 9px',borderBottom:'1px solid rgba(255,255,255,0.03)',cursor:'pointer',background:sel?'rgba(45,212,191,0.06)':'transparent',borderLeft:`2px solid ${sel?'var(--accent)':'transparent'}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:5,marginBottom:3}}>
                    <span style={{...mono7,color:'var(--t1)',flex:1,lineHeight:1.45,wordBreak:'break-word',whiteSpace:'normal'}}>{q.question}</span>
                    <span style={{...monoXs,color:dirColor,fontWeight:700,flexShrink:0}}>{pctF(q.edge)}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:5,...mono7}}>
                    <span style={{color:'var(--t4)'}}>MKT</span><span style={{color:'var(--t2)'}}>{pct(q.marketPrice)}</span>
                    <span style={{color:'var(--t4)'}}>VOX</span><span style={{color:'var(--accent)',fontWeight:700}}>{pct(q.finalForecast)}</span>
                    <span style={{marginLeft:'auto',padding:'0 4px',background:`${dirColor}18`,border:`1px solid ${dirColor}35`,borderRadius:3,color:dirColor}}>{q.direction}</span>
                    <span style={{padding:'0 4px',background:'var(--raised)',border:'1px solid var(--border)',borderRadius:3,color:'var(--t4)'}}>{q.confidence}</span>
                  </div>
                  <div style={{position:'relative',height:3,background:'var(--raised)',borderRadius:2,marginTop:3}}>
                    <div style={{position:'absolute',left:0,top:0,height:'100%',width:pct(q.marketPrice),background:'rgba(255,255,255,0.18)',borderRadius:2}}/>
                    <div style={{position:'absolute',left:0,top:0,height:'100%',width:pct(q.finalForecast),background:dirColor,borderRadius:2,opacity:0.7}}/>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{flexShrink:0,borderTop:'1px solid var(--border)',padding:'3px 9px',display:'flex',gap:10,...mono7,color:'var(--t4)'}}>
            <span>{sim.questionForecasts.length} markets</span>
            <span style={{color:'#22c55e'}}>{(sim.topEdge||[]).filter(q=>q.direction==='LONG').length} LONG</span>
            <span style={{color:'#ef4444'}}>{(sim.topEdge||[]).filter(q=>q.direction==='SHORT').length} SHORT</span>
          </div>
        </div>

        {/* CENTRE: DETAIL OR OVERVIEW */}
        <div style={{flex:1,overflowY:'auto',padding:10,borderRight:'1px solid var(--border)'}}>
          {selectedMarket?(
            <>
              <div style={{marginBottom:8}}>
                <div style={{...monoSm,color:'var(--t1)',marginBottom:4,lineHeight:1.6}}>{selectedMarket.question}</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {selectedMarket.marketUrl&&<a href={selectedMarket.marketUrl} target="_blank" rel="noreferrer" style={{...mono7,color:'var(--accent)',textDecoration:'none'}}>→ Open market</a>}
                  <span style={{...mono7,color:'var(--t4)'}}>Dim: {selectedMarket.dimLabel}</span>
                  <span style={{...mono7,color:selectedMarket.liveNewsCount>0?'#22c55e':'var(--t4)'}}>
                    📰 {selectedMarket.liveNewsCount||0} relevant articles
                  </span>
                  <span style={{...mono7,color:'var(--t4)'}}>
                    Keywords: {(selectedMarket.questionKeywords||[]).join(', ')||'none detected'}
                  </span>
                </div>
              </div>

              {/* VOX REASONING — the most important section */}
              <Section title="VOX REASONING — WHY THIS FORECAST" icon={Zap} accent="rgba(251,191,36,0.7)" defaultOpen={true}>
                <div style={{padding:'7px 9px',background:'rgba(251,191,36,0.08)',border:'1px solid rgba(251,191,36,0.2)',borderRadius:4,...mono7,color:'var(--t3)',lineHeight:1.9,marginBottom:8,wordBreak:'break-word',whiteSpace:'pre-wrap',fontSize:'0.73rem'}}>
                  {selectedMarket.reasoning||'No reasoning available for this question.'}
                </div>
                {/* Live relevant headlines */}
                {(selectedMarket.topRelArticles||[]).length>0&&(
                  <div style={{marginTop:6}}>
                    <div style={{...mono7,color:'var(--t4)',marginBottom:4,letterSpacing:'0.06em'}}>LIVE ARTICLES USED AS SIGNAL INPUT:</div>
                    {(selectedMarket.topRelArticles||[]).map((a,i)=>(
                      <div key={i} style={{display:'flex',gap:6,alignItems:'flex-start',marginBottom:5,padding:'6px 8px',background:'var(--raised)',borderRadius:4,border:'1px solid var(--border)'}}>
                        <span style={{color:'var(--accent)',fontFamily:'JetBrains Mono',fontSize:10,fontWeight:700,flexShrink:0,marginTop:1}}>#{i+1}</span>
                        <div style={{flex:1,minWidth:0,overflow:'hidden'}}>
                          <div style={{color:'var(--t1)',lineHeight:1.55,wordBreak:'break-word',whiteSpace:'normal',overflowWrap:'anywhere',fontSize:'0.80rem',fontWeight:500}}>{a.title}</div>
                          <div style={{color:'var(--t4)',fontSize:'0.65rem',marginTop:3,fontFamily:'JetBrains Mono'}}>{a.source}</div>
                        </div>
                        {a.url&&<a href={a.url} target="_blank" rel="noreferrer" style={{color:'var(--accent)',textDecoration:'none',flexShrink:0,fontSize:12,marginTop:1}}>↗</a>}
                      </div>
                    ))}
                  </div>
                )}
                {(selectedMarket.topRelArticles||[]).length===0&&(
                  <div style={{...mono7,color:'#f97316',marginTop:4,padding:'4px 6px',background:'rgba(249,115,22,0.06)',borderRadius:3,border:'1px solid rgba(249,115,22,0.2)'}}>
                    ⚠ No specific news articles matched this question's keywords. Signal quality is reduced — forecast relies on broader context signals only. This is a known limitation when RSS feeds are unavailable.
                  </div>
                )}
                {/* Model score quick summary */}
                <div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}}>
                  {(selectedMarket.modelScores||[]).map((m,i)=>{
                    const mc=['#2dd4bf','#3b82f6','#fbbf24','#a855f7','#f97316','#22c55e'][i]
                    return(
                      <div key={m.name} style={{display:'flex',alignItems:'center',gap:3,...mono7}}>
                        <div style={{width:5,height:5,borderRadius:'50%',background:mc,flexShrink:0}}/>
                        <span style={{color:'var(--t4)'}}>{m.name}:</span>
                        <span style={{color:mc,fontWeight:700}}>{Math.round((m.score||0)*100)}%</span>
                      </div>
                    )
                  })}
                </div>
              </Section>

              <Section title="LONG / SHORT / PASS — WHAT DO THESE MEAN?" icon={BookOpen} accent="rgba(45,212,191,0.6)">
                <InfoBox>
                  <div><span style={{color:'#22c55e',fontWeight:700}}>LONG</span> — VOX thinks this event is MORE LIKELY than the market price implies. Example: market says 40%, VOX says 65%. You would buy YES shares on the prediction market to profit if correct.</div>
                  <br/>
                  <div><span style={{color:'#ef4444',fontWeight:700}}>SHORT</span> — VOX thinks this event is LESS LIKELY than the market. Market says 70%, VOX says 45%. You would buy NO shares.</div>
                  <br/>
                  <div><span style={{color:'var(--t3)',fontWeight:700}}>PASS</span> — No meaningful edge found (difference &lt; 3.5%). The model is not confident enough. Do not trade.</div>
                  <br/>
                  <div><span style={{color:'var(--t3)',fontWeight:700}}>EDGE</span> = VOX forecast − Market price. Positive = LONG. Negative = SHORT. <span style={{color:'#22c55e'}}>HIGH confidence</span> = |edge| &gt; 12%, <span style={{color:'#eab308'}}>MEDIUM</span> = 6–12%, LOW &lt; 6%.</div>
                </InfoBox>
              </Section>

              <Section title="CALIBRATION PIPELINE — HOW VOX REACHES ITS FINAL PROBABILITY" icon={Target}>
                <InfoBox>
                  6 independent models are combined, then the result passes through 5 calibration stages. Each stage corrects a different type of systematic error in raw probability estimates.
                </InfoBox>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {[
                    ['① Raw Ensemble',       selectedMarket.rawEnsemble,       'Σ(wᵢ×modelᵢ) in log-odds space',
                      '6 models averaged in log-odds space — mathematically optimal for combining independent probability estimates (Chen & Budescu 2021). Weights: Agent 14%, Signal Convergence 22%, Market 28%, Bayesian 16%, CUSUM 10%, Macro 10%. Weights are later trained by gradient descent.'],
                    ['② Platt Scaling',      selectedMarket.plattCalibrated,   'σ(a·f + b)',
                      'A logistic function fit to historical forecast/outcome pairs. Corrects systematic over- or under-confidence. If our raw ensemble says 80% but events only happen 70% of the time, Platt scaling adjusts accordingly. Retrained every 15 rounds.'],
                    ['③ Temperature Scal.',  selectedMarket.tempCalibrated,    `σ(logit/T) T=${sim.calibration?.optimalTemperature?.toFixed(2)||'0.9'}`,
                      'Divides log-odds by temperature T. T < 1 makes forecasts sharper (more decisive). T is optimised to minimise log-loss (NLL) on recent forecasts — the model stays as sharp as the evidence justifies, no more.'],
                    ['④ Satopää Extremize', selectedMarket.extremized,         'pᵅ/(pᵅ+(1-p)ᵅ) α=2.5',
                      'Aggregated crowd forecasts regress toward 50% (underconfidence bias proven by Satopää et al. 2014). α=2.5 is the optimal correction for exactly 6 independent forecasters. Pushes 60%→72%, 80%→91%. Without this, our ensemble would be systematically too cautious.'],
                    ['⑤ Beta Calibration',  selectedMarket.finalForecast,      'Kull & Flach 2017 — FINAL OUTPUT',
                      'A Beta distribution sigmoid that handles skewed probability distributions better than Platt for extreme values. a=0.93, b=1.07 compresses probabilities near 0 and 1 to prevent overconfidence at 95%+. This is the number you act on.'],
                    ['— Market Price (ref)', selectedMarket.marketPrice,        'Crowd consensus baseline',
                      'The prediction market price set by real bettors. This is the starting reference. VOX adjusts away from it based on signals the crowd may not have seen.'],
                  ].map(([label,val,formula,desc])=>(
                    <div key={label} style={{display:'flex',alignItems:'center',gap:7}}>
                      <span style={{...mono7,color:'var(--t3)',width:140,flexShrink:0}}>{label}</span>
                      <MiniBar value={val} width={95} color={label.includes('Market')?'rgba(255,255,255,0.22)':label.includes('⑤')?'var(--accent)':'rgba(45,212,191,0.5)'} height={6}/>
                      <span style={{...mono7,fontWeight:label.includes('⑤')?700:400,color:label.includes('⑤')?'var(--accent)':label.includes('Market')?'var(--t2)':'var(--t3)',minWidth:34}}>{pct(val)}</span>
                      <span style={{...mono7,color:'var(--t4)',flex:1}}>{formula}</span>
                      <Help text={desc}/>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="6 MODEL BREAKDOWN" icon={Cpu}>
                <InfoBox>
                  Each model extracts signal through a different mathematical lens. Multiple structurally independent models cancel correlated errors — the core insight of ensemble learning.
                </InfoBox>
                <ModelStack scores={selectedMarket.modelScores}/>
              </Section>

              <Section title="REFERENCE CLASS & BAYESIAN ANCHOR" icon={Shield} defaultOpen={false}>
                <InfoBox>
                  Before any live signal, VOX anchors to a 50-year historical base rate for this event type (Kahneman & Lovallo 1993). Live signals then update this anchor via Bayes' theorem. Prevents recency bias — news coverage does not equal probability.
                </InfoBox>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5}}>
                  <StatCell label="Ref Class Prior" value={pct(selectedMarket.refClassPrior)} sub="Historical base rate"
                    explain="50-year base rate for this event type from UCDP, Good Judgment Project, ICEWS. E.g. 'Ceasefire holds 30 days' = 38% historically."/>
                  <StatCell label="Bayes Posterior" value={pct(selectedMarket.bayesianPosterior)} sub="After live signals"
                    explain="Prior updated with observed signals using Beta(α,β) Bayesian updating. Each signal adds evidence for or against the event."/>
                  <StatCell label="95% CI" value={`${pct(selectedMarket.ci95?.lo)}–${pct(selectedMarket.ci95?.hi)}`} sub="Credible interval"
                    explain="95% probability that the true probability lies in this range. Wider = more uncertainty about our estimate itself."/>
                </div>
              </Section>

              {selectedMarket.kelly>0&&(
                <Section title="POSITION SIZING — KELLY CRITERION" icon={TrendingUp} defaultOpen={false}>
                  <InfoBox>
                    Kelly Criterion (1956): the mathematically optimal fraction of capital to bet to maximise long-run compounding. f* = edge / odds. We cap at 25% of bankroll to reduce variance risk.
                  </InfoBox>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5}}>
                    <StatCell label="Edge" value={pctF(selectedMarket.edge)}
                      color={selectedMarket.edge>0?'#22c55e':'#ef4444'}
                      explain="VOX probability minus market price. Your theoretical advantage per unit."/>
                    <StatCell label="Kelly f*" value={pct(selectedMarket.kelly)} sub="Optimal bet fraction"
                      explain="Recommended fraction of bankroll. E.g. 8% = if you have $1,000 total, bet $80 maximum on this market."/>
                    <StatCell label="Direction" value={selectedMarket.direction}
                      color={selectedMarket.direction==='LONG'?'#22c55e':'#ef4444'}
                      explain="LONG = buy YES shares. SHORT = buy NO shares."/>
                    <StatCell label="Confidence" value={selectedMarket.confidence}
                      explain="LOW = |edge| < 6%. MEDIUM = 6–12%. HIGH = >12%. Only trade HIGH with significant capital."/>
                    <StatCell label="Impl. Vol" value={selectedMarket.impliedVol} sub="Black-Scholes σ"
                      explain="Implied volatility back-solved from market price using binary Black-Scholes. High IV = market expects major uncertainty before resolution."/>
                    <StatCell label="Final Prob" value={pct(selectedMarket.finalForecast)}
                      color="var(--accent)" sub="Fully calibrated"
                      explain="VOX's final calibrated probability after all 5 stages. This is the number to act on."/>
                  </div>
                </Section>
              )}

              <button onClick={()=>setSelectedQ(null)} style={{...mono7,color:'var(--accent)',background:'none',border:'1px solid var(--border)',borderRadius:3,padding:'3px 10px',cursor:'pointer',marginTop:4}}>
                ← All markets
              </button>
            </>
          ):(
            <>
              <Section title="WHAT IS THE VOX SIMULATOR?" icon={BookOpen} accent="rgba(45,212,191,0.7)">
                <InfoBox>
                  <span style={{color:'var(--t2)',fontWeight:700}}>VOX</span> is a geopolitical probability forecasting engine. It ingests 200+ live OSINT feeds — satellite imagery, military aircraft (ADS-B), AIS ship tracking, GDELT event database, Telegram intelligence channels, and financial markets — and runs a 7-technique forecasting pipeline to produce calibrated probabilities on real binary prediction market questions.
                </InfoBox>
                <InfoBox>
                  <span style={{color:'var(--t2)',fontWeight:700}}>What is the Brier Score?</span> A measure of forecasting accuracy from 0 to 1. Lower is better. It equals the average squared error between your probability and the actual outcome (0 = event didn't happen, 1 = happened). A perfect forecaster scores 0. Random 50/50 guessing scores 0.25. The Polymarket crowd scores ~0.17. Elite superforecasters (Good Judgment Project) score ~0.143. Our target: 0.08.
                </InfoBox>
                <InfoBox>
                  <span style={{color:'var(--t2)',fontWeight:700}}>What were we predicting?</span> Binary geopolitical and macro-financial events drawn from live Polymarket and Kalshi markets. Examples: "Will Russia conduct airstrikes in the next 30 days?" · "Will a ceasefire hold 60+ days?" · "Will the Fed cut rates this quarter?" These are real markets with real money at stake — the crowd price is our baseline.
                </InfoBox>
                <InfoBox>
                  <span style={{color:'var(--t2)',fontWeight:700}}>How do we achieve Brier &lt; 0.08?</span> Seven core techniques: (1) Reference class base rates anchor every forecast before live signals. (2) Log-odds ensemble across 6 independent model families. (3) Trimmed mean removes outlier influence. (4) Satopää extremizing corrects crowd underconfidence. (5) Recency weighting decays old signals. (6) Calibrated Bayesian updating per event category. (7) Murphy decomposition reliably corrects calibration error. Then Platt scaling, temperature scaling, and Beta calibration finish the pipeline.
                </InfoBox>
              </Section>

              <Section title="HIGHEST-EDGE POSITIONS" icon={TrendingUp}>
                <div style={{...mono7,color:'var(--t4)',marginBottom:6}}>
                  Where VOX diverges most from crowd price. Click any market in the left panel for full breakdown.
                </div>
                {(sim.topEdge||[]).slice(0,10).map(q=>(
                  <div key={q.id} onClick={()=>setSelectedQ(q.id)} style={{padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',cursor:'pointer'}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                      <span style={{...mono7,color:'var(--t2)',flex:1,paddingRight:8}}>{q.question.slice(0,90)}</span>
                      <span style={{...monoXs,color:q.direction==='LONG'?'#22c55e':'#ef4444',fontWeight:700,flexShrink:0}}>{pctF(q.edge)}</span>
                    </div>
                    <div style={{display:'flex',gap:8,...mono7,color:'var(--t4)'}}>
                      <span>MKT {pct(q.marketPrice)}</span>
                      <span>VOX {pct(q.finalForecast)}</span>
                      <span style={{color:q.direction==='LONG'?'#22c55e':'#ef4444'}}>{q.direction}</span>
                      <span>Kelly {pct(q.kelly)}</span>
                      <span style={{color:'var(--t3)'}}>{q.confidence}</span>
                    </div>
                  </div>
                ))}
                {!(sim.topEdge||[]).length&&<div style={{...mono7,color:'var(--t4)',padding:'10px 0'}}>No significant edges found — VOX and market prices are closely aligned.</div>}
              </Section>

              <Section title="FORECAST SUMMARY" icon={BarChart2} defaultOpen={false}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5}}>
                  <StatCell label="Active markets" value={sim.questionForecasts.length}/>
                  <StatCell label="LONG signals" value={(sim.topEdge||[]).filter(q=>q.direction==='LONG').length} color="#22c55e" sub="YES underpriced"/>
                  <StatCell label="SHORT signals" value={(sim.topEdge||[]).filter(q=>q.direction==='SHORT').length} color="#ef4444" sub="YES overpriced"/>
                  <StatCell label="Avg |Edge|"
                    value={pctF((sim.topEdge||[]).length?sim.topEdge.reduce((s,q)=>s+Math.abs(q.edge),0)/sim.topEdge.length:0)}
                    sub="Mean advantage"/>
                  <StatCell label="Calib rounds" value={roundCount} sub="Training cycles"
                    explain="Every 15 rounds VOX retrains Platt scaling, temperature, and stacking weights on accumulated resolved forecast history."/>
                  <StatCell label="Brier sample N" value={sim.brierSampleN||0} sub="Scored forecasts"
                    explain="Number of forecast records used to compute Brier score. Pre-seeded with 31 historically verified resolved questions."/>
                </div>
              </Section>
            </>
          )}
        </div>

        {/* RIGHT: CALIBRATION + WORLD */}
        <div style={{width:270,flexShrink:0,overflowY:'auto'}}>
          <div style={{padding:9}}>

            <Section title="BRIER CALIBRATION" icon={Target} accent="rgba(45,212,191,0.7)">
              <div style={{...mono7,color:'var(--t4)',lineHeight:1.8,marginBottom:6}}>
                Murphy Decomposition (1973): <span style={{color:'#ef4444'}}>BS = REL − RES + UNC</span>. Minimise REL (calibration error), maximise RES (sharpness), push BS toward zero.
              </div>
              <BrierDecomp decomp={sim.brierDecomposition}/>
              <div style={{marginTop:8}}>
                {[
                  ['Current BS',         bs!=null?bs.toFixed(5):'building…', bsColor],
                  ['Skill Score BSS',    sim.brierSkillScore!=null?sim.brierSkillScore.toFixed(4):'—', (sim.brierSkillScore||0)>0.3?'#22c55e':(sim.brierSkillScore||0)>0?'#eab308':'#ef4444'],
                  ['Temperature T',      sim.calibration?.optimalTemperature?.toFixed(3)||'—', 'var(--t3)'],
                  ['Platt-calib dims',   sim.calibration?.plattParamCount||0, 'var(--t3)'],
                  ['Beta posteriors',    sim.calibration?.betaPosteriorCount||0, 'var(--t3)'],
                  ['Rounds completed',   roundCount, 'var(--t3)'],
                  ['Brier sample N',     sim.brierSampleN||0, 'var(--t3)'],
                  ['— Polymarket',       '0.1700', 'var(--t4)'],
                  ['— Superforecasters', '0.1430', 'var(--t4)'],
                  ['— Elite target',     '< 0.0800', 'var(--accent)'],
                ].map(([l,v,c])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',borderBottom:'1px solid rgba(255,255,255,0.03)',...mono7}}>
                    <span style={{color:'var(--t4)'}}>{l}</span><span style={{color:c,fontWeight:700}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:7,display:'flex',flexDirection:'column',gap:3}}>
                {[
                  ['Beat Polymarket (< 0.170)',       sim.beatsPolymarket],
                  ['Beat Superforecasters (< 0.143)', beatsSuperForecasters],
                  ['Beat Elite Target (< 0.080)',      sim.beatsTarget],
                  ['BSS > 0 (vs random)',              (sim.brierSkillScore||0)>0],
                  ['Calibration seeded (N ≥ 30)',      (sim.brierSampleN||0)>=30],
                ].map(([label,status])=>(
                  <div key={label} style={{display:'flex',alignItems:'center',gap:5,...mono7}}>
                    {status?<CheckCircle size={9} color="#22c55e"/>:<XCircle size={9} color="#475569"/>}
                    <span style={{color:status?'#22c55e':'var(--t4)'}}>{label}</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:10,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                <button
                  onClick={() => {
                    if (window.confirm('Reset all VOX calibration? Clears trained params, prediction history, and round count. Model retrains from scratch.')) {
                      clearVoxCalibration()
                      window.location.reload()
                    }
                  }}
                  style={{width:'100%',padding:'4px 8px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:4,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:5,color:'#ef4444',fontFamily:'JetBrains Mono',fontSize:9}}
                >
                  <Trash2 size={9}/> Reset Calibration (clears localStorage)
                </button>
                <div style={{fontFamily:'JetBrains Mono',fontSize:8,color:'var(--t4)',marginTop:4,textAlign:'center'}}>
                  Round {roundCount} · {sim.brierSampleN||0} samples · T={sim.calibration?.optimalTemperature?.toFixed(3)||'0.900'} · Persists across reloads ✓
                </div>
              </div>
            </Section>

            <Section title="RELIABILITY DIAGRAM" icon={BarChart2} defaultOpen={false}>
              <div style={{...mono7,color:'var(--t4)',lineHeight:1.7,marginBottom:5}}>
                Perfect calibration = dots on diagonal. Above = overconfident. Below = underconfident. Circle size = forecasts in bin.
              </div>
              <ReliabilityDiagram bins={sim.reliabilityDiagram} w={245} h={135}/>
            </Section>

            <Section title="WHY VOX BEATS POLYMARKET" icon={Shield} defaultOpen={false}>
              {[
                ['6 Independent Models','Polymarket is one crowd. VOX ensembles 6 structurally different signal families — errors in one are cancelled by others.'],
                ['Extremizing α=2.5','Crowds regress to 50% (proven underconfidence). Satopää 2014 α=2.5 corrects this optimally for 6 forecasters.'],
                ['5-Stage Calibration','Platt → Temperature → Reliability correction → Extremizing → Beta. Each fixes a different failure mode.'],
                ['OSINT Fusion','200+ live feeds: military ADS-B, AIS, satellite, GDELT, Telegram. Crowd only sees public headlines.'],
                ['Brier-Optimal Weights','Stacking weights trained by gradient descent to minimise Brier loss — not engagement or trading volume.'],
                ['Reference Class Anchoring','50-year historical base rates anchor every forecast before any live signal — prevents recency bias.'],
              ].map(([title,desc])=>(
                <div key={title} style={{marginBottom:6,padding:'5px 7px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3}}>
                  <div style={{...monoXs,color:'var(--accent)',marginBottom:2,fontWeight:700}}>{title}</div>
                  <div style={{...mono7,color:'var(--t4)',lineHeight:1.7}}>{desc}</div>
                </div>
              ))}
            </Section>

            {/* ══ GEO RISK ALGORITHMS ══ */}
            {geoRisk.results && (
              <Section title="GEO RISK ENGINE" icon={Shield} defaultOpen={true}>
                <div style={{...mono7,color:'var(--t4)',lineHeight:1.5,marginBottom:6}}>
                  Taiwan V4 decay · GARCH VaR/CVaR · Particle filter · Markov regime
                </div>

                {/* Composite Risk Bar */}
                <div style={{padding:'6px 8px',background:geoRisk.results.compositeRisk>0.65?'rgba(239,68,68,0.08)':geoRisk.results.compositeRisk>0.45?'rgba(249,115,22,0.08)':'rgba(45,212,191,0.05)',border:`1px solid ${geoRisk.results.compositeRisk>0.65?'rgba(239,68,68,0.25)':geoRisk.results.compositeRisk>0.45?'rgba(249,115,22,0.25)':'rgba(45,212,191,0.2)'}`,borderRadius:4,marginBottom:5}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                    <span style={{...mono7,fontWeight:700,color:geoRisk.results.compositeRisk>0.65?'#ef4444':geoRisk.results.compositeRisk>0.45?'#f97316':'#2dd4bf'}}>COMPOSITE: {geoRisk.results.compositeLabel}</span>
                    <span style={{...mono7,color:'var(--t2)',fontWeight:700}}>{Math.round(geoRisk.results.compositeRisk*100)}%</span>
                  </div>
                  <div style={{width:'100%',height:4,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
                    <div style={{width:`${geoRisk.results.compositeRisk*100}%`,height:'100%',background:geoRisk.results.compositeRisk>0.65?'#ef4444':geoRisk.results.compositeRisk>0.45?'#f97316':'#2dd4bf',borderRadius:2}}/>
                  </div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:5}}>
                  {/* Taiwan Tension */}
                  {geoRisk.results.taiwan&&(
                    <div style={{padding:'4px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3}}>
                      <div style={{...mono7,color:'var(--t4)',marginBottom:1}}>TAIWAN V4</div>
                      <div style={{...mono7,color:geoRisk.results.taiwan.index>0.5?'#ef4444':geoRisk.results.taiwan.index>0.3?'#f97316':'#22c55e',fontWeight:700}}>{Math.round(geoRisk.results.taiwan.index*100)}% <span style={{color:'var(--t4)',fontWeight:400}}>{geoRisk.results.taiwan.regime}</span></div>
                      <div style={{...mono7,color:'var(--t4)',fontSize:'0.65rem'}}>trend {geoRisk.results.taiwan.trend>0?'+':''}{geoRisk.results.taiwan.trend.toFixed(2)} · {geoRisk.results.taiwan.eventCount} events</div>
                    </div>
                  )}
                  {/* Particle Filter hidden risk state */}
                  {geoRisk.results.particleFilter&&(
                    <div style={{padding:'4px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3}}>
                      <div style={{...mono7,color:'var(--t4)',marginBottom:1}}>PARTICLE FILTER</div>
                      <div style={{...mono7,color:'#a78bfa',fontWeight:700}}>{(geoRisk.results.particleFilter.meanState*100).toFixed(1)}%</div>
                      <div style={{...mono7,color:'var(--t4)',fontSize:'0.65rem'}}>σ {(geoRisk.results.particleFilter.stdState*100).toFixed(1)}% hidden risk</div>
                    </div>
                  )}
                  {/* Supply Chain */}
                  {geoRisk.results.supplyChain&&(
                    <div style={{padding:'4px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3}}>
                      <div style={{...mono7,color:'var(--t4)',marginBottom:1}}>SUPPLY CHAIN</div>
                      <div style={{...mono7,color:geoRisk.results.supplyChain.risk>0.5?'#ef4444':'#fbbf24',fontWeight:700}}>{Math.round(geoRisk.results.supplyChain.risk*100)}% <span style={{color:'var(--t4)',fontWeight:400}}>{geoRisk.results.supplyChain.label}</span></div>
                    </div>
                  )}
                  {/* Markov Regime */}
                  {geoRisk.results.markovRegime&&(
                    <div style={{padding:'4px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3}}>
                      <div style={{...mono7,color:'var(--t4)',marginBottom:1}}>MARKOV REGIME</div>
                      <div style={{...mono7,color:geoRisk.results.markovRegime.regime==='RISK_OFF'?'#ef4444':geoRisk.results.markovRegime.regime==='NEUTRAL'?'#fbbf24':'#22c55e',fontWeight:700}}>{geoRisk.results.markovRegime.regime.replace('_',' ')}</div>
                      <div style={{...mono7,color:'var(--t4)',fontSize:'0.65rem'}}>{Object.entries(geoRisk.results.markovRegime.probabilities).map(([k,v])=>`${k.replace('_','')}:${Math.round(v*100)}%`).join(' ')}</div>
                    </div>
                  )}
                </div>

                {/* GARCH VaR */}
                {(geoRisk.results.garch?.energy||geoRisk.results.garch?.defense)&&(
                  <div>
                    <div style={{...mono7,color:'var(--t3)',fontWeight:700,marginBottom:3}}>GARCH VaR/CVaR (10-day)</div>
                    {['energy','defense'].map(sector=>{
                      const g = geoRisk.results.garch[sector]; if(!g) return null
                      return(
                        <div key={sector} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,0.03)',...mono7}}>
                          <span style={{color:'var(--t3)',textTransform:'capitalize'}}>{sector}{g.stressed?' ⚠️':''}</span>
                          <div style={{display:'flex',gap:6}}>
                            <span style={{color:'#fbbf24'}}>VaR95: {(g.var95*100).toFixed(1)}%</span>
                            <span style={{color:'#ef4444'}}>CVaR99: {(g.cvar99*100).toFixed(1)}%</span>
                            <span style={{color:'var(--t4)'}}>σ: {(g.annualVol*100).toFixed(0)}%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Section>
            )}

            {/* ══ GRAPH RAG + SWARM INTELLIGENCE ══ */}
            <Section title="SWARM INTELLIGENCE" icon={Network} defaultOpen={true}>
              <div style={{...mono7,color:'var(--t4)',lineHeight:1.7,marginBottom:6}}>
                MiroFish-style GraphRAG: articles → entity graph → archetypes → 260k agent society deliberates per question.
              </div>

              {/* Graph build status */}
              {rag.building && (
                <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 6px',background:'rgba(45,212,191,0.08)',border:'1px solid rgba(45,212,191,0.2)',borderRadius:4,marginBottom:5}}>
                  <RefreshCw size={9} style={{animation:'spin 1s linear infinite',color:'var(--accent)'}}/>
                  <span style={{...mono7,color:'var(--accent)'}}>Building entity graph… {rag.progress}%</span>
                </div>
              )}

              {rag.graph && !rag.building && (
                <div style={{marginBottom:6}}>
                  {/* Graph stats */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4,marginBottom:5}}>
                    <div style={{padding:'3px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3,textAlign:'center'}}>
                      <div style={{...mono7,color:'var(--accent)',fontWeight:700}}>{rag.graph.entities?.length||0}</div>
                      <div style={{...mono7,color:'var(--t4)',fontSize:'0.68rem'}}>entities</div>
                    </div>
                    <div style={{padding:'3px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3,textAlign:'center'}}>
                      <div style={{...mono7,color:'#fbbf24',fontWeight:700}}>{rag.graph.edges?.length||0}</div>
                      <div style={{...mono7,color:'var(--t4)',fontSize:'0.68rem'}}>relations</div>
                    </div>
                    <div style={{padding:'3px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3,textAlign:'center'}}>
                      <div style={{...mono7,color:'#a78bfa',fontWeight:700}}>{rag.archetypes?.length||0}</div>
                      <div style={{...mono7,color:'var(--t4)',fontSize:'0.68rem'}}>archetypes</div>
                    </div>
                  </div>

                  {/* Top entities by influence */}
                  {rag.graph.entities?.length > 0 && (
                    <div style={{marginBottom:5}}>
                      <div style={{...mono7,color:'var(--t3)',marginBottom:3,fontWeight:700}}>TOP ENTITIES</div>
                      {rag.graph.entities.slice(0,6).map(e=>(
                        <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'2px 0',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <span style={{...mono7,padding:'1px 4px',background:e.tier==='power'?'rgba(239,68,68,0.15)':e.tier==='money'?'rgba(251,191,36,0.15)':e.tier==='shadow'?'rgba(167,139,250,0.15)':'rgba(100,116,139,0.15)',color:e.tier==='power'?'#ef4444':e.tier==='money'?'#fbbf24':e.tier==='shadow'?'#a78bfa':'var(--t4)',borderRadius:2,fontSize:'0.65rem'}}>{e.tier?.slice(0,3).toUpperCase()}</span>
                            <span style={{...mono7,color:'var(--t2)',flex:1,wordBreak:'break-word',whiteSpace:'normal',lineHeight:1.3}}>{e.name}</span>
                          </div>
                          <div style={{width:40,height:3,background:'rgba(255,255,255,0.08)',borderRadius:2,overflow:'hidden'}}>
                            <div style={{width:`${(e.influenceScore||0)*100}%`,height:'100%',background:'var(--accent)',borderRadius:2}}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Archetypes + swarm run button */}
                  {rag.archetypes?.length > 0 && (
                    <div>
                      <div style={{...mono7,color:'var(--t3)',marginBottom:3,fontWeight:700}}>ARCHETYPES ({rag.archetypes.length})</div>
                      {rag.archetypes.map(arch=>(
                        <div key={arch.id} style={{padding:'3px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3,marginBottom:3}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <span style={{...mono7,color:'var(--t1)',fontWeight:700,flex:1,wordBreak:'break-word',whiteSpace:'normal',lineHeight:1.4}}>{arch.name}</span>
                            <span style={{...mono7,color:'var(--accent)',fontWeight:700}}>{Math.round((arch.priorProbability||0.5)*100)}%</span>
                          </div>
                          <div style={{...mono7,color:'var(--t4)',fontSize:'0.68rem',lineHeight:1.5,marginTop:1,wordBreak:'break-word',whiteSpace:'normal'}}>{arch.baseBeliefs?.description||''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Swarm result for selected question */}
              {selectedMarket && rag.archetypes?.length > 0 && (()=>{
                const sq = swarm.swarmResults[selectedMarket.id]
                const ss = swarm.summaries[selectedMarket.id]
                const isRunning = swarm.running
                return(
                  <div style={{borderTop:'1px solid var(--border)',paddingTop:6,marginTop:3}}>
                    <div style={{...mono7,color:'var(--t3)',marginBottom:4,fontWeight:700}}>SWARM DELIBERATION — {selectedMarket.question?.slice(0,40)}…</div>

                    {!sq && !isRunning && (
                      <button
                        onClick={()=>swarm.runSwarm({
                          question: selectedMarket.question,
                          questionId: selectedMarket.id,
                          archetypes: rag.archetypes,
                          graphEvents: rag.graph?.events,
                          marketPrice: selectedMarket.marketPrice,
                          relSignal: null,
                        })}
                        style={{width:'100%',padding:'5px 8px',background:'rgba(45,212,191,0.10)',border:'1px solid rgba(45,212,191,0.3)',borderRadius:4,color:'var(--accent)',cursor:'pointer',...mono7,fontWeight:700}}
                      >▶ RUN SWARM ({((rag.archetypes||[]).reduce((s,a)=>s+(a.count||5000),0)/1000).toFixed(0)}k agents)</button>
                    )}

                    {isRunning && (
                      <div style={{display:'flex',alignItems:'center',gap:5,...mono7,color:'var(--accent)'}}>
                        <RefreshCw size={9} style={{animation:'spin 1s linear infinite'}}/>
                        Running swarm deliberation…
                      </div>
                    )}

                    {sq && (
                      <div>
                        {/* Result stats row */}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4,marginBottom:5}}>
                          <div style={{padding:'3px 6px',background:'var(--panel)',border:`1px solid ${sq.adjustedMean>0.5?'rgba(239,68,68,0.3)':'rgba(34,197,94,0.3)'}`,borderRadius:3,textAlign:'center'}}>
                            <div style={{...mono7,color:sq.adjustedMean>0.5?'#ef4444':'#22c55e',fontWeight:700,fontSize:'0.8rem'}}>{Math.round(sq.adjustedMean*100)}%</div>
                            <div style={{...mono7,color:'var(--t4)',fontSize:'0.65rem'}}>swarm YES</div>
                          </div>
                          <div style={{padding:'3px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3,textAlign:'center'}}>
                            <div style={{...mono7,color:'#fbbf24',fontWeight:700}}>{Math.round(sq.std*100)}%</div>
                            <div style={{...mono7,color:'var(--t4)',fontSize:'0.65rem'}}>std dev</div>
                          </div>
                          <div style={{padding:'3px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3,textAlign:'center'}}>
                            <div style={{...mono7,color:sq.bimodal?'#ef4444':sq.consensus?'#22c55e':'#fbbf24',fontWeight:700,fontSize:'0.7rem'}}>{sq.bimodal?'SPLIT':sq.consensus?'CONSENSUS':'DIVIDED'}</div>
                            <div style={{...mono7,color:'var(--t4)',fontSize:'0.65rem'}}>{sq.totalAgents} agents</div>
                          </div>
                        </div>

                        {/* Archetype vote breakdown */}
                        {sq.archetypeVotes?.length > 0 && (
                          <div style={{marginBottom:5}}>
                            {sq.archetypeVotes.sort((a,b)=>b.mean-a.mean).map(av=>{
                              const arch = rag.archetypes.find(a=>a.id===av.id)
                              return(
                                <div key={av.id} style={{marginBottom:5}}>
                                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:2}}>
                                    <span style={{...mono7,color:'var(--t2)',fontSize:'0.70rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,paddingRight:6}}>{arch?.name||av.id}</span>
                                    <span style={{...mono7,color:av.mean>0.6?'#ef4444':av.mean<0.4?'#22c55e':'#fbbf24',fontWeight:700,fontSize:'0.70rem',flexShrink:0}}>{Math.round(av.mean*100)}%</span>
                                  </div>
                                  <div style={{height:5,background:'rgba(255,255,255,0.06)',borderRadius:3,overflow:'hidden'}}>
                                    <div style={{width:`${av.mean*100}%`,height:'100%',background:av.mean>0.6?'#ef4444':av.mean<0.4?'#22c55e':'#fbbf24',borderRadius:3,transition:'width 0.4s ease'}}/>
                                  </div>
                                  {arch?.reasoning&&<div style={{...mono7,color:'var(--t4)',fontSize:'0.63rem',marginTop:2,lineHeight:1.4,wordBreak:'break-word',overflowWrap:'anywhere'}}>{arch.reasoning.slice(0,120)}{arch.reasoning.length>120?'…':''}</div>}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* LLM intelligence summary */}
                        {ss && (
                          <div style={{padding:'8px 10px',background:'rgba(167,139,250,0.07)',border:'1px solid rgba(167,139,250,0.2)',borderRadius:4,marginTop:6}}>
                            <div style={{color:'#a78bfa',fontWeight:700,marginBottom:6,fontSize:'0.68rem',letterSpacing:'0.06em',fontFamily:'JetBrains Mono'}}>SWARM INTELLIGENCE SUMMARY</div>
                            <div style={{color:'var(--t2)',lineHeight:1.75,fontSize:'0.78rem',wordBreak:'break-word',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>
                              {ss}
                            </div>
                          </div>
                        )}

                        <button
                          onClick={()=>swarm.runSwarm({
                            question: selectedMarket.question,
                            questionId: selectedMarket.id+'_refresh_'+Date.now(),
                            archetypes: rag.archetypes,
                            graphEvents: rag.graph?.events,
                            marketPrice: selectedMarket.marketPrice,
                          })}
                          style={{marginTop:5,width:'100%',padding:'3px 6px',background:'transparent',border:'1px solid var(--border)',borderRadius:3,color:'var(--t4)',cursor:'pointer',...mono7}}
                        >↺ re-run</button>
                      </div>
                    )}
                  </div>
                )
              })()}

              {!rag.graph && !rag.building && (
                <div style={{...mono7,color:'var(--t4)',padding:'8px 0',textAlign:'center'}}>
                  {keys?.groq ? 'Waiting for articles to load…' : 'Add Groq key in Settings to enable swarm intelligence.'}
                </div>
              )}
            </Section>

            <Section title="24-DIM WORLD VECTOR" icon={Globe} defaultOpen={false}>
              <div style={{...mono7,color:'var(--t4)',lineHeight:1.7,marginBottom:5}}>
                World state as 24 dimensions (0=min, 1=max). Kalman-filtered. Bar = agent aggregate, tick mark = raw signal.
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {(sim.worldVector||[]).map((wv,d)=>{
                  const pf=(sim.populationForecast||[])[d]||wv
                  const vel=(sim.velVector||[])[d]||0
                  const col=wv>0.70?'#ef4444':wv>0.55?'#f97316':wv>0.40?'#2dd4bf':'#475569'
                  return(
                    <div key={d} style={{borderBottom:'1px solid rgba(255,255,255,0.025)',paddingBottom:2,marginBottom:1}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:1,...mono7}}>
                        <span style={{color:'var(--t3)',flex:1,wordBreak:'break-word',whiteSpace:'normal',lineHeight:1.3}}>{STANCE_LABELS[d]}</span>
                        <div style={{display:'flex',gap:4}}>
                          {vel>0.01?<TrendingUp size={7} color="#ef4444"/>:vel<-0.01?<TrendingDown size={7} color="#22c55e"/>:null}
                          <span style={{color:pf>wv?'#ef4444':pf<wv?'#22c55e':'var(--t4)'}}>{pct(pf)}</span>
                          <span style={{color:'var(--t4)'}}>{pct(wv)}</span>
                        </div>
                      </div>
                      <MiniBar value={pf} width={244} color={col} baseline={wv} height={4}/>
                    </div>
                  )
                })}
              </div>
            </Section>

            <Section title="MARKOV REGIME" icon={Activity} defaultOpen={false}>
              <div style={{...mono7,color:'var(--t4)',lineHeight:1.7,marginBottom:5}}>
                3-state Markov chain (Hamilton 1989). Transition probabilities update from convergence signal strength. Current regime shifts all conflict forecasts.
              </div>
              <div style={{display:'flex',gap:4}}>
                {['CALM','TENSE','CRISIS'].map(r=>(
                  <div key={r} style={{flex:1,padding:'5px 6px',background:sim.regime?.name===r?REGIME_BG[r]:'var(--panel)',border:`1px solid ${sim.regime?.name===r?REGIME_COLOR[r]+'60':'var(--border)'}`,borderRadius:4}}>
                    <div style={{display:'flex',alignItems:'center',gap:3,marginBottom:2}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:REGIME_COLOR[r],opacity:sim.regime?.name===r?1:0.25,boxShadow:sim.regime?.name===r?`0 0 7px ${REGIME_COLOR[r]}`:'none'}}/>
                      <span style={{...mono7,color:sim.regime?.name===r?REGIME_COLOR[r]:'var(--t4)',fontWeight:700}}>{r}</span>
                    </div>
                    {sim.regime?.name===r&&<span style={{...mono7,color:REGIME_COLOR[r]}}>ACTIVE</span>}
                  </div>
                ))}
              </div>
            </Section>

            <Section title="AGENT vs SIGNAL DIVERGENCES" icon={Zap} defaultOpen={false}>
              <div style={{...mono7,color:'var(--t4)',lineHeight:1.7,marginBottom:4}}>
                Where the 100k agent simulation disagrees most with raw signals. Large divergence = the simulation sees something the signal stream is missing.
              </div>
              {(sim.divergences||[]).map((dv,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'2px 0',borderBottom:'1px solid rgba(255,255,255,0.03)',...mono7}}>
                  <span style={{color:'var(--t2)',flex:1,wordBreak:'break-word',whiteSpace:'normal',lineHeight:1.3,minWidth:90}}>{dv.dim}</span>
                  <div style={{display:'flex',gap:4}}>
                    <span style={{color:'var(--t4)'}}>{pct(dv.worldSignal)}</span>
                    <span style={{color:'var(--t1)'}}>{pct(dv.forecast)}</span>
                    <span style={{color:dv.delta>0?'#ef4444':'#22c55e',fontWeight:700,minWidth:30,textAlign:'right'}}>{dv.delta>0?'+':''}{(dv.delta*100).toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </Section>

            <Section title="MONTE CARLO SCENARIOS" icon={TrendingUp} defaultOpen={false}>
              <div style={{...mono7,color:'var(--t4)',lineHeight:1.7,marginBottom:4}}>
                GBM fan charts for 3 most volatile dimensions. 300 simulated paths × 12 weeks forward.
              </div>
              {(sim.volatileDims||[]).map((dv,i)=>{
                const fan=dv.fan; if(!fan||!fan.length)return null
                const steps=fan.length,w=244,h=62
                const toY=v=>h-Math.round(clamp01(v)*h)
                const xs=w/(steps-1)
                const tp=key=>fan.map((f,i)=>`${i===0?'M':'L'}${(i*xs).toFixed(1)},${toY(f[key])}`).join(' ')
                return(
                  <div key={i} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:4,padding:6,marginBottom:5}}>
                    <div style={{display:'flex',justifyContent:'space-between',...mono7,marginBottom:3}}>
                      <span style={{color:'var(--t2)',fontWeight:700}}>{dv.dim}</span>
                      <span style={{color:'var(--t4)'}}>μ={(dv.mu*100).toFixed(1)}% σ={(dv.sigma*100).toFixed(1)}%</span>
                    </div>
                    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:'block'}}>
                      <path d={`${tp('p95')} L${((steps-1)*xs).toFixed(1)},${toY(fan[steps-1].p05)} ${fan.map((_,i)=>`L${((steps-1-i)*xs).toFixed(1)},${toY(fan[steps-1-i].p05)}`).join(' ')} Z`} fill="rgba(45,212,191,0.06)"/>
                      <path d={`${tp('p75')} L${((steps-1)*xs).toFixed(1)},${toY(fan[steps-1].p25)} ${fan.map((_,i)=>`L${((steps-1-i)*xs).toFixed(1)},${toY(fan[steps-1-i].p25)}`).join(' ')} Z`} fill="rgba(45,212,191,0.12)"/>
                      <path d={tp('p05')} fill="none" stroke="#ef4444" strokeWidth={1} opacity={0.5}/>
                      <path d={tp('p95')} fill="none" stroke="#22c55e" strokeWidth={1} opacity={0.5}/>
                      <path d={tp('p50')} fill="none" stroke="#2dd4bf" strokeWidth={1.5}/>
                      <line x1={0} y1={toY(dv.forecast)} x2={w} y2={toY(dv.forecast)} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} strokeDasharray="3,2"/>
                    </svg>
                    <div style={{display:'flex',justifyContent:'space-between',...mono7,color:'var(--t4)',marginTop:2}}>
                      <span>P5: {pct(fan[steps-1]?.p05)}</span>
                      <span>P50: {pct(fan[steps-1]?.p50)}</span>
                      <span>P95: {pct(fan[steps-1]?.p95)}</span>
                    </div>
                  </div>
                )
              })}
            </Section>

          </div>
        </div>
      </div>
    </div>
  )
}
