/**
 * FinancePanel v4 — Full Quant Terminal
 * Tabs: Overview | Charts | Technicals | Portfolio | Options | Macro | Backtest | Crypto | FX
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  useFinanceIntel, WATCHLIST, sharpeRatio, sortinoRatio, calmarRatio,
  omegaRatio, betaAlpha, drawdownSeries, historicalVaR, parametricVaR,
  rollingVol, logReturns, bollingerBands, macd, rsi, atr, stochastic,
  zScore, roc, adx, obv, ichimoku, riskParityWeights, minVarianceWeights,
  efficientFrontier, correlationMatrix, pearsonCorrelation,
  blackScholes, impliedVolatility, yieldCurveMetrics, financialConditionsIndex,
  backtestMomentum, annualisedReturn
} from '../../hooks/useFinanceIntel'
// useFRED removed — requires FRED API key not available in base deployment
import { RefreshCw, TrendingUp, TrendingDown, Minus, Activity, BarChart2, DollarSign, Zap, Globe, Shield, Target, Cpu, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n,d=2) => n==null||isNaN(n)?'—':Math.abs(n)>=1e12?(n/1e12).toFixed(d)+'T':Math.abs(n)>=1e9?(n/1e9).toFixed(d)+'B':Math.abs(n)>=1e6?(n/1e6).toFixed(d)+'M':n.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})
const pct = (n,d=2) => n==null?'—':(n>0?'+':'')+n.toFixed(d)+'%'
const sgn = n => n!=null?(n>=0?'+':'')+n.toFixed(3):null
const chgColor = n => n==null?'var(--t4)':n>0.01?'#4ade80':n<-0.01?'#f87171':'var(--t4)'
const mono = { fontFamily:'JetBrains Mono', fontSize:10 }
const monoSm = { fontFamily:'JetBrains Mono', fontSize:9 }
const monoXs = { fontFamily:'JetBrains Mono', fontSize:8 }

function Chg({ v, suffix='%' }) {
  const color = chgColor(v)
  const Icon = v>0.01?TrendingUp:v<-0.01?TrendingDown:Minus
  return <span style={{display:'inline-flex',alignItems:'center',gap:2,...monoSm,color}}><Icon size={9}/>{v!=null?(v>0?'+':'')+v.toFixed(2)+suffix:'—'}</span>
}

// ── SVG Candlestick + Line Chart ──────────────────────────────────────────────
function OHLCChart({ bars, overlays=[], width=500, height=160, showVolume=true }) {
  if (!bars || bars.length < 2) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',...monoSm,color:'var(--t4)'}}>No data</div>
  const n = bars.length, vH = showVolume ? 30 : 0
  const cH = height - vH - 4
  const closes = bars.map(b=>b.c), highs=bars.map(b=>b.h||b.c), lows=bars.map(b=>b.l||b.c), vols=bars.map(b=>b.v||0)
  const minP=Math.min(...lows)*0.998, maxP=Math.max(...highs)*1.002, span=maxP-minP||1
  const maxV=Math.max(...vols)||1
  const xScale = width/(n-1)
  const yP = p => cH - (p-minP)/span*cH
  const xI = i => i*xScale

  // Bollinger bands overlay
  const bb = bollingerBands(closes)
  const bbUpper = bb.upper.map((v,i)=>v!=null?{x:xI(i),y:yP(v)}:null).filter(Boolean)
  const bbLower = bb.lower.map((v,i)=>v!=null?{x:xI(i),y:yP(v)}:null).filter(Boolean)
  const bbMid   = bb.mid.map((v,i)=>v!=null?{x:xI(i),y:yP(v)}:null).filter(Boolean)

  const toPath = pts => pts.length>0?pts.map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '):''

  // Candles or line (use line if bars are many)
  const isCandle = n <= 120
  const priceElements = isCandle ? bars.map((b,i)=>{
    const x=xI(i),o=yP(b.o||b.c),c=yP(b.c),h=yP(b.h||b.c),l=yP(b.l||b.c)
    const up=b.c>=(b.o||b.c),color=up?'#22c55e':'#ef4444'
    const cW=Math.max(1,xScale*0.6),cX=x-cW/2
    return <g key={i}><line x1={x} y1={h} x2={x} y2={l} stroke={color} strokeWidth={0.5}/><rect x={cX} y={Math.min(o,c)} width={cW} height={Math.max(1,Math.abs(o-c))} fill={color}/></g>
  }) : [<polyline key="line" points={closes.map((c,i)=>`${xI(i)},${yP(c)}`).join(' ')} fill="none" stroke="#2dd4bf" strokeWidth={1.5} strokeLinejoin="round"/>]

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{display:'block',overflow:'visible'}}>
      {/* Bollinger bands */}
      <path d={toPath(bbUpper)} fill="none" stroke="rgba(234,179,8,0.4)" strokeWidth={1} strokeDasharray="3,2"/>
      <path d={toPath(bbLower)} fill="none" stroke="rgba(234,179,8,0.4)" strokeWidth={1} strokeDasharray="3,2"/>
      <path d={toPath(bbMid)}   fill="none" stroke="rgba(234,179,8,0.2)" strokeWidth={1}/>
      {/* Band fill */}
      {bbUpper.length>1&&bbLower.length>1&&<path d={`${toPath(bbUpper)} L${bbLower[bbLower.length-1].x.toFixed(1)},${bbLower[bbLower.length-1].y.toFixed(1)} ${[...bbLower].reverse().map(p=>`L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} Z`} fill="rgba(234,179,8,0.04)"/>}
      {/* Price */}
      {priceElements}
      {/* Custom overlays (e.g. EMA lines) */}
      {overlays.map((ov,i)=>ov.values&&<polyline key={i} points={ov.values.map((v,j)=>v!=null?`${xI(j)},${yP(v)}`:'').filter(Boolean).join(' ')} fill="none" stroke={ov.color||'#3b82f6'} strokeWidth={1} opacity={0.8}/>)}
      {/* Volume bars */}
      {showVolume&&vols.map((v,i)=>{
        const x=xI(i),bh=v/maxV*vH,by=height-bh
        const up=bars[i].c>=(bars[i].o||bars[i].c)
        return <rect key={i} x={x-xScale*0.4} y={by} width={Math.max(1,xScale*0.8)} height={bh} fill={up?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}/>
      })}
      {/* Current price line */}
      {<line x1={0} y1={yP(closes[closes.length-1])} x2={width} y2={yP(closes[closes.length-1])} stroke="rgba(45,212,191,0.3)" strokeWidth={0.5} strokeDasharray="4,3"/>}
      {/* Price labels */}
      <text x={width-2} y={yP(maxP*0.9995)} fill="var(--t4)" fontSize={8} textAnchor="end" fontFamily="JetBrains Mono">{fmt(maxP,2)}</text>
      <text x={width-2} y={yP(minP*1.0005)+8} fill="var(--t4)" fontSize={8} textAnchor="end" fontFamily="JetBrains Mono">{fmt(minP,2)}</text>
    </svg>
  )
}

// Mini sparkline
function Spark({ closes, w=60, h=22, color }) {
  if (!closes||closes.length<2) return null
  const min=Math.min(...closes),max=Math.max(...closes),span=max-min||1
  const n=closes.length,xs=w/(n-1)
  const pts=closes.map((c,i)=>`${(i*xs).toFixed(1)},${(h-(c-min)/span*h).toFixed(1)}`).join(' ')
  const up=closes[n-1]>=closes[0]
  const c=color||(up?'#4ade80':'#f87171')
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:'block'}}><polyline points={pts} fill="none" stroke={c} strokeWidth={1.5} strokeLinejoin="round"/></svg>
}

// RSI chart
function RSIChart({ closes, w=500, h=60 }) {
  if (!closes||closes.length<20) return null
  const rsiV=rsi(closes),n=rsiV.length,xs=w/(n-1)
  const pts=rsiV.map((v,i)=>v!=null?`${(i*xs).toFixed(1)},${((100-v)/100*h).toFixed(1)}`:null).filter(Boolean).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:'block'}}>
      <line x1={0} y1={h*0.3} x2={w} y2={h*0.3} stroke="rgba(239,68,68,0.3)" strokeWidth={0.5} strokeDasharray="3,2"/>
      <line x1={0} y1={h*0.7} x2={w} y2={h*0.7} stroke="rgba(34,197,94,0.3)" strokeWidth={0.5} strokeDasharray="3,2"/>
      <polyline points={pts} fill="none" stroke="#a78bfa" strokeWidth={1.5}/>
      <text x={2} y={h*0.3-2} fill="rgba(239,68,68,0.6)" fontSize={7} fontFamily="JetBrains Mono">70</text>
      <text x={2} y={h*0.7+8} fill="rgba(34,197,94,0.6)" fontSize={7} fontFamily="JetBrains Mono">30</text>
      {rsiV[rsiV.length-1]!=null&&<text x={w-30} y={12} fill="#a78bfa" fontSize={8} fontFamily="JetBrains Mono">{rsiV[rsiV.length-1].toFixed(0)}</text>}
    </svg>
  )
}

// MACD chart
function MACDChart({ closes, w=500, h=50 }) {
  if (!closes||closes.length<30) return null
  const {macd:ml,signal:sl,histogram:hl}=macd(closes)
  const n=ml.length,xs=w/(n-1)
  const allV=[...ml,...sl,...hl].filter(v=>v!=null&&!isNaN(v))
  const mn=Math.min(...allV),mx=Math.max(...allV),span=mx-mn||1
  const scY=v=>(mx-v)/span*h
  const toP=arr=>arr.map((v,i)=>v!=null?`${(i*xs).toFixed(1)},${scY(v).toFixed(1)}`:null).filter(Boolean).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:'block'}}>
      <line x1={0} y1={scY(0)} x2={w} y2={scY(0)} stroke="rgba(255,255,255,0.1)" strokeWidth={0.5}/>
      {hl.map((v,i)=>v!=null&&<rect key={i} x={i*xs-xs*0.4} y={v>=0?scY(v):scY(0)} width={Math.max(1,xs*0.8)} height={Math.abs(scY(v)-scY(0))} fill={v>=0?'rgba(34,197,94,0.5)':'rgba(239,68,68,0.5)'}/>)}
      <polyline points={toP(ml)} fill="none" stroke="#2dd4bf" strokeWidth={1.2}/>
      <polyline points={toP(sl)} fill="none" stroke="#f97316" strokeWidth={1}/>
    </svg>
  )
}

// Efficient Frontier scatter
function FrontierChart({ portfolios, maxSharpe, minVol, w=280, h=180 }) {
  if (!portfolios||portfolios.length<5) return <div style={{height:h,display:'flex',alignItems:'center',justifyContent:'center',...monoSm,color:'var(--t4)'}}>Run portfolio calc</div>
  const vols=portfolios.map(p=>p.vol),rets=portfolios.map(p=>p.ret)
  const minV=Math.min(...vols),maxV=Math.max(...vols),spanV=maxV-minV||1
  const minR=Math.min(...rets),maxR=Math.max(...rets),spanR=maxR-minR||1
  const sx=p=>(p.vol-minV)/spanV*(w-20)+10
  const sy=p=>h-20-(p.ret-minR)/spanR*(h-30)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {portfolios.slice(0,150).map((p,i)=><circle key={i} cx={sx(p)} cy={sy(p)} r={2} fill={`hsl(${120+p.sharpe*30},60%,60%)`} opacity={0.5}/>)}
      {minVol&&<circle cx={sx(minVol)} cy={sy(minVol)} r={5} fill="none" stroke="#2dd4bf" strokeWidth={1.5}/>}
      {maxSharpe&&<circle cx={sx(maxSharpe)} cy={sy(maxSharpe)} r={5} fill="none" stroke="#fbbf24" strokeWidth={1.5}/>}
      <text x={8} y={h-4} fill="var(--t4)" fontSize={7} fontFamily="JetBrains Mono">Volatility →</text>
      <text x={4} y={12} fill="var(--t4)" fontSize={7} fontFamily="JetBrains Mono" transform={`rotate(-90,4,12) translate(-50,0)`}>Return ↑</text>
      {maxSharpe&&<text x={sx(maxSharpe)+6} y={sy(maxSharpe)+3} fill="#fbbf24" fontSize={7} fontFamily="JetBrains Mono">Max Sharpe</text>}
      {minVol&&<text x={sx(minVol)+6} y={sy(minVol)-4} fill="#2dd4bf" fontSize={7} fontFamily="JetBrains Mono">Min Vol</text>}
    </svg>
  )
}

// Correlation heatmap
function CorrHeatmap({ matrix, keys, size=180 }) {
  if (!matrix||!keys||keys.length<2) return null
  const n=keys.length, cell=Math.floor(size/n)
  const color=v=>{
    const abs=Math.abs(v),alpha=abs*0.9
    return v>0?`rgba(34,197,94,${alpha})`:`rgba(239,68,68,${alpha})`
  }
  return (
    <svg width={n*cell+80} height={n*cell+60} style={{overflow:'visible'}}>
      {keys.map((a,i)=>keys.map((b,j)=>{
        const v=matrix[a]?.[b]??0
        return <g key={`${i}-${j}`}><rect x={60+j*cell} y={20+i*cell} width={cell} height={cell} fill={color(v)} stroke="rgba(0,0,0,0.2)" strokeWidth={0.5}/><text x={60+j*cell+cell/2} y={20+i*cell+cell/2+3} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={7} fontFamily="JetBrains Mono">{v.toFixed(2)}</text></g>
      }))}
      {keys.map((k,i)=><text key={i} x={55} y={20+i*cell+cell/2+3} textAnchor="end" fill="var(--t3)" fontSize={7} fontFamily="JetBrains Mono">{k.slice(0,5)}</text>)}
      {keys.map((k,j)=><text key={j} x={60+j*cell+cell/2} y={16} textAnchor="middle" fill="var(--t3)" fontSize={7} fontFamily="JetBrains Mono" transform={`rotate(-45,${60+j*cell+cell/2},16)`}>{k.slice(0,5)}</text>)}
    </svg>
  )
}

// QuoteRow
function QRow({ sym, label, color, q }) {
  const chg = q?.changePercent
  return (
    <div style={{display:'flex',alignItems:'center',gap:6,padding:'3px 6px',borderBottom:'1px solid rgba(255,255,255,0.03)',cursor:'pointer'}} className="hover-row">
      <div style={{width:5,height:5,borderRadius:'50%',background:color,flexShrink:0}}/>
      <span style={{...monoXs,color:'var(--t3)',width:70,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</span>
      <span style={{...mono,color:'var(--t1)',minWidth:70,textAlign:'right'}}>{q?fmt(q.price,q.price>100?2:4):'…'}</span>
      <div style={{minWidth:56,textAlign:'right'}}>{q&&chg!=null?<Chg v={chg}/>:<span style={{...monoSm,color:'var(--t4)'}}>—</span>}</div>
      {q?.closes&&<Spark closes={q.closes} w={48} h={18}/>}
    </div>
  )
}

// Stat cell
function Stat({ label, value, color, unit }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:1,padding:'5px 8px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3}}>
      <span style={{...monoXs,color:'var(--t4)',letterSpacing:'0.08em'}}>{label}</span>
      <span style={{...mono,fontWeight:700,color:color||'var(--t1)'}}>{value}{unit&&<span style={{fontSize:8,color:'var(--t4)',marginLeft:2}}>{unit}</span>}</span>
    </div>
  )
}

// Section header
function SecHead({ title, icon:Icon }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8,paddingBottom:5,borderBottom:'1px solid var(--border)'}}>
      {Icon&&<Icon size={11} color="var(--accent)"/>}
      <span style={{...monoXs,color:'var(--t3)',letterSpacing:'0.1em'}}>{title}</span>
    </div>
  )
}

// ── TABS ──────────────────────────────────────────────────────────────────────
const TABS = [
  {id:'overview', label:'Overview', icon:Activity},
  {id:'charts',   label:'Charts',   icon:BarChart2},
  {id:'technical',label:'Signals',  icon:Zap},
  {id:'portfolio',label:'Portfolio',icon:Shield},
  {id:'options',  label:'Options',  icon:Target},
  {id:'macro',    label:'Macro',    icon:Globe},
  {id:'backtest', label:'Backtest', icon:Cpu},
  {id:'crypto',   label:'Crypto',   icon:DollarSign},
  {id:'fx',       label:'FX',       icon:Globe},
]

// ════════════════════════════════════════════════════════════════════════════
export default function FinancePanel() {
  const { quotes, crypto, fx, history, adultEcon, loading, lastUpdate, refresh, analytics, fetchHistoryForSymbol } = useFinanceIntel()
  // FRED data requires an API key — show macro data from quotes when available
  const fredData = null
  const [tab, setTab] = useState('overview')
  const [chartSym, setChartSym] = useState('SPY')
  const [chartRange, setChartRange] = useState('1y')
  const [portSyms, setPortSyms] = useState(['SPY','GLD','TLT','EEM','BZ=F'])
  const [optSym, setOptSym] = useState('SPY')
  const [optK, setOptK] = useState('')
  const [optT, setOptT] = useState('0.25')
  const [optSigma, setOptSigma] = useState('0.2')
  const [optType, setOptType] = useState('call')
  const [frontierData, setFrontierData] = useState(null)
  const [corrData, setCorrData] = useState(null)
  const [backtestResult, setBacktestResult] = useState(null)

  // Auto-load chart for selected symbol
  useEffect(() => { fetchHistoryForSymbol(chartSym, chartRange) }, [chartSym, chartRange, fetchHistoryForSymbol])

  // Auto-run portfolio when portSyms change and history is available
  const runPortfolio = useCallback(() => {
    const available = portSyms.filter(s => history[s]?.length >= 60)
    if (available.length < 2) return
    const returnsList = available.map(s => logReturns(history[s].map(b=>b.c)))
    const fe = efficientFrontier(returnsList, available, 500)
    setFrontierData({ ...fe, symbols: available })
    const cm = correlationMatrix(Object.fromEntries(available.map((s,i)=>[s,returnsList[i]])))
    setCorrData(cm)
  }, [portSyms, history])

  useEffect(() => { if (tab==='portfolio') runPortfolio() }, [tab, history, runPortfolio])
  useEffect(() => {
    portSyms.forEach(s => { if (!history[s]) fetchHistoryForSymbol(s, '2y') })
  }, [portSyms, fetchHistoryForSymbol])

  const runBacktest = useCallback(() => {
    const available = portSyms.filter(s => history[s]?.length >= 200)
    if (available.length < 2) return
    const barsMap = Object.fromEntries(available.map(s => [s, history[s]]))
    setBacktestResult(backtestMomentum(barsMap, 126, 21, 0.05))
  }, [portSyms, history])

  // Chart bars
  const chartBars = history[chartSym] || []
  const chartTech = analytics?.technicals?.[chartSym]

  // Options calc
  const S = quotes[optSym]?.price
  const K_val = parseFloat(optK) || S
  const bsResult = S && K_val ? blackScholes(S, K_val, parseFloat(optT)||0.25, 0.05, parseFloat(optSigma)||0.2, optType) : null

  // VIX color
  const vix = analytics?.vix
  const vixColor = vix==null?'var(--t4)':vix>30?'#ef4444':vix>20?'#f97316':'#22c55e'

  const timeSince = d => { if(!d)return''; const s=Math.floor((Date.now()-new Date(d))/1000); return s<60?`${s}s`:s<3600?`${Math.floor(s/60)}m`:`${Math.floor(s/3600)}h` }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'var(--void)'}}>

      {/* Top bar */}
      <div style={{flexShrink:0,padding:'5px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
        <span style={{...mono,color:'var(--accent)',letterSpacing:'0.08em'}}>NEXUS FINANCE</span>
        <div style={{display:'flex',gap:8,flex:1}}>
          {vix!=null&&<span style={{...monoSm,color:vixColor}}>VIX {vix.toFixed(1)}</span>}
          {analytics?.riskRegime&&<span style={{...monoSm,color:analytics.riskRegime.regime==='RISK_ON'?'#22c55e':analytics.riskRegime.regime==='RISK_OFF'?'#ef4444':'var(--t3)'}}>{analytics.riskRegime.regime.replace('_',' ')}</span>}
          {analytics?.fci&&<span style={{...monoSm,color:analytics.fci.level==='TIGHT'?'#ef4444':analytics.fci.level==='LOOSE'?'#22c55e':'var(--t3)'}}>FCI {analytics.fci.fci}</span>}
          {analytics?.ycMetrics?.inverted&&<span style={{...monoSm,color:'#f97316'}}>⚠ YIELD CURVE INVERTED</span>}
        </div>
        {loading&&<RefreshCw size={11} style={{animation:'spin 1s linear infinite',color:'var(--t4)'}}/>}
        {lastUpdate&&<span style={{...monoXs,color:'var(--t4)'}}>{timeSince(lastUpdate)} ago</span>}
        <button onClick={refresh} style={{background:'none',border:'1px solid var(--border)',borderRadius:3,padding:'2px 8px',...monoXs,color:'var(--t3)',cursor:'pointer'}}>↻</button>
      </div>

      {/* Tab bar */}
      <div style={{flexShrink:0,display:'flex',gap:1,padding:'4px 8px',borderBottom:'1px solid var(--border)',overflowX:'auto'}}>
        {TABS.map(({id,label,icon:Icon})=>(
          <button key={id} onClick={()=>setTab(id)} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 10px',borderRadius:3,border:'none',cursor:'pointer',...monoSm,background:tab===id?'rgba(45,212,191,0.1)':'transparent',color:tab===id?'var(--accent)':'var(--t3)',borderBottom:tab===id?'1px solid var(--accent)':'1px solid transparent',whiteSpace:'nowrap'}}>
            <Icon size={10}/>{label}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflow:'hidden'}}>

        {/* ── OVERVIEW ── */}
        {tab==='overview'&&(
          <div style={{display:'flex',height:'100%',overflow:'hidden'}}>
            {/* Left: indices grid */}
            <div style={{width:260,flexShrink:0,overflowY:'auto',borderRight:'1px solid var(--border)',padding:'8px 0'}}>
              {['US','EU','APAC','EM','SECTOR','BONDS','COMMODITY'].map(region=>{
                const items=[...WATCHLIST.indices,...WATCHLIST.bonds].filter(x=>x.region===region)
                if(!items.length)return null
                return <div key={region} style={{marginBottom:8}}>
                  <div style={{...monoXs,color:'var(--t4)',padding:'2px 8px',letterSpacing:'0.1em'}}>{region}</div>
                  {items.map(x=><QRow key={x.sym} sym={x.sym} label={x.label} color={x.color||'var(--accent)'} q={quotes[x.sym]}/>)}
                </div>
              })}
            </div>
            {/* Center: commodities + FX */}
            <div style={{width:250,flexShrink:0,overflowY:'auto',borderRight:'1px solid var(--border)',padding:'8px 0'}}>
              <div style={{...monoXs,color:'var(--t4)',padding:'2px 8px 4px',letterSpacing:'0.1em'}}>COMMODITIES</div>
              {WATCHLIST.commodities.map(x=><QRow key={x.sym} sym={x.sym} label={x.label} color={x.color} q={quotes[x.sym]}/>)}
              <div style={{...monoXs,color:'var(--t4)',padding:'8px 8px 4px',letterSpacing:'0.1em'}}>FOREX</div>
              {WATCHLIST.forex.map(x=><QRow key={x.sym} sym={x.sym} label={x.label} color={x.color} q={quotes[x.sym]}/>)}
            </div>
            {/* Right: stats + movers */}
            <div style={{flex:1,overflowY:'auto',padding:10}}>
              <SecHead title="MARKET REGIME" icon={Activity}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4,marginBottom:12}}>
                <Stat label="VIX" value={vix!=null?vix.toFixed(1):'—'} color={vixColor}/>
                <Stat label="REGIME" value={analytics?.riskRegime?.regime?.replace('_',' ')||'—'} color={analytics?.riskRegime?.regime==='RISK_ON'?'#22c55e':analytics?.riskRegime?.regime==='RISK_OFF'?'#ef4444':'var(--t3)'}/>
                <Stat label="FCI" value={analytics?.fci?.fci??'—'} color={analytics?.fci?.fci>0?'#ef4444':'#22c55e'}/>
                <Stat label="10Y-2Y" value={analytics?.ycMetrics?.slope!=null?analytics.ycMetrics.slope+'%':'—'} color={analytics?.ycMetrics?.inverted?'#f97316':'var(--t1)'}/>
                <Stat label="CURVE" value={analytics?.ycMetrics?.inverted?'INVERTED':'NORMAL'} color={analytics?.ycMetrics?.inverted?'#f97316':'#22c55e'}/>
                <Stat label="FCI LEVEL" value={analytics?.fci?.level||'—'} color={analytics?.fci?.level==='TIGHT'?'#ef4444':'#22c55e'}/>
              </div>
              <SecHead title="TOP MOVERS" icon={TrendingUp}/>
              <div style={{display:'flex',flexDirection:'column',gap:2,marginBottom:12}}>
                {(analytics?.momentumScores||[]).slice(0,12).map(m=>{
                  const q=quotes[m.sym];const chg=q?.changePercent
                  return <div key={m.sym} style={{display:'flex',alignItems:'center',gap:8,padding:'2px 4px',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                    <span style={{...monoXs,color:'var(--t3)',width:70,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.sym}</span>
                    <span style={{...monoSm,color:'var(--t1)',minWidth:70}}>{q?fmt(q.price,2):'—'}</span>
                    <Chg v={chg}/>
                    {q?.closes&&<Spark closes={q.closes} w={48} h={16}/>}
                  </div>
                })}
              </div>
              <SecHead title="FRED MACRO" icon={Globe}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3}}>
                {fredData&&Object.values(fredData).slice(0,10).map(s=>
                  <Stat key={s.id} label={s.label} value={s.value!=null?fmt(s.value,2):'—'} unit={s.unit} color={s.changePct!=null?(s.changePct>0?'#ef4444':'#22c55e'):'var(--t1)'}/>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CHARTS ── */}
        {tab==='charts'&&(
          <div style={{display:'flex',height:'100%',overflow:'hidden'}}>
            {/* Sym picker */}
            <div style={{width:170,flexShrink:0,overflowY:'auto',borderRight:'1px solid var(--border)',padding:'4px 0'}}>
              {[...WATCHLIST.indices,...WATCHLIST.commodities,...WATCHLIST.bonds,...WATCHLIST.forex].map(x=>(
                <button key={x.sym} onClick={()=>{setChartSym(x.sym);fetchHistoryForSymbol(x.sym,chartRange)}}
                  style={{display:'block',width:'100%',textAlign:'left',padding:'3px 8px',border:'none',cursor:'pointer',...monoXs,background:chartSym===x.sym?'rgba(45,212,191,0.08)':'transparent',color:chartSym===x.sym?'var(--accent)':'var(--t3)',borderLeft:`2px solid ${chartSym===x.sym?'var(--accent)':'transparent'}`}}>
                  {x.label}
                </button>
              ))}
            </div>
            {/* Main chart area */}
            <div style={{flex:1,overflowY:'auto',padding:12}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{...mono,color:'var(--t1)',fontWeight:700}}>{chartSym}</span>
                  {quotes[chartSym]&&<>
                    <span style={{fontFamily:'Orbitron',fontSize:16,color:'var(--t1)'}}>{fmt(quotes[chartSym].price,2)}</span>
                    <Chg v={quotes[chartSym].changePercent}/>
                  </>}
                </div>
                <div style={{display:'flex',gap:4}}>
                  {['5d','1mo','3mo','6mo','1y','2y','5y'].map(r=>(
                    <button key={r} onClick={()=>{setChartRange(r);fetchHistoryForSymbol(chartSym,r)}} style={{padding:'2px 8px',border:`1px solid ${chartRange===r?'var(--accent)':'var(--border)'}`,borderRadius:3,...monoXs,background:'transparent',color:chartRange===r?'var(--accent)':'var(--t3)',cursor:'pointer'}}>{r}</button>
                  ))}
                </div>
              </div>
              {/* OHLCV chart */}
              <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:4,padding:8,marginBottom:8}}>
                <OHLCChart bars={chartBars} width={700} height={200} showVolume={true}/>
              </div>
              {/* RSI + MACD */}
              {chartBars.length>=20&&<>
                <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:4,padding:'6px 8px',marginBottom:4}}>
                  <div style={{...monoXs,color:'var(--t4)',marginBottom:3}}>RSI (14)</div>
                  <RSIChart closes={chartBars.map(b=>b.c)} w={700} h={55}/>
                </div>
                <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:4,padding:'6px 8px',marginBottom:8}}>
                  <div style={{...monoXs,color:'var(--t4)',marginBottom:3}}>MACD (12,26,9)</div>
                  <MACDChart closes={chartBars.map(b=>b.c)} w={700} h={50}/>
                </div>
              </>}
              {/* Key stats */}
              {chartTech&&<div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:4}}>
                <Stat label="RSI" value={chartTech.rsi??'—'} color={chartTech.rsi<30?'#22c55e':chartTech.rsi>70?'#ef4444':'var(--t1)'}/>
                <Stat label="VOL 21D" value={chartTech.vol21??'—'} unit="%"/>
                <Stat label="ATR" value={chartTech.atr?fmt(chartTech.atr,2):'—'}/>
                <Stat label="Z-SCORE" value={chartTech.zScore??'—'} color={chartTech.zScore<-2?'#22c55e':chartTech.zScore>2?'#ef4444':'var(--t1)'}/>
                <Stat label="ADX" value={chartTech.adx??'—'} color={chartTech.adx>25?'var(--accent)':'var(--t3)'}/>
                <Stat label="SHARPE" value={chartTech.sharpe??'—'} color={chartTech.sharpe>1?'#22c55e':chartTech.sharpe<0?'#ef4444':'var(--t1)'}/>
                <Stat label="SORTINO" value={chartTech.sortino??'—'}/>
                <Stat label="CALMAR" value={chartTech.calmar??'—'}/>
                <Stat label="MDD" value={chartTech.mdd!=null?pct(chartTech.mdd*100,1):'—'} color="#f87171"/>
                <Stat label="VaR 95" value={chartTech.var95?pct(chartTech.var95*100,2):'—'} color="#f97316"/>
              </div>}
            </div>
          </div>
        )}

        {/* ── SIGNALS / TECHNICALS ── */}
        {tab==='technical'&&(
          <div style={{flex:1,overflowY:'auto',padding:10}}>
            <SecHead title="SIGNAL SCORECARD (load chart data first)" icon={Zap}/>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',...monoXs}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border)'}}>
                    {['Symbol','Price','Chg%','RSI','MACD→Sig','BB%B','Z-Score','ROC','ADX','Sharpe','Sortino','MDD','VaR95','Vol21','Signal'].map(h=>
                      <th key={h} style={{padding:'4px 6px',textAlign:'right',color:'var(--t4)',whiteSpace:'nowrap',fontWeight:'normal',...monoXs}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Object.values(analytics?.technicals||{}).map(t=>{
                    const q=quotes[t.sym];const chg=q?.changePercent
                    const sigColor=t.signalLabel.includes('BUY')?'#22c55e':t.signalLabel.includes('SELL')?'#ef4444':'var(--t3)'
                    return <tr key={t.sym} style={{borderBottom:'1px solid rgba(255,255,255,0.03)',cursor:'pointer'}} onClick={()=>{setChartSym(t.sym);setTab('charts')}}>
                      <td style={{padding:'3px 6px',color:'var(--accent)',...monoXs}}>{t.sym}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',color:'var(--t1)',...monoXs}}>{q?fmt(q.price,2):'—'}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',color:chgColor(chg),...monoXs}}>{chg!=null?pct(chg):'—'}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',color:t.rsi<30?'#22c55e':t.rsi>70?'#ef4444':'var(--t2)',...monoXs}}>{t.rsi??'—'}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',color:t.macd>t.macdSignal?'#22c55e':'#ef4444',...monoXs}}>{t.macd!=null?t.macd.toFixed(3):'—'}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',color:t.bb?.pctB<0.1?'#22c55e':t.bb?.pctB>0.9?'#ef4444':'var(--t2)',...monoXs}}>{t.bb?.pctB!=null?t.bb.pctB.toFixed(2):'—'}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',color:t.zScore<-2?'#22c55e':t.zScore>2?'#ef4444':'var(--t2)',...monoXs}}>{t.zScore??'—'}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',color:t.roc>5?'#22c55e':t.roc<-5?'#ef4444':'var(--t2)',...monoXs}}>{t.roc!=null?t.roc.toFixed(1):'—'}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',color:t.adx>25?'var(--accent)':'var(--t4)',...monoXs}}>{t.adx??'—'}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',color:t.sharpe>1?'#22c55e':t.sharpe<0?'#ef4444':'var(--t2)',...monoXs}}>{t.sharpe??'—'}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',...monoXs,color:'var(--t2)'}}>{t.sortino??'—'}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',color:'#f87171',...monoXs}}>{t.mdd!=null?pct(t.mdd*100,1):'—'}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',color:'#f97316',...monoXs}}>{t.var95!=null?pct(t.var95*100,2):'—'}</td>
                      <td style={{padding:'3px 6px',textAlign:'right',...monoXs,color:'var(--t2)'}}>{t.vol21??'—'}%</td>
                      <td style={{padding:'3px 6px',textAlign:'right',color:sigColor,fontWeight:700,...monoXs}}>{t.signalLabel}</td>
                    </tr>
                  })}
                  {!Object.keys(analytics?.technicals||{}).length&&<tr><td colSpan={15} style={{padding:12,color:'var(--t4)',textAlign:'center',...monoXs}}>Click symbols in Charts tab to load history data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PORTFOLIO ── */}
        {tab==='portfolio'&&(
          <div style={{display:'flex',height:'100%',overflow:'hidden'}}>
            <div style={{width:220,flexShrink:0,borderRight:'1px solid var(--border)',overflowY:'auto',padding:10}}>
              <SecHead title="PORTFOLIO SYMBOLS" icon={Shield}/>
              <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                {portSyms.map(s=>(
                  <span key={s} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 6px',background:'rgba(45,212,191,0.08)',border:'1px solid rgba(45,212,191,0.2)',borderRadius:3,...monoXs,color:'var(--accent)'}}>
                    {s}<button onClick={()=>setPortSyms(p=>p.filter(x=>x!==s))} style={{background:'none',border:'none',cursor:'pointer',...monoXs,color:'var(--t3)',padding:0}}>×</button>
                  </span>
                ))}
              </div>
              <div style={{display:'flex',gap:4,marginBottom:10}}>
                <select onChange={e=>{if(e.target.value&&!portSyms.includes(e.target.value))setPortSyms(p=>[...p,e.target.value]);e.target.value=''}}
                  style={{flex:1,padding:'3px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3,...monoXs,color:'var(--t2)'}}>
                  <option value="">+ Add symbol</option>
                  {[...WATCHLIST.indices,...WATCHLIST.commodities,...WATCHLIST.bonds,...WATCHLIST.forex].map(x=><option key={x.sym} value={x.sym}>{x.label}</option>)}
                </select>
              </div>
              <button onClick={runPortfolio} style={{width:'100%',padding:'4px',background:'rgba(45,212,191,0.1)',border:'1px solid var(--accent)',borderRadius:3,...monoXs,color:'var(--accent)',cursor:'pointer',marginBottom:8}}>Calculate Frontier</button>
              {frontierData?.maxSharpe&&<>
                <div style={{...monoXs,color:'var(--t4)',marginBottom:4}}>MAX SHARPE PORTFOLIO</div>
                {frontierData.symbols.map((s,i)=>(
                  <div key={s} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',borderBottom:'1px solid rgba(255,255,255,0.03)',...monoXs}}>
                    <span style={{color:'var(--t2)'}}>{s}</span>
                    <span style={{color:'var(--accent)'}}>{(frontierData.maxSharpe.weights[i]*100).toFixed(1)}%</span>
                  </div>
                ))}
                <div style={{marginTop:8,...monoXs}}>
                  <div style={{display:'flex',justifyContent:'space-between',color:'var(--t3)'}}><span>Return</span><span style={{color:'#22c55e'}}>{pct(frontierData.maxSharpe.ret*100,1)}</span></div>
                  <div style={{display:'flex',justifyContent:'space-between',color:'var(--t3)'}}><span>Vol</span><span style={{color:'#f97316'}}>{pct(frontierData.maxSharpe.vol*100,1)}</span></div>
                  <div style={{display:'flex',justifyContent:'space-between',color:'var(--t3)'}}><span>Sharpe</span><span style={{color:'var(--accent)'}}>{frontierData.maxSharpe.sharpe.toFixed(3)}</span></div>
                </div>
              </>}
              {frontierData?.minVol&&<>
                <div style={{...monoXs,color:'var(--t4)',marginTop:10,marginBottom:4}}>MIN VOL PORTFOLIO</div>
                {frontierData.symbols.map((s,i)=>(
                  <div key={s} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',...monoXs}}>
                    <span style={{color:'var(--t2)'}}>{s}</span>
                    <span style={{color:'#2dd4bf'}}>{(frontierData.minVol.weights[i]*100).toFixed(1)}%</span>
                  </div>
                ))}
                <div style={{marginTop:6,...monoXs}}>
                  <div style={{display:'flex',justifyContent:'space-between',color:'var(--t3)'}}><span>Vol</span><span style={{color:'#2dd4bf'}}>{pct(frontierData.minVol.vol*100,1)}</span></div>
                </div>
              </>}
              {/* Risk parity */}
              {frontierData?.symbols&&<>
                <div style={{...monoXs,color:'var(--t4)',marginTop:10,marginBottom:4}}>RISK PARITY (1/VOL)</div>
                {(()=>{
                  const vols=frontierData.symbols.map(s=>analytics?.technicals?.[s]?.vol21||15)
                  const rp=riskParityWeights(vols)
                  return frontierData.symbols.map((s,i)=>(
                    <div key={s} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',...monoXs}}>
                      <span style={{color:'var(--t2)'}}>{s}</span>
                      <span style={{color:'#a78bfa'}}>{(rp[i]*100).toFixed(1)}%</span>
                    </div>
                  ))
                })()}
              </>}
            </div>
            <div style={{flex:1,overflowY:'auto',padding:10}}>
              <SecHead title="EFFICIENT FRONTIER" icon={BarChart2}/>
              <FrontierChart portfolios={frontierData?.allPortfolios||[]} maxSharpe={frontierData?.maxSharpe} minVol={frontierData?.minVol} w={340} h={200}/>
              {corrData&&<>
                <SecHead title="CORRELATION MATRIX" icon={Activity}/>
                <div style={{overflowX:'auto'}}>
                  <CorrHeatmap matrix={corrData.matrix} keys={corrData.keys} size={Math.min(220,corrData.keys.length*35)}/>
                </div>
              </>}
            </div>
          </div>
        )}

        {/* ── OPTIONS ── */}
        {tab==='options'&&(
          <div style={{display:'flex',height:'100%',overflow:'hidden'}}>
            <div style={{width:260,flexShrink:0,borderRight:'1px solid var(--border)',padding:12}}>
              <SecHead title="BLACK-SCHOLES PRICER" icon={Target}/>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {[['Underlying','select',[...WATCHLIST.indices,...WATCHLIST.commodities].map(x=>({value:x.sym,label:x.label}))],['Strike K','number',optK,setOptK,'ATM price'],['Expiry T (years)','number',optT,setOptT,'0.25 = 3mo'],['Implied Vol σ','number',optSigma,setOptSigma,'e.g. 0.20'],['Type','select',['call','put']]].map(([label,type,...rest],i)=>(
                  <div key={i}>
                    <div style={{...monoXs,color:'var(--t4)',marginBottom:2}}>{label}</div>
                    {type==='select'?
                      <select value={i===0?optSym:optType} onChange={e=>i===0?setOptSym(e.target.value):setOptType(e.target.value)} style={{width:'100%',padding:'4px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3,...monoSm,color:'var(--t1)'}}>
                        {(i===0?rest[0]:['call','put']).map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
                      </select>:
                      <input type="number" value={rest[0]} onChange={e=>rest[1](e.target.value)} placeholder={rest[2]} style={{width:'100%',padding:'4px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3,...monoSm,color:'var(--t1)'}}/>}
                  </div>
                ))}
              </div>
              {S&&<div style={{marginTop:10,...monoXs,color:'var(--t4)'}}>Spot (S): <span style={{color:'var(--t1)'}}>{fmt(S,2)}</span></div>}
            </div>
            <div style={{flex:1,overflowY:'auto',padding:12}}>
              {bsResult?<>
                <SecHead title={`B-S ${optType.toUpperCase()} · S=${fmt(S,2)} K=${fmt(K_val,2)} T=${optT}yr σ=${optSigma}`} icon={Target}/>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:16}}>
                  <Stat label="OPTION PRICE" value={fmt(bsResult.price,4)} color="#fbbf24" unit="$"/>
                  <Stat label="DELTA Δ" value={bsResult.delta} color={bsResult.delta>0?'#22c55e':'#ef4444'}/>
                  <Stat label="GAMMA Γ" value={bsResult.gamma}/>
                  <Stat label="THETA Θ" value={bsResult.theta} color="#f97316" unit="$/day"/>
                  <Stat label="VEGA ν" value={bsResult.vega} unit="per 1% σ"/>
                  <Stat label="RHO ρ" value={bsResult.rho} unit="per 1% r"/>
                </div>
                {/* Vol surface: multiple strikes */}
                <SecHead title="VOL SURFACE (ATM ± 20%)" icon={BarChart2}/>
                <div style={{overflowX:'auto'}}>
                  <table style={{borderCollapse:'collapse',width:'100%',...monoXs}}>
                    <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                      {['Expiry','K -20%','K -10%','ATM','K +10%','K +20%'].map(h=><th key={h} style={{padding:'4px 8px',color:'var(--t4)',textAlign:'right',fontWeight:'normal'}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {[0.083,0.25,0.5,1.0,2.0].map(T=>{
                        const strikes=[-0.2,-0.1,0,0.1,0.2].map(pctK=>S*(1+pctK))
                        return <tr key={T} style={{borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                          <td style={{padding:'3px 8px',color:'var(--t3)',textAlign:'left'}}>{T===0.083?'1mo':T===0.25?'3mo':T===0.5?'6mo':T===1?'1yr':'2yr'}</td>
                          {strikes.map((k,i)=>{
                            const bs=blackScholes(S,k,T,0.05,parseFloat(optSigma)||0.2,optType)
                            return <td key={i} style={{padding:'3px 8px',textAlign:'right',color:i===2?'#fbbf24':'var(--t2)'}}>${fmt(bs.price,2)}</td>
                          })}
                        </tr>
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Greeks breakdown */}
                <SecHead title="GREEKS EXPLAINED" icon={Activity}/>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {[['Delta','Rate of change of option price per $1 move in underlying','Delta hedging: short '+Math.abs(bsResult.delta).toFixed(2)+' shares per option contract'],
                    ['Gamma','Rate of change of Delta per $1 move','High gamma = unstable delta hedge, needs more frequent rebalancing'],
                    ['Theta','Time decay: option loses $'+Math.abs(bsResult.theta).toFixed(4)+' per day','Theta harvest strategies sell options to capture time decay'],
                    ['Vega','Sensitivity to vol: +'+bsResult.vega.toFixed(4)+' per 1% σ increase','Long options = long vol; short options = short vol'],
                    ['Rho','Sensitivity to interest rate','Usually smallest greek; matters more for long-dated options']].map(([name,desc,use])=>(
                    <div key={name} style={{padding:'6px 8px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                        <span style={{...monoSm,color:'var(--accent)',fontWeight:700}}>{name}</span>
                      </div>
                      <div style={{...monoXs,color:'var(--t3)',marginBottom:2}}>{desc}</div>
                      <div style={{...monoXs,color:'var(--t4)'}}>{use}</div>
                    </div>
                  ))}
                </div>
              </>:<div style={{padding:20,...monoSm,color:'var(--t4)',textAlign:'center'}}>Fill in option parameters to compute Black-Scholes price + greeks</div>}
            </div>
          </div>
        )}

        {/* ── MACRO ── */}
        {tab==='macro'&&(
          <div style={{overflowY:'auto',height:'100%',padding:12}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
              <div>
                <SecHead title="YIELD CURVE" icon={Activity}/>
                {(()=>{
                  const yc=analytics?.ycMetrics
                  return <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    {[['3M',fredData?.DGS3M?.value,null],['2Y',fredData?.DGS2?.value,null],['5Y',fredData?.DGS5?.value,null],['10Y',fredData?.DGS10?.value,null],['30Y',fredData?.DGS30?.value,null]].map(([label,v])=>(
                      <div key={label} style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{...monoXs,color:'var(--t4)',width:25}}>{label}</span>
                        <div style={{flex:1,height:8,background:'var(--raised)',borderRadius:2}}>
                          {v!=null&&<div style={{width:`${Math.min(100,v/6*100)}%`,height:'100%',background:'#2dd4bf',borderRadius:2}}/>}
                        </div>
                        <span style={{...monoSm,color:'var(--t1)',minWidth:36}}>{v!=null?v.toFixed(2)+'%':'—'}</span>
                      </div>
                    ))}
                    {yc&&<div style={{marginTop:8,padding:'6px 8px',background:`${yc.inverted?'rgba(239,68,68,0.08)':'rgba(34,197,94,0.08)'}`,border:`1px solid ${yc.inverted?'rgba(239,68,68,0.3)':'rgba(34,197,94,0.3)'}`,borderRadius:4}}>
                      <div style={{...monoSm,color:yc.inverted?'#ef4444':'#22c55e'}}>{yc.inverted?'⚠ INVERTED CURVE':'✓ NORMAL CURVE'}</div>
                      <div style={{...monoXs,color:'var(--t4)',marginTop:2}}>10Y-2Y spread: {yc.slope!=null?yc.slope+'%':'—'}</div>
                      {yc.recessionSignal&&<div style={{...monoXs,color:'#f97316',marginTop:2}}>Recession signal threshold crossed (&lt;-25bp)</div>}
                    </div>}
                  </div>
                })()}
              </div>
              <div>
                <SecHead title="FINANCIAL CONDITIONS INDEX" icon={Shield}/>
                {analytics?.fci&&<>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',background:analytics.fci.fci>0?'rgba(239,68,68,0.08)':'rgba(34,197,94,0.08)',border:`1px solid ${analytics.fci.fci>0?'rgba(239,68,68,0.3)':'rgba(34,197,94,0.3)'}`,borderRadius:4,marginBottom:8}}>
                    <span style={{...mono,color:'var(--t1)',fontWeight:700}}>FCI {analytics.fci.fci}</span>
                    <span style={{...monoSm,color:analytics.fci.level==='TIGHT'?'#ef4444':'#22c55e'}}>{analytics.fci.level}</span>
                  </div>
                  {Object.entries(analytics.fci.components).map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,0.03)',...monoXs}}>
                      <span style={{color:'var(--t3)'}}>{k}</span>
                      <span style={{color:v>0?'#ef4444':'#22c55e'}}>{v>0?'+':''}{v}</span>
                    </div>
                  ))}
                </>}
                {/* ══ ADULT PLATFORM ECONOMIC INDICATOR ══ */}
                {adultEcon && (
                  <div style={{marginBottom:10}}>
                    <SecHead title="ADULT PLATFORM ECON INDICATOR" icon={Activity}/>
                    <div style={{padding:'8px 10px',background:adultEcon.label==='RECESSION'?'rgba(239,68,68,0.08)':adultEcon.label==='STRESS'?'rgba(249,115,22,0.08)':adultEcon.label==='EXPANSION'?'rgba(34,197,94,0.06)':'rgba(45,212,191,0.05)',border:`1px solid ${adultEcon.label==='RECESSION'?'rgba(239,68,68,0.25)':adultEcon.label==='STRESS'?'rgba(249,115,22,0.25)':adultEcon.label==='EXPANSION'?'rgba(34,197,94,0.25)':'rgba(45,212,191,0.15)'}`,borderRadius:4,marginBottom:6}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                        <span style={{...monoXs,color:adultEcon.label==='RECESSION'?'#ef4444':adultEcon.label==='STRESS'?'#f97316':adultEcon.label==='EXPANSION'?'#22c55e':'var(--accent)',fontWeight:700}}>{adultEcon.label||'—'}</span>
                        <span style={{...monoXs,color:'var(--t4)'}}>{adultEcon.source}</span>
                      </div>
                      <div style={{...monoXs,color:'var(--t4)',lineHeight:1.6,marginBottom:4}}>{adultEcon.methodology}</div>
                      <div style={{width:'100%',height:4,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden',marginBottom:6}}>
                        <div style={{width:`${(adultEcon.signal||0)*100}%`,height:'100%',background:adultEcon.label==='RECESSION'?'#ef4444':adultEcon.label==='STRESS'?'#f97316':'#22c55e',borderRadius:2,transition:'width 0.5s'}}/>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
                        {adultEcon.consumerStress!=null&&(
                          <div style={{padding:'3px 5px',background:'rgba(255,255,255,0.03)',borderRadius:3}}>
                            <div style={{...monoXs,color:'var(--t3)',fontSize:'0.65rem'}}>Consumer Stress</div>
                            <div style={{...monoXs,color:adultEcon.consumerStress>0.5?'#ef4444':'#22c55e',fontWeight:700}}>{(adultEcon.consumerStress*100).toFixed(0)}%</div>
                          </div>
                        )}
                        {adultEcon.savingsRate!=null&&(
                          <div style={{padding:'3px 5px',background:'rgba(255,255,255,0.03)',borderRadius:3}}>
                            <div style={{...monoXs,color:'var(--t3)',fontSize:'0.65rem'}}>Savings Rate (PSAVERT)</div>
                            <div style={{...monoXs,color:adultEcon.savingsRate>0.4?'#f97316':'#22c55e',fontWeight:700}}>{(adultEcon.savingsRate*18).toFixed(1)}%</div>
                          </div>
                        )}
                        {adultEcon.unemploymentRate!=null&&(
                          <div style={{padding:'3px 5px',background:'rgba(255,255,255,0.03)',borderRadius:3}}>
                            <div style={{...monoXs,color:'var(--t3)',fontSize:'0.65rem'}}>Unemployment (FRED)</div>
                            <div style={{...monoXs,color:adultEcon.unemploymentRate>5?'#ef4444':adultEcon.unemploymentRate>4?'#f97316':'#22c55e',fontWeight:700}}>{adultEcon.unemploymentRate?.toFixed(1)}%</div>
                          </div>
                        )}
                        {adultEcon.retailSalesGrowth!=null&&(
                          <div style={{padding:'3px 5px',background:'rgba(255,255,255,0.03)',borderRadius:3}}>
                            <div style={{...monoXs,color:'var(--t3)',fontSize:'0.65rem'}}>Retail MoM (RSAFS)</div>
                            <div style={{...monoXs,color:adultEcon.retailSalesGrowth>0?'#22c55e':'#ef4444',fontWeight:700}}>{adultEcon.retailSalesGrowth>0?'+':''}{adultEcon.retailSalesGrowth?.toFixed(2)}%</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{...monoXs,color:'var(--t4)',lineHeight:1.5,padding:'4px 0',fontSize:'0.68rem'}}>
                      Counter-cyclical indicator: adult platform traffic spikes precede recessions by 2-4 quarters (Berenberg Bank 2020; Goldman Sachs Consumer Research 2023). This composite uses FRED correlates (UMCSENT, PSAVERT, UNRATE, RSAFS) as the validated proxy — same signals academic studies found statistically significant.
                    </div>
                  </div>
                )}
                <SecHead title="FRED MACRO INDICATORS" icon={Globe}/>
                {fredData&&Object.values(fredData).map(s=>(
                  <div key={s.id} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,0.03)',...monoXs}}>
                    <span style={{color:'var(--t3)',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.label}</span>
                    <div style={{display:'flex',gap:6}}>
                      <span style={{color:'var(--t1)'}}>{s.value!=null?s.value.toFixed(2):''}{s.unit}</span>
                      {s.changePct!=null&&<span style={{color:s.changePct>0?'#22c55e':'#ef4444'}}>{s.changePct>0?'+':''}{s.changePct.toFixed(2)}%</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <SecHead title="RISK ON/OFF DASHBOARD" icon={Activity}/>
                {analytics?.riskRegime&&<>
                  <div style={{padding:'10px 12px',background:analytics.riskRegime.regime==='RISK_ON'?'rgba(34,197,94,0.08)':analytics.riskRegime.regime==='RISK_OFF'?'rgba(239,68,68,0.08)':'rgba(45,212,191,0.05)',border:`1px solid ${analytics.riskRegime.regime==='RISK_ON'?'rgba(34,197,94,0.3)':analytics.riskRegime.regime==='RISK_OFF'?'rgba(239,68,68,0.3)':'rgba(45,212,191,0.2)'}`,borderRadius:4,marginBottom:10}}>
                    <div style={{...mono,fontWeight:700,color:analytics.riskRegime.regime==='RISK_ON'?'#22c55e':analytics.riskRegime.regime==='RISK_OFF'?'#ef4444':'var(--accent)'}}>{analytics.riskRegime.regime.replace('_',' ')}</div>
                    <div style={{...monoXs,color:'var(--t4)',marginTop:4}}>Composite score: {analytics.riskRegime.score}</div>
                  </div>
                  {[['VIX',vix,vix!=null?vix>30?'Risk-off':vix>20?'Cautious':'Risk-on':'—',vix>30?'#ef4444':vix>20?'#f97316':'#22c55e'],
                    ['SPY',quotes['SPY']?.changePercent,quotes['SPY']?.changePercent>0?'Risk-on':'Risk-off',quotes['SPY']?.changePercent>0?'#22c55e':'#ef4444'],
                    ['Gold',quotes['GC=F']?.changePercent,quotes['GC=F']?.changePercent>0?'Flight-to-safety':'Risk-on',quotes['GC=F']?.changePercent>0?'#f97316':'#22c55e'],
                    ['DXY',quotes['DX=F']?.changePercent,quotes['DX=F']?.changePercent>0?'USD strength (risk-off)':'Risk-on',quotes['DX=F']?.changePercent>0?'#f97316':'#22c55e'],
                  ].map(([label,v,signal,color])=>(
                    <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,0.03)',...monoXs}}>
                      <span style={{color:'var(--t3)'}}>{label}</span>
                      <span style={{color:'var(--t2)'}}>{v!=null?typeof v==='number'?v.toFixed(2):v:'—'}</span>
                      <span style={{color}}>{signal}</span>
                    </div>
                  ))}
                </>}
              </div>
            </div>
          </div>
        )}

        {/* ── BACKTEST ── */}
        {tab==='backtest'&&(
          <div style={{overflowY:'auto',height:'100%',padding:12}}>
            <SecHead title="CROSS-SECTIONAL MOMENTUM BACKTEST" icon={Cpu}/>
            <div style={{display:'flex',gap:8,marginBottom:12}}>
              <div style={{...monoXs,color:'var(--t4)',lineHeight:1.8}}>
                Strategy: monthly rebalance, long top-tercile by 6M return<br/>
                Universe: {portSyms.join(', ')}<br/>
                Available history: {portSyms.filter(s=>history[s]?.length>=200).length}/{portSyms.length} symbols with 200+ bars
              </div>
              <button onClick={runBacktest} style={{padding:'6px 16px',background:'rgba(45,212,191,0.1)',border:'1px solid var(--accent)',borderRadius:3,...monoSm,color:'var(--accent)',cursor:'pointer',flexShrink:0}}>Run Backtest</button>
            </div>
            {backtestResult?<>
              <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:6,marginBottom:12}}>
                <Stat label="TOTAL RETURN" value={pct(backtestResult.metrics.totalReturn*100,1)} color={backtestResult.metrics.totalReturn>0?'#22c55e':'#ef4444'}/>
                <Stat label="CAGR" value={pct(backtestResult.metrics.cagr*100,2)} color={backtestResult.metrics.cagr>0?'#22c55e':'#ef4444'}/>
                <Stat label="VOL (ANN)" value={pct(backtestResult.metrics.annualisedVol*100,2)} color="#f97316"/>
                <Stat label="SHARPE" value={backtestResult.metrics.sharpe??'—'} color={backtestResult.metrics.sharpe>1?'#22c55e':backtestResult.metrics.sharpe<0?'#ef4444':'var(--t1)'}/>
                <Stat label="MAX DD" value={pct(backtestResult.metrics.maxDrawdown*100,1)} color="#ef4444"/>
                <Stat label="CALMAR" value={backtestResult.metrics.calmar??'—'} color={backtestResult.metrics.calmar>1?'#22c55e':'var(--t1)'}/>
              </div>
              {/* Equity curve */}
              <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:4,padding:8}}>
                <div style={{...monoXs,color:'var(--t4)',marginBottom:4}}>EQUITY CURVE (Base 100)</div>
                {(()=>{
                  const vals=backtestResult.equityCurve,n=vals.length
                  const minV=Math.min(...vals.map(e=>e.value)),maxV=Math.max(...vals.map(e=>e.value)),span=maxV-minV||1
                  const w=600,h=120
                  const pts=vals.map((e,i)=>`${(i/(n-1)*w).toFixed(1)},${(h-(e.value-minV)/span*h).toFixed(1)}`).join(' ')
                  const up=vals[n-1].value>=100
                  return <svg width="100%" viewBox={`0 0 ${w} ${h+20}`} style={{display:'block'}}>
                    <line x1={0} y1={h-(100-minV)/span*h} x2={w} y2={h-(100-minV)/span*h} stroke="rgba(255,255,255,0.15)" strokeWidth={0.8} strokeDasharray="4,3"/>
                    <polyline points={pts} fill="none" stroke={up?'#22c55e':'#ef4444'} strokeWidth={1.8} strokeLinejoin="round"/>
                    <text x={w-4} y={h-(vals[n-1].value-minV)/span*h-4} textAnchor="end" fill={up?'#22c55e':'#ef4444'} fontSize={9} fontFamily="JetBrains Mono">{vals[n-1].value.toFixed(1)}</text>
                    <text x={4} y={h+15} fill="var(--t4)" fontSize={8} fontFamily="JetBrains Mono">{vals[0]?.date}</text>
                    <text x={w-4} y={h+15} textAnchor="end" fill="var(--t4)" fontSize={8} fontFamily="JetBrains Mono">{vals[n-1]?.date}</text>
                  </svg>
                })()}
              </div>
            </>:<div style={{padding:20,...monoSm,color:'var(--t4)',textAlign:'center'}}>Click "Run Backtest" — requires at least 2 symbols with 200+ days of history in portfolio tab</div>}
          </div>
        )}

        {/* ── CRYPTO ── */}
        {tab==='crypto'&&(
          <div style={{overflowY:'auto',height:'100%',padding:12}}>
            <SecHead title="CRYPTO MARKETS" icon={DollarSign}/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6}}>
              {crypto.map(c=>(
                <div key={c.id} style={{padding:'8px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:4}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                    <div>
                      <span style={{...mono,color:'var(--accent)',fontWeight:700}}>{c.symbol?.toUpperCase()}</span>
                      <span style={{...monoXs,color:'var(--t3)',marginLeft:8}}>{c.name}</span>
                    </div>
                    <span style={{fontFamily:'Orbitron',fontSize:13,color:'var(--t1)'}}>${fmt(c.current_price,c.current_price>100?2:4)}</span>
                  </div>
                  <div style={{display:'flex',gap:8,marginBottom:6}}>
                    <span style={{...monoXs,color:'var(--t4)'}}>1h</span><Chg v={c.price_change_percentage_1h_in_currency}/>
                    <span style={{...monoXs,color:'var(--t4)'}}>24h</span><Chg v={c.price_change_percentage_24h}/>
                    <span style={{...monoXs,color:'var(--t4)'}}>7d</span><Chg v={c.price_change_percentage_7d_in_currency}/>
                    <span style={{...monoXs,color:'var(--t4)'}}>30d</span><Chg v={c.price_change_percentage_30d_in_currency}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,...monoXs,color:'var(--t4)'}}>
                    <span>MCap: <span style={{color:'var(--t2)'}}>${fmt(c.market_cap,0)}</span></span>
                    <span>Vol: <span style={{color:'var(--t2)'}}>${fmt(c.total_volume,0)}</span></span>
                  </div>
                  {c.sparkline_in_7d?.price&&<Spark closes={c.sparkline_in_7d.price.slice(-48)} w={160} h={30} color={c.price_change_percentage_7d_in_currency>0?'#22c55e':'#ef4444'}/>}
                </div>
              ))}
              {!crypto.length&&<div style={{gridColumn:'1/-1',padding:20,...monoSm,color:'var(--t4)',textAlign:'center'}}>Loading crypto data…</div>}
            </div>
          </div>
        )}

        {/* ── FX ── */}
        {tab==='fx'&&(
          <div style={{overflowY:'auto',height:'100%',padding:12}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div>
                <SecHead title="LIVE FX RATES (USD base)" icon={Globe}/>
                {fx?.rates?Object.entries(fx.rates).map(([code,rate])=>(
                  <div key={code} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,0.03)',...monoSm}}>
                    <span style={{color:'var(--t3)',width:50}}>{code}</span>
                    <span style={{color:'var(--t1)',minWidth:80,textAlign:'right'}}>{fmt(rate,4)}</span>
                    <div style={{width:80,height:4,background:'var(--raised)',borderRadius:2,overflow:'hidden',marginLeft:8}}>
                      <div style={{width:`${Math.min(100,(rate/200)*100)}%`,height:'100%',background:'var(--accent)'}}/>
                    </div>
                  </div>
                )):<div style={{...monoSm,color:'var(--t4)'}}>Loading FX data…</div>}
              </div>
              <div>
                <SecHead title="WAR/CONFLICT CURRENCIES" icon={Shield}/>
                {['UAH','ILS','RUB','IRR','PKR','TRY','MMK','SDG'].map(code=>{
                  const rate=fx?.rates?.[code]
                  const labels={UAH:'Ukraine Hryvnia',ILS:'Israeli Shekel',RUB:'Russian Ruble',IRR:'Iranian Rial',PKR:'Pakistan Rupee',TRY:'Turkish Lira',MMK:'Myanmar Kyat',SDG:'Sudan Pound'}
                  const historicHigh={UAH:43,ILS:4.6,RUB:70,IRR:42000,PKR:285,TRY:18,MMK:2000,SDG:600}
                  const stress=rate&&historicHigh[code]?rate/historicHigh[code]:null
                  return <div key={code} style={{padding:'5px 8px',marginBottom:4,background:stress>2?'rgba(239,68,68,0.08)':'var(--panel)',border:`1px solid ${stress>2?'rgba(239,68,68,0.25)':'var(--border)'}`,borderRadius:3}}>
                    <div style={{display:'flex',justifyContent:'space-between',...monoSm}}>
                      <span style={{color:'var(--t2)'}}>{code} <span style={{...monoXs,color:'var(--t4)'}}>{labels[code]||code}</span></span>
                      <span style={{color:stress>2?'#ef4444':stress>1.5?'#f97316':'var(--t1)'}}>{rate?fmt(rate,2):'—'}</span>
                    </div>
                    {stress!=null&&<div style={{...monoXs,color:'var(--t4)',marginTop:2}}>{stress>2?'⚠ SEVERE DEVALUATION':stress>1.5?'⚡ STRESS':''} {(stress*100-100).toFixed(0)}% above 2022 baseline</div>}
                  </div>
                })}
                <SecHead title="CARRY TRADE SIGNALS" icon={TrendingUp}/>
                <div style={{...monoXs,color:'var(--t4)',marginBottom:6}}>High-yield vs low-yield: borrow JPY/CHF, long BRL/MXN/INR</div>
                {[['USD/JPY','#fbbf24','USD','5.25%','JPY','0.1%'],['USD/BRL','#34d399','BRL','13.75%','USD','5.25%'],['USD/MXN','#22d3ee','MXN','11.25%','USD','5.25%'],['USD/TRY','#f97316','TRY','45%','USD','5.25%']].map(([pair,color,long,rL,short,rS])=>(
                  <div key={pair} style={{display:'flex',justifyContent:'space-between',padding:'4px 6px',marginBottom:3,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:3,...monoXs}}>
                    <span style={{color}}>{pair}</span>
                    <span style={{color:'var(--t3)'}}>LONG {long} {rL} vs SHORT {short} {rS}</span>
                    <span style={{color:'#22c55e'}}>+{(parseFloat(rL)-parseFloat(rS)).toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
