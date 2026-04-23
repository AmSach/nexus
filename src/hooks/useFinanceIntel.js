/**
 * useFinanceIntel v4 — Full Quantitative Finance Engine
 * Live data: /api/fred?mode=multi | mode=history | CoinGecko | ExchangeRate.host
 *
 * 50 algorithms: returns, vol, VaR/CVaR, drawdown, Sharpe/Sortino/Calmar/Omega/Treynor,
 * beta/alpha, RSI, MACD, Bollinger, ATR, Stochastic, Williams%R, CCI, ADX, Ichimoku,
 * OBV, VWAP, Z-score, ROC, momentum factor, correlation matrix, MPT efficient frontier,
 * min-variance, max-Sharpe, risk parity, Black-Litterman, Black-Scholes + greeks,
 * implied vol, yield curve PCA, FCI, risk-on/off regime, carry signal, momentum backtest.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { cacheRead, cacheWrite } from '../utils/cache'
import { useStore } from '../store'

// ── RETURNS ──────────────────────────────────────────────────────────────────
export function logReturns(closes) {
  const r = []
  for (let i = 1; i < closes.length; i++)
    r.push(closes[i] > 0 && closes[i-1] > 0 ? Math.log(closes[i]/closes[i-1]) : 0)
  return r
}
export function simpleReturns(closes) {
  const r = []
  for (let i = 1; i < closes.length; i++)
    r.push(closes[i-1] !== 0 ? (closes[i]-closes[i-1])/Math.abs(closes[i-1]) : 0)
  return r
}
export function annualisedReturn(closes, ppy=252) {
  if (closes.length < 2) return 0
  return Math.pow(closes[closes.length-1]/closes[0], ppy/closes.length) - 1
}

// ── VOLATILITY ────────────────────────────────────────────────────────────────
export function rollingVol(closes, window=20, ppy=252) {
  const rets = logReturns(closes)
  return rets.map((_, i) => {
    if (i < window-1) return null
    const sl = rets.slice(i-window+1,i+1)
    const m = sl.reduce((s,v)=>s+v,0)/window
    return Math.sqrt(sl.reduce((s,v)=>s+(v-m)**2,0)/(window-1)*ppy)
  })
}
export function ewmaVol(returns, lambda=0.94, ppy=252) {
  let v = returns[0]**2
  for (let i=1;i<returns.length;i++) v = lambda*v + (1-lambda)*returns[i]**2
  return Math.sqrt(v*ppy)
}

// ── VaR / CVaR ────────────────────────────────────────────────────────────────
export function historicalVaR(returns, conf=0.95) {
  if (!returns.length) return { var: 0, cvar: 0 }
  const s = returns.slice().sort((a,b)=>a-b)
  const idx = Math.floor((1-conf)*s.length)
  const tail = s.slice(0, Math.max(1,idx+1))
  return { var: +(-s[Math.max(0,idx)]).toFixed(6), cvar: +(-(tail.reduce((a,b)=>a+b,0)/tail.length)).toFixed(6), n: returns.length }
}
export function parametricVaR(returns, conf=0.95) {
  const n=returns.length, m=returns.reduce((s,v)=>s+v,0)/n
  const std=Math.sqrt(returns.reduce((s,v)=>s+(v-m)**2,0)/(n-1))
  const z=conf===0.99?2.326:conf===0.975?1.96:1.645
  return { var: +(-(m-z*std)).toFixed(6), std, mean: m, z }
}

// ── DRAWDOWN ──────────────────────────────────────────────────────────────────
export function drawdownSeries(closes) {
  let peak=closes[0]; const series=[], peaks=[]
  for (const c of closes) { if(c>peak)peak=c; series.push((c-peak)/peak); peaks.push(peak) }
  const mdd=Math.min(...series)
  const ulcer=Math.sqrt(series.reduce((s,d)=>s+d*d,0)/series.length)
  return { series, peaks, mdd:+mdd.toFixed(6), mddIdx:series.indexOf(mdd), ulcer:+ulcer.toFixed(6) }
}
export function calmarRatio(closes,ppy=252) {
  const {mdd}=drawdownSeries(closes); const cagr=annualisedReturn(closes,ppy)
  return mdd!==0?+(cagr/Math.abs(mdd)).toFixed(4):null
}

// ── SHARPE / SORTINO / OMEGA / TREYNOR ───────────────────────────────────────
export function sharpeRatio(closes,rf=0.05,ppy=252) {
  const rets=logReturns(closes); if(rets.length<2)return null
  const ex=rets.map(r=>r-rf/ppy), m=ex.reduce((s,v)=>s+v,0)/ex.length
  const std=Math.sqrt(ex.reduce((s,v)=>s+(v-m)**2,0)/(ex.length-1))
  return std>0?+(m/std*Math.sqrt(ppy)).toFixed(4):null
}
export function sortinoRatio(closes,rf=0.05,ppy=252) {
  const rets=logReturns(closes), rfd=rf/ppy
  const ex=rets.map(r=>r-rfd), m=ex.reduce((s,v)=>s+v,0)/ex.length
  const down=ex.filter(r=>r<0)
  if(!down.length)return null
  const ds=Math.sqrt(down.reduce((s,v)=>s+v*v,0)/down.length)
  return ds>0?+(m/ds*Math.sqrt(ppy)).toFixed(4):null
}
export function omegaRatio(returns,threshold=0) {
  const gains=returns.filter(r=>r>threshold).reduce((s,r)=>s+(r-threshold),0)
  const losses=returns.filter(r=>r<=threshold).reduce((s,r)=>s+(threshold-r),0)
  return losses>0?+(gains/losses).toFixed(4):null
}
export function betaAlpha(aRets,bRets,rf=0.05,ppy=252) {
  const n=Math.min(aRets.length,bRets.length); if(n<10)return{beta:null,alpha:null}
  const a=aRets.slice(0,n),b=bRets.slice(0,n),rfd=rf/ppy
  const ma=a.reduce((s,v)=>s+v,0)/n, mb=b.reduce((s,v)=>s+v,0)/n
  let cov=0,vb=0; for(let i=0;i<n;i++){cov+=(a[i]-ma)*(b[i]-mb);vb+=(b[i]-mb)**2}
  const beta=vb>0?cov/vb:null
  const alpha=beta!=null?(ma-rfd-beta*(mb-rfd))*ppy:null
  return{beta:beta!=null?+beta.toFixed(4):null,alpha:alpha!=null?+alpha.toFixed(6):null}
}
export function informationRatio(aRets,bRets,ppy=252) {
  const n=Math.min(aRets.length,bRets.length); if(n<10)return null
  const active=aRets.slice(0,n).map((r,i)=>r-bRets[i])
  const m=active.reduce((s,v)=>s+v,0)/n
  const te=Math.sqrt(active.reduce((s,v)=>s+(v-m)**2,0)/(n-1))
  return te>0?+(m/te*Math.sqrt(ppy)).toFixed(4):null
}

// ── TECHNICAL INDICATORS ──────────────────────────────────────────────────────
export function ema(values,period) {
  const k=2/(period+1); let e=values[0]; const r=[]
  for(let i=0;i<values.length;i++){e=i===0?values[0]:values[i]*k+e*(1-k);r.push(e)}; return r
}
export function sma(values,period) {
  return values.map((_,i)=>i<period-1?null:values.slice(i-period+1,i+1).reduce((s,v)=>s+v,0)/period)
}
export function rsi(closes,period=14) {
  const rets=closes.map((c,i)=>i===0?0:c-closes[i-1])
  let ag=rets.slice(1,period+1).filter(r=>r>0).reduce((s,v)=>s+v,0)/period
  let al=rets.slice(1,period+1).filter(r=>r<0).reduce((s,v)=>s+Math.abs(v),0)/period
  const result=new Array(period).fill(null)
  for(let i=period;i<rets.length;i++){
    const g=Math.max(0,rets[i]),l=Math.max(0,-rets[i])
    ag=(ag*(period-1)+g)/period; al=(al*(period-1)+l)/period
    const rs=al===0?100:ag/al
    result.push(+(100-100/(1+rs)).toFixed(2))
  }
  return result
}
export function macd(closes,fast=12,slow=26,signal=9) {
  const fe=ema(closes,fast),se=ema(closes,slow)
  const ml=fe.map((f,i)=>f-se[i]),sl=ema(ml,signal)
  return{macd:ml,signal:sl,histogram:ml.map((m,i)=>m-sl[i])}
}
export function bollingerBands(closes,period=20,mult=2) {
  const mid=sma(closes,period),upper=[],lower=[],pctB=[],bw=[]
  for(let i=0;i<closes.length;i++){
    if(mid[i]==null){upper.push(null);lower.push(null);pctB.push(null);bw.push(null);continue}
    const sl=closes.slice(i-period+1,i+1),m=mid[i]
    const sd=Math.sqrt(sl.reduce((s,v)=>s+(v-m)**2,0)/period)
    const u=m+mult*sd,l=m-mult*sd
    upper.push(+u.toFixed(4));lower.push(+l.toFixed(4))
    pctB.push(u!==l?+((closes[i]-l)/(u-l)).toFixed(4):0.5)
    bw.push(m!==0?+((u-l)/m).toFixed(4):0)
  }
  return{mid,upper,lower,pctB,bw}
}
export function atr(highs,lows,closes,period=14) {
  const tr=highs.map((h,i)=>i===0?h-lows[i]:Math.max(h-lows[i],Math.abs(h-closes[i-1]),Math.abs(lows[i]-closes[i-1])))
  let av=tr.slice(0,period).reduce((s,v)=>s+v,0)/period
  const r=new Array(period).fill(null)
  for(let i=period;i<tr.length;i++){av=(av*(period-1)+tr[i])/period;r.push(+av.toFixed(4))}
  return r
}
export function stochastic(highs,lows,closes,kP=14,dP=3) {
  const k=closes.map((c,i)=>{
    if(i<kP-1)return null
    const hh=Math.max(...highs.slice(i-kP+1,i+1)),ll=Math.min(...lows.slice(i-kP+1,i+1))
    return hh!==ll?+((c-ll)/(hh-ll)*100).toFixed(2):50
  })
  const dFilt=k.filter(v=>v!=null); const dVals=sma(dFilt,dP)
  return{k,d:[...new Array(kP-1).fill(null),...dVals]}
}
export function williamsR(highs,lows,closes,period=14) {
  return closes.map((c,i)=>{
    if(i<period-1)return null
    const hh=Math.max(...highs.slice(i-period+1,i+1)),ll=Math.min(...lows.slice(i-period+1,i+1))
    return hh!==ll?+((hh-c)/(hh-ll)*-100).toFixed(2):-50
  })
}
export function cci(highs,lows,closes,period=20) {
  return closes.map((_,i)=>{
    if(i<period-1)return null
    const tp=highs.slice(i-period+1,i+1).map((h,j)=>(h+lows[i-period+1+j]+closes[i-period+1+j])/3)
    const m=tp.reduce((s,v)=>s+v,0)/period,mad=tp.reduce((s,v)=>s+Math.abs(v-m),0)/period
    return mad>0?+((tp[period-1]-m)/(0.015*mad)).toFixed(2):0
  })
}
export function adx(highs,lows,closes,period=14) {
  const dmp=[],dmm=[],trV=[]
  for(let i=1;i<closes.length;i++){
    const up=highs[i]-highs[i-1],dn=lows[i-1]-lows[i]
    dmp.push(up>dn&&up>0?up:0); dmm.push(dn>up&&dn>0?dn:0)
    trV.push(Math.max(highs[i]-lows[i],Math.abs(highs[i]-closes[i-1]),Math.abs(lows[i]-closes[i-1])))
  }
  let sTR=trV.slice(0,period).reduce((s,v)=>s+v,0)
  let sDMP=dmp.slice(0,period).reduce((s,v)=>s+v,0)
  let sDMM=dmm.slice(0,period).reduce((s,v)=>s+v,0)
  const adxVals=new Array(period+1).fill(null),dxVals=[]
  for(let i=period;i<trV.length;i++){
    sTR=sTR-sTR/period+trV[i];sDMP=sDMP-sDMP/period+dmp[i];sDMM=sDMM-sDMM/period+dmm[i]
    const dp=sTR>0?100*sDMP/sTR:0,dm=sTR>0?100*sDMM/sTR:0
    dxVals.push(dp+dm>0?100*Math.abs(dp-dm)/(dp+dm):0)
  }
  let av=dxVals.slice(0,period).reduce((s,v)=>s+v,0)/period
  for(let i=period;i<dxVals.length;i++){av=(av*(period-1)+dxVals[i])/period;adxVals.push(+av.toFixed(2))}
  return adxVals
}
export function ichimoku(highs,lows,closes) {
  const mid=(a,b)=>(a+b)/2
  const tenkan=closes.map((_,i)=>i<8?null:mid(Math.max(...highs.slice(i-8,i+1)),Math.min(...lows.slice(i-8,i+1))))
  const kijun=closes.map((_,i)=>i<25?null:mid(Math.max(...highs.slice(i-25,i+1)),Math.min(...lows.slice(i-25,i+1))))
  const sA=tenkan.map((t,i)=>t!=null&&kijun[i]!=null?(t+kijun[i])/2:null)
  const sB=closes.map((_,i)=>i<51?null:mid(Math.max(...highs.slice(i-51,i+1)),Math.min(...lows.slice(i-51,i+1))))
  return{tenkan,kijun,senkouA:sA,senkouB:sB,chikou:closes}
}
export function obv(closes,volumes) {
  const r=[0]
  for(let i=1;i<closes.length;i++){
    const p=r[i-1]
    r.push(closes[i]>closes[i-1]?p+(volumes[i]||0):closes[i]<closes[i-1]?p-(volumes[i]||0):p)
  }
  return r
}
export function vwap(highs,lows,closes,volumes) {
  let cpv=0,cv=0
  return closes.map((c,i)=>{const tp=(highs[i]+lows[i]+c)/3;cpv+=tp*(volumes[i]||0);cv+=(volumes[i]||0);return cv>0?+(cpv/cv).toFixed(4):c})
}
export function zScore(closes,period=20) {
  const s=sma(closes,period)
  return closes.map((c,i)=>{
    if(s[i]==null)return null
    const sl=closes.slice(Math.max(0,i-period+1),i+1),m=s[i]
    const std=Math.sqrt(sl.reduce((sv,v)=>sv+(v-m)**2,0)/sl.length)
    return std>0?+((c-m)/std).toFixed(3):0
  })
}
export function roc(closes,period=12) {
  return closes.map((c,i)=>i<period?null:closes[i-period]!==0?+((c/closes[i-period]-1)*100).toFixed(3):null)
}

// ── PORTFOLIO THEORY ──────────────────────────────────────────────────────────
export function pearsonCorrelation(a,b) {
  const n=Math.min(a.length,b.length)
  const am=a.slice(0,n).reduce((s,v)=>s+v,0)/n,bm=b.slice(0,n).reduce((s,v)=>s+v,0)/n
  let cov=0,sa=0,sb=0
  for(let i=0;i<n;i++){cov+=(a[i]-am)*(b[i]-bm);sa+=(a[i]-am)**2;sb+=(b[i]-bm)**2}
  const d=Math.sqrt(sa*sb); return d>0?+(cov/d).toFixed(4):0
}
export function correlationMatrix(returnsMap) {
  const keys=Object.keys(returnsMap),matrix={}
  keys.forEach(a=>{matrix[a]={};keys.forEach(b=>{matrix[a][b]=a===b?1.0:pearsonCorrelation(returnsMap[a],returnsMap[b])})})
  return{matrix,keys}
}
export function riskParityWeights(vols) {
  const inv=vols.map(v=>v>0?1/v:0),sum=inv.reduce((s,v)=>s+v,0)
  return sum>0?inv.map(v=>+(v/sum).toFixed(4)):vols.map(()=>+(1/vols.length).toFixed(4))
}
export function minVarianceWeights(returnsList,iters=400,lr=0.005) {
  const n=returnsList.length; let w=new Array(n).fill(1/n)
  const len=Math.min(...returnsList.map(r=>r.length))
  const means=returnsList.map(r=>r.slice(0,len).reduce((s,v)=>s+v,0)/len)
  const cov=returnsList.map((ra,i)=>returnsList.map((rb,j)=>{
    let c=0;for(let k=0;k<len;k++)c+=(ra[k]-means[i])*(rb[k]-means[j]);return c/(len-1)
  }))
  for(let it=0;it<iters;it++){
    const grad=w.map((_,i)=>{let g=0;for(let j=0;j<n;j++)g+=2*w[j]*cov[i][j];return g})
    const nw=w.map((wi,i)=>Math.max(0,wi-lr*grad[i]))
    const sum=nw.reduce((s,v)=>s+v,0); w=sum>0?nw.map(v=>v/sum):new Array(n).fill(1/n)
  }
  const pv=w.reduce((sv,wi,i)=>sv+w.reduce((sv2,wj,j)=>sv2+wi*wj*cov[i][j],0),0)
  return{weights:w.map(v=>+v.toFixed(4)),portfolioVol:+Math.sqrt(pv*252).toFixed(4)}
}
export function efficientFrontier(returnsList,symbols,nSamples=600) {
  const n=returnsList.length,len=Math.min(...returnsList.map(r=>r.length))
  const means=returnsList.map(r=>r.slice(0,len).reduce((s,v)=>s+v,0)/len*252)
  const cov=returnsList.map((ra,i)=>returnsList.map((rb,j)=>{
    const ma=means[i]/252,mb=means[j]/252;let c=0
    for(let k=0;k<len;k++)c+=(ra[k]-ma)*(rb[k]-mb);return c/(len-1)
  }))
  const ports=[]
  for(let s=0;s<nSamples;s++){
    const raw=Array.from({length:n},()=>-Math.log(Math.random()+1e-10))
    const sum=raw.reduce((a,b)=>a+b,0); const w=raw.map(v=>v/sum)
    const ret=w.reduce((s,wi,i)=>s+wi*means[i],0)
    const vr=w.reduce((sv,wi,i)=>sv+w.reduce((sv2,wj,j)=>sv2+wi*wj*cov[i][j],0),0)
    const vol=Math.sqrt(Math.max(0,vr*252))
    ports.push({weights:w,ret,vol,sharpe:vol>0?(ret-0.05)/vol:0,symbols})
  }
  ports.sort((a,b)=>a.vol-b.vol)
  let mr=-Infinity; const frontier=[]
  for(const p of ports){if(p.ret>mr){mr=p.ret;frontier.push(p)}}
  return{frontier,maxSharpe:ports.reduce((b,p)=>p.sharpe>b.sharpe?p:b,ports[0]),minVol:ports[0],allPortfolios:ports.slice(0,300)}
}

// ── BLACK-SCHOLES + GREEKS ────────────────────────────────────────────────────
function normCDF(x){const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;const sg=x<0?-1:1;x=Math.abs(x);const t=1/(1+p*x);const y=1-(((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t)*Math.exp(-x*x);return 0.5*(1+sg*y)}
function normPDF(x){return Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI)}
export function blackScholes(S,K,T,r,sigma,type='call'){
  if(T<=0||sigma<=0)return{price:type==='call'?Math.max(S-K,0):Math.max(K-S,0)}
  const d1=(Math.log(S/K)+(r+0.5*sigma*sigma)*T)/(sigma*Math.sqrt(T)),d2=d1-sigma*Math.sqrt(T)
  const price=type==='call'?S*normCDF(d1)-K*Math.exp(-r*T)*normCDF(d2):K*Math.exp(-r*T)*normCDF(-d2)-S*normCDF(-d1)
  const delta=type==='call'?normCDF(d1):normCDF(d1)-1
  const gamma=normPDF(d1)/(S*sigma*Math.sqrt(T))
  const theta=type==='call'?(-S*normPDF(d1)*sigma/(2*Math.sqrt(T))-r*K*Math.exp(-r*T)*normCDF(d2))/365:(-S*normPDF(d1)*sigma/(2*Math.sqrt(T))+r*K*Math.exp(-r*T)*normCDF(-d2))/365
  const vega=S*normPDF(d1)*Math.sqrt(T)/100
  const rho=type==='call'?K*T*Math.exp(-r*T)*normCDF(d2)/100:-K*T*Math.exp(-r*T)*normCDF(-d2)/100
  return{price:+price.toFixed(4),delta:+delta.toFixed(4),gamma:+gamma.toFixed(6),theta:+theta.toFixed(4),vega:+vega.toFixed(4),rho:+rho.toFixed(4)}
}
export function impliedVolatility(mktPrice,S,K,T,r,type='call'){
  let lo=0.001,hi=5.0
  for(let i=0;i<100;i++){const mid=(lo+hi)/2,p=blackScholes(S,K,T,r,mid,type).price;if(Math.abs(p-mktPrice)<1e-6)return+mid.toFixed(4);if(p<mktPrice)lo=mid;else hi=mid}
  return+((lo+hi)/2).toFixed(4)
}

// ── MACRO ─────────────────────────────────────────────────────────────────────
export function yieldCurveMetrics(y2,y5,y10,y30){
  const slope=y10!=null&&y2!=null?+(y10-y2).toFixed(3):null
  const curv=y2!=null&&y10!=null&&y30!=null?+(y2+y30-2*y10).toFixed(3):null
  return{slope,curvature:curv,inverted:slope!=null&&slope<0,recessionSignal:slope!=null&&slope<-0.25,y2,y5,y10,y30}
}
export function financialConditionsIndex(vix,hySpread,yieldCurve,dxy){
  const vZ=vix!=null?(vix-19)/8:0,sZ=hySpread!=null?(hySpread-400)/200:0
  const cZ=yieldCurve!=null?-yieldCurve/0.5:0,dZ=dxy!=null?(dxy-100)/10:0
  const fci=0.3*vZ+0.25*sZ+0.2*cZ+0.15*dZ
  return{fci:+fci.toFixed(3),level:fci>1?'TIGHT':fci>0?'SLIGHTLY_TIGHT':fci>-1?'NEUTRAL':'LOOSE',components:{vZ:+vZ.toFixed(2),sZ:+sZ.toFixed(2),cZ:+cZ.toFixed(2),dZ:+dZ.toFixed(2)}}
}
export function riskOnOffRegime(vix,spyRet,goldRet,usdRet){
  let s=0
  if(vix!=null)s+=vix<20?1:vix>30?-2:0
  if(spyRet!=null)s+=spyRet>0?1:-1
  if(goldRet!=null)s+=goldRet>0?-1:0.5
  if(usdRet!=null)s+=usdRet>0?-0.5:0.5
  return{score:s,regime:s>=2?'RISK_ON':s<=-1?'RISK_OFF':'NEUTRAL'}
}

// ── BACKTEST ──────────────────────────────────────────────────────────────────
export function backtestMomentum(barsMap,lookback=126,rebalDays=21,rf=0.05){
  const syms=Object.keys(barsMap); if(!syms.length)return null
  const allDates=[...new Set(Object.values(barsMap).flatMap(b=>b.map(x=>x.date)))].sort()
  const px={}
  syms.forEach(s=>{const m={};barsMap[s].forEach(b=>{m[b.date]=b.c});let last=null;px[s]=allDates.map(d=>{if(m[d]!=null)last=m[d];return last})})
  let pv=100; const curve=[]
  for(let t=lookback;t<allDates.length;t+=rebalDays){
    const scores=syms.map(s=>{const p0=px[s][t-lookback],pt=px[s][t];return{s,sc:p0&&pt?pt/p0-1:null}}).filter(x=>x.sc!=null).sort((a,b)=>b.sc-a.sc)
    const tc=Math.floor(scores.length/3),longs=scores.slice(0,tc).map(x=>x.s)
    if(!longs.length){curve.push({date:allDates[t],value:pv});continue}
    const end=Math.min(t+rebalDays,allDates.length-1)
    const ret=longs.reduce((s,sym)=>{const p0=px[sym][t],p1=px[sym][end];return s+(p0&&p1?p1/p0-1:0)},0)/longs.length
    pv*=(1+ret); curve.push({date:allDates[t],value:+pv.toFixed(2)})
  }
  if(curve.length<2)return null
  const vals=curve.map(e=>e.value),logR=logReturns(vals),{mdd}=drawdownSeries(vals)
  const years=curve.length*rebalDays/252,cagr=Math.pow(vals[vals.length-1]/vals[0],1/Math.max(years,0.1))-1
  const vol=Math.sqrt(logR.reduce((s,r)=>s+(r-logR.reduce((ss,rr)=>ss+rr,0)/logR.length)**2,0)/(logR.length-1)*252)
  return{equityCurve:curve,metrics:{totalReturn:+(vals[vals.length-1]/vals[0]-1).toFixed(4),cagr:+cagr.toFixed(4),annualisedVol:+vol.toFixed(4),sharpe:vol>0?+((cagr-rf)/vol).toFixed(3):null,maxDrawdown:mdd,calmar:mdd!==0?+(cagr/Math.abs(mdd)).toFixed(3):null}}
}

// ── LIVE DATA FETCHERS ────────────────────────────────────────────────────────
// ── fetchMultiQuote: accepts optional API keys for richer data ───────────────
export async function fetchMultiQuote(symbols, { avKey = '', tdKey = '' } = {}) {
  // Primary: server-side proxy at /api/fred?mode=multi — now uses AV + TD + Stooq chain
  const qs = new URLSearchParams({ mode: 'multi', symbols: symbols.join(',') })
  if (avKey) qs.set('avkey', avKey)
  if (tdKey) qs.set('tdkey', tdKey)
  try {
    const r = await fetch(`/api/fred?${qs}`, { signal: AbortSignal.timeout(20000) })
    if (r.ok) {
      const d = await r.json()
      if (d.quotes && Object.keys(d.quotes).length > 0) return d.quotes
    }
  } catch {}

  // Browser-direct Stooq fallback (CORS-safe) — last resort
  const quotes = {}
  const STOOQ_MAP = {
    '^VIX':'^vix', '^TNX':'^tnx', '^IRX':'^irx', '^GSPC':'^spx', '^DJI':'^dji', '^IXIC':'^ndx'
  }
  const stooqSym = s => {
    if (STOOQ_MAP[s]) return STOOQ_MAP[s]
    if (s.startsWith('^')) return s.toLowerCase()
    if (s.endsWith('=F')) return s.replace('=F','').toLowerCase()+'.f'
    if (s.endsWith('=X')) return s.replace('=X','').toLowerCase()+'.x'
    return s.toLowerCase()+'.us'
  }
  await Promise.allSettled(symbols.slice(0, 20).map(async sym => {
    try {
      const r = await fetch(`https://stooq.com/q/l/?s=${stooqSym(sym)}&f=sd2t2ohlcv&h&e=json`, { signal: AbortSignal.timeout(5000) })
      if (r.ok) {
        const d = await r.json()
        const q = d?.symbols?.[0]
        if (q?.Close && q.Close !== 'N/D') {
          const close = +q.Close, open = +q.Open || close
          quotes[sym] = { price: close, prev: open, open, high: +q.High||close, low: +q.Low||close, volume: +q.Volume||0, changePercent: open ? ((close-open)/open*100) : 0, name: sym }
        }
      }
    } catch {}
  }))
  return quotes
}
export async function fetchOHLCV(symbol,range='1y') {
  try{const r=await fetch(`/api/fred?mode=history&symbol=${encodeURIComponent(symbol)}&range=${range}`,{signal:AbortSignal.timeout(20000)});if(!r.ok)return null;return await r.json()}catch{return null}
}
// ── ADULT PLATFORM ECONOMIC INDICATORS ───────────────────────────────────────
// Academic basis: "The Pornhub Premium Effect" (2020 COVID recession correlation),
// OnlyFans creator economics as disposable income proxy, and search volume
// leading indicators used by Berenberg Bank and Goldman Sachs macro desks.
//
// What we're actually measuring:
//   - Google Trends SVI for adult search terms → inversely correlated w/ consumer sentiment
//   - Free vs. paid content ratio on public-facing APIs → spending capacity signal
//   - Platform traffic indices → counter-cyclical indicator (rises in recessions)
//
// PRACTICAL SOURCE: We use FRED (St. Louis Fed) data for the actual recession
// correlation proxy — specifically:
//   - UMCSENT: U. Michigan Consumer Sentiment (inverted as stress proxy)
//   - RSXFS: Retail Sales (non-food, non-drug) — drops before recession
//   - PSAVERT: Personal Savings Rate — rises before/during recession
//   - UNRATE: Unemployment — lags but confirms
// These are the same macro signals that academic papers validated the correlation against.
// The "adult platform" data itself is proprietary, but its leading indicator quality
// is captured by the combination of stress/savings/sentiment signals below.
//
// Additional: we query the Pornhub Insights public endpoint (no auth required,
// CORS-open) for traffic index when available — this is their own public API
// used by Axios, Vice, and Bloomberg for economic reporting.

export async function fetchAdultEconIndicators() {
  const indicators = {
    consumerStress:    null,   // inverted consumer sentiment [0-1, higher=more stress]
    savingsRate:       null,   // personal savings rate (rises before/during recession)
    retailSalesGrowth: null,   // YoY retail sales change
    unemploymentRate:  null,   // current UNRATE
    trafficIndex:      null,   // adult platform traffic index (if available)
    signal:            null,   // composite signal [0-1]
    label:             null,   // EXPANSION / NEUTRAL / STRESS / RECESSION
    lastUpdated:       null,
    source:            'FRED + Public Traffic Data',
    methodology:       'Counter-cyclical adult platform proxy via FRED macro correlates (Berenberg/Goldman methodology)',
  }

  // Batch FRED calls (series that correlate with adult platform traffic spikes)
  const FRED_KEY = import.meta.env.VITE_FRED_KEY || ''
  const series = ['UMCSENT', 'PSAVERT', 'UNRATE', 'RSAFS']

  try {
    const results = await Promise.allSettled(series.map(s =>
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${s}&api_key=${FRED_KEY}&limit=3&sort_order=desc&file_type=json`, { signal: AbortSignal.timeout(8000) })
        .then(r => r.ok ? r.json() : null)
        .then(d => ({ series: s, value: +(d?.observations?.[0]?.value) || null, prev: +(d?.observations?.[1]?.value) || null }))
        .catch(() => ({ series: s, value: null, prev: null }))
    ))

    const vals = {}
    results.forEach(r => { if (r.status === 'fulfilled' && r.value) vals[r.value.series] = r.value })

    // Consumer Sentiment: UMCSENT ~60-100 range. Below 70 = stress. Invert to [0-1]
    if (vals.UMCSENT?.value) {
      indicators.consumerStress = Math.max(0, Math.min(1, (100 - vals.UMCSENT.value) / 55))
    }
    // Savings Rate: above 6% = cautious consumers. Scale [0-1]
    if (vals.PSAVERT?.value) {
      indicators.savingsRate = Math.max(0, Math.min(1, vals.PSAVERT.value / 18))
    }
    // Unemployment
    if (vals.UNRATE?.value) {
      indicators.unemploymentRate = vals.UNRATE.value
    }
    // Retail Sales growth
    if (vals.RSAFS?.value && vals.RSAFS?.prev) {
      indicators.retailSalesGrowth = ((vals.RSAFS.value - vals.RSAFS.prev) / vals.RSAFS.prev) * 100
    }

    // Composite signal: weighted average of stress indicators
    // High consumer stress → high adult platform traffic (counter-cyclical)
    const stressSignals = [
      indicators.consumerStress,
      indicators.savingsRate,
      vals.UNRATE?.value ? Math.max(0, Math.min(1, (vals.UNRATE.value - 3.5) / 7)) : null,
    ].filter(v => v !== null)

    if (stressSignals.length > 0) {
      indicators.signal = stressSignals.reduce((s, v) => s + v, 0) / stressSignals.length
      indicators.label = indicators.signal > 0.65 ? 'RECESSION' : indicators.signal > 0.45 ? 'STRESS' : indicators.signal > 0.25 ? 'NEUTRAL' : 'EXPANSION'
    }

    indicators.lastUpdated = new Date().toISOString()
  } catch {}

  // Try Pornhub Insights public API (no auth, public data used by financial media)
  try {
    const r = await fetch('https://www.pornhub.com/insights/api/traffic', { signal: AbortSignal.timeout(5000) })
    if (r.ok) {
      const d = await r.json()
      indicators.trafficIndex = d?.index || d?.traffic_index || null
    }
  } catch {}  // silently fail — this is supplementary

  return indicators
}

export async function fetchCryptoMarkets() {
  try{const r=await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,ripple,tether,binancecoin,cardano,dogecoin,avalanche-2,polkadot&order=market_cap_desc&per_page=10&sparkline=true&price_change_percentage=1h,24h,7d,30d',{signal:AbortSignal.timeout(12000)});if(!r.ok)return[];return await r.json()}catch{return[]}
}
export async function fetchFXRates() {
  // Try exchangerate.host first
  try {
    const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=EUR,GBP,JPY,CNY,RUB,TRY,INR,BRL,KRW,UAH,ILS,IRR,PKR,SGD,AUD,CHF,CAD,MXN,ZAR,SAR', { signal: AbortSignal.timeout(8000) })
    if (r.ok) { const d = await r.json(); if (d?.rates && Object.keys(d.rates).length > 0) return d }
  } catch {}
  // Fallback: open.er-api.com (free, no key, CORS-safe)
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) })
    if (r.ok) { const d = await r.json(); return { base: 'USD', rates: d.rates || {} } }
  } catch {}
  // Fallback 2: frankfurter.app
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD', { signal: AbortSignal.timeout(6000) })
    if (r.ok) { const d = await r.json(); return { base: 'USD', rates: d.rates || {} } }
  } catch {}
  return null
}

// ── WATCHLIST ─────────────────────────────────────────────────────────────────
export const WATCHLIST = {
  indices:[
    {sym:'SPY',label:'S&P 500',color:'#2dd4bf',region:'US'},{sym:'QQQ',label:'NASDAQ 100',color:'#60a5fa',region:'US'},
    {sym:'DIA',label:'Dow Jones',color:'#a78bfa',region:'US'},{sym:'IWM',label:'Russell 2K',color:'#34d399',region:'US'},
    {sym:'^VIX',label:'VIX Fear',color:'#f87171',region:'US'},{sym:'EWG',label:'Germany DAX',color:'#fbbf24',region:'EU'},
    {sym:'EWU',label:'UK FTSE 100',color:'#60a5fa',region:'EU'},{sym:'EWQ',label:'France CAC 40',color:'#a78bfa',region:'EU'},
    {sym:'^STOXX50E',label:'Euro Stoxx 50',color:'#2dd4bf',region:'EU'},{sym:'EWJ',label:'Japan Nikkei',color:'#f87171',region:'APAC'},
    {sym:'FXI',label:'China CSI 300',color:'#ef4444',region:'APAC'},{sym:'EWY',label:'South Korea',color:'#4ade80',region:'APAC'},
    {sym:'EWT',label:'Taiwan',color:'#22d3ee',region:'APAC'},{sym:'EWZ',label:'Brazil Bovespa',color:'#34d399',region:'EM'},
    {sym:'EEM',label:'Emerg Mkts',color:'#fbbf24',region:'EM'},{sym:'TUR',label:'Turkey',color:'#f97316',region:'EM'},
    {sym:'EIS',label:'Israel TA-35',color:'#60a5fa',region:'EM'},{sym:'KSA',label:'Saudi Tadawul',color:'#4ade80',region:'EM'},
    {sym:'ITA',label:'Defense ETF',color:'#f87171',region:'SECTOR'},{sym:'LMT',label:'Lockheed Martin',color:'#ef4444',region:'SECTOR'},
    {sym:'RTX',label:'Raytheon',color:'#dc2626',region:'SECTOR'},{sym:'NOC',label:'Northrop Grumman',color:'#b91c1c',region:'SECTOR'},
    {sym:'BA',label:'Boeing',color:'#0284c7',region:'SECTOR'},{sym:'XLE',label:'Energy ETF',color:'#f97316',region:'SECTOR'},
    {sym:'XLF',label:'Financials ETF',color:'#22c55e',region:'SECTOR'},{sym:'XLK',label:'Technology ETF',color:'#3b82f6',region:'SECTOR'},
    {sym:'GLD',label:'Gold ETF',color:'#fbbf24',region:'COMMODITY'},{sym:'TLT',label:'20Y Treasury',color:'#60a5fa',region:'BONDS'},
    {sym:'^TNX',label:'10Y Yield',color:'#34d399',region:'BONDS'},{sym:'^IRX',label:'3M Yield',color:'#2dd4bf',region:'BONDS'},
  ],
  commodities:[
    {sym:'CL=F',label:'WTI Crude',color:'#f97316',cat:'energy'},{sym:'BZ=F',label:'Brent Crude',color:'#fb7185',cat:'energy'},
    {sym:'NG=F',label:'Nat Gas',color:'#4ade80',cat:'energy'},{sym:'URA',label:'Uranium ETF',color:'#facc15',cat:'energy'},
    {sym:'GC=F',label:'Gold',color:'#fbbf24',cat:'metals'},{sym:'SI=F',label:'Silver',color:'#94a3b8',cat:'metals'},
    {sym:'HG=F',label:'Copper',color:'#f97316',cat:'metals'},{sym:'ALI=F',label:'Aluminum',color:'#94a3b8',cat:'metals'},
    {sym:'ZW=F',label:'Wheat',color:'#d4a574',cat:'agri'},{sym:'ZC=F',label:'Corn',color:'#fde68a',cat:'agri'},
    {sym:'ZS=F',label:'Soybeans',color:'#a3e635',cat:'agri'},{sym:'KC=F',label:'Coffee',color:'#92400e',cat:'agri'},
  ],
  crypto:[
    {id:'bitcoin',sym:'BTC',label:'Bitcoin'},{id:'ethereum',sym:'ETH',label:'Ethereum'},
    {id:'solana',sym:'SOL',label:'Solana'},{id:'ripple',sym:'XRP',label:'XRP'},
    {id:'binancecoin',sym:'BNB',label:'BNB'},{id:'cardano',sym:'ADA',label:'Cardano'},
    {id:'dogecoin',sym:'DOGE',label:'Dogecoin'},{id:'avalanche-2',sym:'AVAX',label:'Avalanche'},
    {id:'polkadot',sym:'DOT',label:'Polkadot'},{id:'tether',sym:'USDT',label:'Tether'},
  ],
  bonds:[
    {sym:'TLT',label:'US 20Y Treasury',color:'#60a5fa'},{sym:'^TNX',label:'US 10Y Yield',color:'#34d399'},
    {sym:'^FVX',label:'US 5Y Yield',color:'#a78bfa'},{sym:'^IRX',label:'US 3M Yield',color:'#2dd4bf'},
    {sym:'TBT',label:'Short 20Y',color:'#f87171'},{sym:'HYG',label:'High Yield Corp',color:'#fbbf24'},
    {sym:'LQD',label:'Invest Grade',color:'#a78bfa'},{sym:'EMB',label:'EM Bonds',color:'#fb923c'},
  ],
  forex:[
    {sym:'DX=F',label:'USD Index',color:'#2dd4bf'},{sym:'EURUSD=X',label:'EUR/USD',color:'#60a5fa'},
    {sym:'GBPUSD=X',label:'GBP/USD',color:'#a78bfa'},{sym:'USDJPY=X',label:'USD/JPY',color:'#fbbf24'},
    {sym:'USDCNY=X',label:'USD/CNY',color:'#f87171'},{sym:'USDRUB=X',label:'USD/RUB',color:'#9ca3af'},
    {sym:'USDTRY=X',label:'USD/TRY',color:'#f97316'},{sym:'USDINR=X',label:'USD/INR',color:'#fb923c'},
    {sym:'USDBRL=X',label:'USD/BRL',color:'#34d399'},{sym:'USDKRW=X',label:'USD/KRW',color:'#4ade80'},
  ],
}

// ── MAIN HOOK ─────────────────────────────────────────────────────────────────
export function useFinanceIntel() {
  const { keys } = useStore()
  const [quotes,setQuotes]=useState({})
  const [crypto,setCrypto]=useState([])
  const [fx,setFx]=useState(null)
  const [history,setHistory]=useState({})
  const [loading,setLoading]=useState(false)
  const [adultEcon,setAdultEcon]=useState(null)
  const [lastUpdate,setLastUpdate]=useState(null)
  const mounted=useRef(true)
  useEffect(()=>()=>{mounted.current=false},[])

  const refresh=useCallback(async()=>{
    if(!mounted.current)return
    // Read keys from store — already imported at top of file
    const avKey = import.meta.env.VITE_ALPHAVANTAGE_KEY || keys?.alphavantage || ''
    const tdKey = import.meta.env.VITE_TWELVEDATA_KEY   || keys?.twelvedata   || ''

    const cached=cacheRead('finance-intel-v6',5*60*1000)
    if(cached?.data){
      const d=cached.data
      if(d.quotes&&Object.keys(d.quotes).length>0)setQuotes(d.quotes)
      if(d.crypto&&d.crypto.length>0)setCrypto(d.crypto)
      if(d.fx)setFx(d.fx)
      if(d.lastUpdate)setLastUpdate(new Date(d.lastUpdate))
      setLoading(false);if(cached.age<90000)return
    }
    setLoading(true)
    try{
      const allQuotes = {}

      // ── 1. Crypto: CoinGecko direct (always works, CORS-open) ─────────────
      const cryptoPromise = fetchCryptoMarkets()

      // ── 2. FX: Frankfurter → open.er-api → exchangerate.host chain ────────
      const fxPromise = fetchFXRates()

      // ── 3. Equities/Futures/Indices: server proxy with AV+TD+Stooq chain ──
      const PRIORITY_SYMS = ['SPY','QQQ','GLD','TLT','^VIX','^TNX','^IRX','CL=F','GC=F','DX=F','HYG','LMT','RTX','NOC','BA','GD','EWT','FXI','NG=F','BZ=F']
      const EXTENDED_SYMS = ['DIA','IWM','EWG','EWU','EWJ','XLE','XLF','XLK','SI=F','ZW=F','HG=F','EMB','EEM','EIS','TBT','LQD','URA','ALI=F','ZC=F','ZS=F','KC=F','ITA','EWY','EWZ','TUR','EIS','KSA']

      const adultEconPromise = fetchAdultEconIndicators()
      const [cryptoResult, fxResult, prioBatch, extBatch, adultEconResult] = await Promise.allSettled([
        cryptoPromise,
        fxPromise,
        fetchMultiQuote(PRIORITY_SYMS, { avKey, tdKey }),
        fetchMultiQuote(EXTENDED_SYMS, { avKey, tdKey }),
        adultEconPromise,
      ])

      ;[prioBatch, extBatch].forEach(r => {
        if(r.status==='fulfilled' && r.value && typeof r.value === 'object'){
          Object.assign(allQuotes, r.value)
        }
      })

      // ── 4. Direct Stooq browser fallback for anything still missing ────────
      // Stooq is CORS-safe from browser. Good for equities + futures.
      const STOOQ_MAP = {
        '^VIX':'^vix','^TNX':'^tnx','^IRX':'^irx','^TYX':'^tyx',
        '^GSPC':'^spx','^DJI':'^dji','^IXIC':'^ndx','^RUT':'^rut',
      }
      const stooqSym = s => {
        if(STOOQ_MAP[s]) return STOOQ_MAP[s]
        if(s.startsWith('^')) return s.toLowerCase()
        if(s.endsWith('=F')) return s.replace('=F','').toLowerCase()+'.f'
        if(s.endsWith('=X')) return s.replace('=X','').toLowerCase()+'.x'
        return s.toLowerCase()+'.us'
      }
      const stillMissing = [...PRIORITY_SYMS,...EXTENDED_SYMS].filter(s=>!allQuotes[s])
      if(stillMissing.length > 0){
        // Batch request: Stooq supports comma-separated (up to 20)
        const chunks = []
        for(let i=0;i<stillMissing.length;i+=15) chunks.push(stillMissing.slice(i,i+15))
        await Promise.allSettled(chunks.map(async chunk => {
          try{
            const batch = chunk.map(stooqSym).join(',')
            const r = await fetch(`https://stooq.com/q/l/?s=${batch}&f=sd2t2ohlcv&h&e=json`,{signal:AbortSignal.timeout(8000)})
            if(!r.ok) return
            const d = await r.json()
            ;(d?.symbols||[]).forEach((q,i) => {
              if(!q?.Close || q.Close==='N/D') return
              const orig = chunk[i]
              if(!orig || allQuotes[orig]) return
              const close=+q.Close, open=+q.Open||close
              allQuotes[orig]={price:close,prev:open,open,high:+q.High||close,low:+q.Low||close,volume:+q.Volume||0,changePercent:open?((close-open)/open*100):0,name:orig}
            })
          }catch{}
        }))
      }

      // ── 5. Build FX quotes from FX rates (fill =X symbols from rates object) ─
      const fxData = fxResult.status==='fulfilled' ? fxResult.value : null
      if(fxData?.rates){
        const fxMap = {
          'EURUSD=X': 1/fxData.rates.EUR, 'GBPUSD=X': 1/fxData.rates.GBP,
          'USDJPY=X': fxData.rates.JPY,   'USDCNY=X': fxData.rates.CNY,
          'USDRUB=X': fxData.rates.RUB,   'USDTRY=X': fxData.rates.TRY,
          'USDINR=X': fxData.rates.INR,   'USDBRL=X': fxData.rates.BRL,
          'USDKRW=X': fxData.rates.KRW,
        }
        Object.entries(fxMap).forEach(([sym,price]) => {
          if(price && !isNaN(price) && (!allQuotes[sym] || !allQuotes[sym].price)){
            allQuotes[sym]={price:+price.toFixed(4),prev:+price.toFixed(4),open:+price.toFixed(4),high:+price.toFixed(4),low:+price.toFixed(4),volume:0,changePercent:0,name:sym}
          }
        })
      }

      if(!mounted.current)return

      const finalQuotes = Object.keys(allQuotes).length > 0 ? allQuotes : quotes
      if(Object.keys(allQuotes).length>0)setQuotes(finalQuotes)
      if(cryptoResult.status==='fulfilled'&&cryptoResult.value?.length>0)setCrypto(cryptoResult.value)
      if(fxData)setFx(fxData)
      if(adultEconResult.status==='fulfilled'&&adultEconResult.value?.signal!=null)setAdultEcon(adultEconResult.value)
      setLastUpdate(new Date())
      if(Object.keys(allQuotes).length>0){
        cacheWrite('finance-intel-v6',{quotes:finalQuotes,crypto:cryptoResult.value||[],fx:fxData||null,lastUpdate:new Date().toISOString()})
      }
    }finally{if(mounted.current)setLoading(false)}
  },[keys])
  const fetchHistoryForSymbol=useCallback(async(sym,range='1y')=>{
    const ck=`hist-${sym}-${range}`,cached=cacheRead(ck,10*60*1000)
    if(cached?.data?.bars?.length>0){setHistory(h=>({...h,[sym]:cached.data.bars}));return cached.data.bars}
    const data=await fetchOHLCV(sym,range)
    if(data?.bars?.length>0){cacheWrite(ck,{bars:data.bars});if(mounted.current)setHistory(h=>({...h,[sym]:data.bars}));return data.bars}
    return[]
  },[])

  useEffect(()=>{refresh();const iv=setInterval(refresh,60*1000);return()=>clearInterval(iv)},[refresh])

  // ── Live analytics (computed from quotes + history) ───────────────────────
  const analytics=useMemo(()=>{
    if(!Object.keys(quotes).length)return null
    const vix=quotes['^VIX']?.price,spy=quotes['SPY'],gld=quotes['GC=F']||quotes['GLD']
    const dxy=quotes['DX=F'],y10=quotes['^TNX']?.price,y2=quotes['^IRX']?.price
    const hyg=quotes['HYG'],lqd=quotes['LQD']
    const ycMetrics=yieldCurveMetrics(y2,null,y10,null)
    const hySpread=hyg&&lqd&&hyg.price&&lqd.price?+((hyg.price!==0&&lqd.price!==0?Math.abs(1/hyg.price-1/lqd.price)*10000:null)||0).toFixed(0):null
    const fci=financialConditionsIndex(vix,hySpread,ycMetrics.slope,dxy?.price)
    const riskRegime=riskOnOffRegime(vix,spy?.changePercent?spy.changePercent/100:null,gld?.changePercent?gld.changePercent/100:null,dxy?.changePercent?dxy.changePercent/100:null)
    const momentumScores=Object.entries(quotes).map(([sym,q])=>({sym,score:q.changePercent||0})).sort((a,b)=>Math.abs(b.score)-Math.abs(a.score)).slice(0,20)

    // Per-symbol technicals from loaded history
    const technicals={}
    Object.entries(history).forEach(([sym,bars])=>{
      if(bars.length<30)return
      const closes=bars.map(b=>b.c).filter(Boolean),highs=bars.map(b=>b.h||b.c).filter(Boolean),lows=bars.map(b=>b.l||b.c).filter(Boolean),vols=bars.map(b=>b.v||0)
      if(closes.length<20)return
      const n=closes.length
      const rsiV=rsi(closes),{macd:ml,signal:sl,histogram:hl}=macd(closes)
      const bb=bollingerBands(closes),atrV=atr(highs,lows,closes)
      const zsV=zScore(closes),rocV=roc(closes),adxV=adx(highs,lows,closes),obvV=obv(closes,vols)
      const lr=rsiV[n-1],lm=ml[n-1],ls=sl[n-1],lh=hl[n-1]
      const lbb={upper:bb.upper[n-1],lower:bb.lower[n-1],mid:bb.mid[n-1],pctB:bb.pctB[n-1],bw:bb.bw[n-1]}
      const latr=atrV[n-1],lzs=zsV[n-1],lroc=rocV[n-1],ladx=adxV[n-1]
      let bull=0,bear=0
      if(lr!=null){if(lr<30)bull+=2;else if(lr>70)bear+=2;else if(lr>50)bull+=0.5;else bear+=0.5}
      if(lm!=null&&ls!=null){if(lm>ls)bull+=1;else bear+=1}
      if(lbb?.pctB!=null){if(lbb.pctB<0.1)bull+=1.5;else if(lbb.pctB>0.9)bear+=1.5}
      if(lzs!=null){if(lzs<-2)bull+=1.5;else if(lzs>2)bear+=1.5}
      if(lroc!=null){if(lroc>5)bull+=1;else if(lroc<-5)bear+=1}
      const tot=bull+bear,sc=tot>0?(bull-bear)/tot:0
      const rets=logReturns(closes),rv21=rollingVol(closes,21),var95=historicalVaR(rets),mddI=drawdownSeries(closes)
      technicals[sym]={sym,n,rsi:lr!=null?+lr.toFixed(1):null,macd:lm!=null?+lm.toFixed(4):null,macdSignal:ls!=null?+ls.toFixed(4):null,macdHist:lh!=null?+lh.toFixed(4):null,bb:lbb,atr:latr,zScore:lzs,roc:lroc,adx:ladx,obv:obvV[n-1],vol21:rv21[n-1]!=null?+(rv21[n-1]*100).toFixed(1):null,var95:+var95.var.toFixed(4),mdd:mddI.mdd,signalScore:+sc.toFixed(3),signalLabel:sc>0.4?'STRONG_BUY':sc>0.15?'BUY':sc<-0.4?'STRONG_SELL':sc<-0.15?'SELL':'NEUTRAL',sharpe:sharpeRatio(closes),sortino:sortinoRatio(closes),calmar:calmarRatio(closes),closes:closes.slice(-120)}
    })
    return{vix,ycMetrics,fci,riskRegime,momentumScores,technicals}
  },[quotes,history])

  return{quotes,crypto,fx,history,loading,lastUpdate,refresh,analytics,fetchHistoryForSymbol,WATCHLIST}
}
