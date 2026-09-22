/**
 * EconomicResearchTerminal.jsx
 * Actionable Economic Research, Global Chokepoints, Cross-Domain Correlations & Alpha Terminal
 * Fully aligned with Decision-Relevant Pragmatism and Global Strategic Directive
 */

import React, { useState, useMemo } from 'react'
import {
  MARITIME_CHOKEPOINTS,
  INDUSTRIAL_CYBER_IMPACT,
  MINERAL_SUPPLY_CHOKEPOINTS,
  AVIATION_ROUTE_ECONOMICS,
  ECONOMETRIC_MODELS,
  CROSS_ASSET_CORRELATION_MATRIX,
  ALPHA_TRADE_PLAYBOOKS,
  MACRO_STRESS_SCENARIOS
} from '../../data/economicCorrelations'
import {
  Anchor,
  TrendingUp,
  Target,
  Cpu,
  FileText,
  AlertTriangle,
  ArrowRight,
  Shield,
  Zap,
  Globe,
  DollarSign,
  Copy,
  Check,
  Download,
  Layers,
  ChevronRight,
  Activity,
  Sliders,
  Sparkles
} from 'lucide-react'

const mono = { fontFamily: 'JetBrains Mono', fontSize: 11 }
const monoSm = { fontFamily: 'JetBrains Mono', fontSize: 10 }
const monoXs = { fontFamily: 'JetBrains Mono', fontSize: 9 }

export default function EconomicResearchTerminal({ activeSubTab: externalSubTab, onSelectChokepoint }) {
  const [subTab, setSubTab] = useState(externalSubTab || 'chokepoints')
  const [selectedChokeId, setSelectedChokeId] = useState('bab_el_mandeb')
  const [selectedScenarioId, setSelectedScenarioId] = useState('hormuz_blockade')
  const [stressDays, setStressDays] = useState(30)
  const [stressSeverity, setStressSeverity] = useState(80)
  const [copiedMemo, setCopiedMemo] = useState(false)
  const [activeEpistemologyTab, setActiveEpistemologyTab] = useState('all')

  // Sync external tab if passed
  React.useEffect(() => {
    if (externalSubTab) setSubTab(externalSubTab)
  }, [externalSubTab])

  const selectedChokepoint = useMemo(() => {
    return MARITIME_CHOKEPOINTS.find(c => c.id === selectedChokeId) || MARITIME_CHOKEPOINTS[0]
  }, [selectedChokeId])

  const selectedScenario = useMemo(() => {
    return MACRO_STRESS_SCENARIOS.find(s => s.id === selectedScenarioId) || MACRO_STRESS_SCENARIOS[0]
  }, [selectedScenarioId])

  // Stress test calculated deltas
  const stressResults = useMemo(() => {
    const formulas = selectedScenario.impactFormulas
    const results = {}
    if (formulas.deltaBrentBbl) results.deltaBrent = formulas.deltaBrentBbl(stressDays, stressSeverity)
    if (formulas.deltaGasMMBtu) results.deltaGas = formulas.deltaGasMMBtu(stressDays, stressSeverity)
    if (formulas.deltaGlobalCPI) results.deltaCPI = formulas.deltaGlobalCPI(stressDays, stressSeverity)
    if (formulas.tankerInsuranceSurgeBps) results.tankerInsurance = formulas.tankerInsuranceSurgeBps(stressDays, stressSeverity)
    if (formulas.deltaTechEquitiesPct) results.deltaTech = formulas.deltaTechEquitiesPct(stressDays, stressSeverity)
    if (formulas.deltaSemiconductorLeadWeeks) results.semiconductorLeadWeeks = formulas.deltaSemiconductorLeadWeeks(stressDays, stressSeverity)
    if (formulas.deltaContainerFreightRatePct) results.deltaFreight = formulas.deltaContainerFreightRatePct(stressDays, stressSeverity)
    if (formulas.deltaGlobalGDPBillionUSD) results.deltaGDP = formulas.deltaGlobalGDPBillionUSD(stressDays, stressSeverity)
    if (formulas.deltaCopperPricePct) results.deltaCopper = formulas.deltaCopperPricePct(stressDays, stressSeverity)
    if (formulas.lostMineProductionTonnes) results.lostMineProduction = formulas.lostMineProductionTonnes(stressDays, stressSeverity)
    if (formulas.deltaTransitDelayDays) results.transitDelay = formulas.deltaTransitDelayDays(stressDays, stressSeverity)
    if (formulas.centralBankRateAction) results.centralBank = formulas.centralBankRateAction
    return results
  }, [selectedScenario, stressDays, stressSeverity])

  // Generate Institutional Investment Memo
  const investmentMemo = useMemo(() => {
    const timestamp = new Date().toISOString()
    return `# INSTITUTIONAL MACRO & GEOPOLITICAL ECONOMIC INTELLIGENCE MEMO
**Classification**: STRICTLY CONFIDENTIAL // MACRO STRATEGY & RISK DESK
**Generated**: ${timestamp}
**Platform**: NEXUS Actionable Economic Research Engine

---

## 1. EXECUTIVE SUMMARY: GLOBAL CHOKEPOINT EXPOSURE
${MARITIME_CHOKEPOINTS.map(c => `### ${c.name} [Threat Level: ${c.threatLevel} | Score: ${c.threatScore}/100]
- **Trade Volume**: ${c.globalTradeShare} | ${c.oilFlow}
- **Current Rerouted Traffic**: ${c.currentReroutePct}% | Cape Delay: +${c.capeRerouteDays} Days | Bunker Burn: +${c.bunkerBurnIncreasePct}%
- **Key Affected Assets**: ${c.affectedCommodities.map(a => `${a.name} (${a.sensitivity})`).join(', ')}
- **Actionable Directive**: ${c.actionableDirective}
- **Quantitative Decision Gate**: ${c.decisionGate}
`).join('\n')}

---

## 2. ACTIVE ALPHA PLAYBOOKS & EVIDENCE LEDGER (DECISION-RELEVANT PRAGMATISM)
${ALPHA_TRADE_PLAYBOOKS.map(p => `### ${p.title} (Horizon: ${p.targetHorizon} | Sharpe: ${p.expectedSharpeRatio} | Conviction: ${p.conviction})
- **[FACT]**: ${p.epistemology.fact}
- **[DERIVED]**: ${p.epistemology.derived}
- **[ASSUMPTION]**: ${p.epistemology.assumption}
- **[RECOMMENDATION]**: ${p.epistemology.recommendation}
- **Long Basket**: ${p.longLeg.join(', ')}
- **Short Basket**: ${p.shortLeg.join(', ')}
- **Operational Supply-Chain Hedge**: ${p.operationalHedge}
- **Downside Stress-Test**: ${p.downsideStressTest}
`).join('\n')}

---

## 3. MACRO SCENARIO STRESS-TEST: ${selectedScenario.name.toUpperCase()}
- **Parameters**: Duration = ${stressDays} Days | Severity = ${stressSeverity}%
${Object.entries(stressResults).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}
- **Recommended Portfolio Hedges**:
${selectedScenario.recommendedHedges.map(h => `  * ${h}`).join('\n')}

---
*Report anchored in Econometric Demand Function Q_d = f(P_x, P_y, Y, T, A, M, ε) and Evidence Ledger Protocol.*
`
  }, [selectedScenario, stressDays, stressSeverity, stressResults])

  const copyMemoToClipboard = () => {
    navigator.clipboard.writeText(investmentMemo)
    setCopiedMemo(true)
    setTimeout(() => setCopiedMemo(false), 2500)
  }

  const downloadMemo = () => {
    const blob = new Blob([investmentMemo], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `NEXUS-Macro-Economic-Briefing-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--void)' }}>
      {/* Sub-navigation bar */}
      <div style={{ flexShrink: 0, padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(15,23,42,0.6)' }}>
        <span style={{ ...mono, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Sparkles size={12} /> MACRO & ALPHA
        </span>
        <div style={{ height: 14, width: 1, background: 'var(--border)', margin: '0 4px' }} />
        
        <button
          onClick={() => setSubTab('chokepoints')}
          style={{
            ...monoSm,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 3,
            border: 'none',
            cursor: 'pointer',
            background: subTab === 'chokepoints' ? 'rgba(45,212,191,0.15)' : 'transparent',
            color: subTab === 'chokepoints' ? 'var(--accent)' : 'var(--t3)',
            borderBottom: subTab === 'chokepoints' ? '2px solid var(--accent)' : '2px solid transparent'
          }}
        >
          <Anchor size={11} /> 1. Chokepoints & Supply Chains
        </button>

        <button
          onClick={() => setSubTab('correlations')}
          style={{
            ...monoSm,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 3,
            border: 'none',
            cursor: 'pointer',
            background: subTab === 'correlations' ? 'rgba(45,212,191,0.15)' : 'transparent',
            color: subTab === 'correlations' ? 'var(--accent)' : 'var(--t3)',
            borderBottom: subTab === 'correlations' ? '2px solid var(--accent)' : '2px solid transparent'
          }}
        >
          <TrendingUp size={11} /> 2. Cross-Domain Correlations
        </button>

        <button
          onClick={() => setSubTab('alpha')}
          style={{
            ...monoSm,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 3,
            border: 'none',
            cursor: 'pointer',
            background: subTab === 'alpha' ? 'rgba(45,212,191,0.15)' : 'transparent',
            color: subTab === 'alpha' ? 'var(--accent)' : 'var(--t3)',
            borderBottom: subTab === 'alpha' ? '2px solid var(--accent)' : '2px solid transparent'
          }}
        >
          <Target size={11} /> 3. Alpha Desk & Trade Ops
        </button>

        <button
          onClick={() => setSubTab('stress')}
          style={{
            ...monoSm,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 3,
            border: 'none',
            cursor: 'pointer',
            background: subTab === 'stress' ? 'rgba(45,212,191,0.15)' : 'transparent',
            color: subTab === 'stress' ? 'var(--accent)' : 'var(--t3)',
            borderBottom: subTab === 'stress' ? '2px solid var(--accent)' : '2px solid transparent'
          }}
        >
          <Cpu size={11} /> 4. Scenario Stress-Tester
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={() => setSubTab('export')}
            style={{
              ...monoXs,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 3,
              border: '1px solid var(--border)',
              background: subTab === 'export' ? 'var(--accent)' : 'transparent',
              color: subTab === 'export' ? '#000' : 'var(--t2)',
              cursor: 'pointer'
            }}
          >
            <FileText size={10} /> Export Memo
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflow: 'hidden' }}>

        {/* ── 1. CHOKEPOINTS & SUPPLY CHAINS ──────────────────────────────── */}
        {subTab === 'chokepoints' && (
          <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            {/* Left: Chokepoint Selector List */}
            <div style={{ width: 340, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--border)', padding: '10px' }}>
              <div style={{ ...monoXs, color: 'var(--t4)', marginBottom: 8, letterSpacing: '0.08em' }}>
                7 GLOBAL MARITIME ARTERIES ({MARITIME_CHOKEPOINTS.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MARITIME_CHOKEPOINTS.map(c => {
                  const isSel = c.id === selectedChokeId
                  const badgeClr = c.threatLevel === 'CRITICAL' ? '#ef4444' : c.threatLevel === 'HIGH' ? '#f97316' : c.threatLevel === 'ELEVATED' ? '#eab308' : '#3b82f6'
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedChokeId(c.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 4,
                        border: `1px solid ${isSel ? 'var(--accent)' : 'rgba(255,255,255,0.06)'}`,
                        background: isSel ? 'rgba(45,212,191,0.08)' : 'rgba(255,255,255,0.02)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ ...monoSm, fontWeight: 600, color: isSel ? 'var(--accent)' : 'var(--t1)' }}>
                          {c.name}
                        </span>
                        <span style={{ ...monoXs, padding: '1px 5px', borderRadius: 2, background: `${badgeClr}20`, color: badgeClr, fontWeight: 700 }}>
                          {c.threatLevel} {c.threatScore}
                        </span>
                      </div>
                      <div style={{ ...monoXs, color: 'var(--t3)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{c.region}</span>
                        <span style={{ color: '#f97316' }}>{c.currentReroutePct}% Rerouted</span>
                      </div>
                      <div style={{ ...monoXs, color: 'var(--t4)', marginTop: 4 }}>
                        {c.oilFlow !== 'Low (restricted under Montreux Convention)' ? `Oil: ${c.oilFlow}` : c.globalTradeShare}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Extra Industrial / Mineral Highlights */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ ...monoXs, color: 'var(--t4)', marginBottom: 6, letterSpacing: '0.08em' }}>
                  CRITICAL INDUSTRIAL OT PORTS
                </div>
                {INDUSTRIAL_CYBER_IMPACT.activeExposedPorts.map(p => (
                  <div key={p.port} style={{ padding: '4px 6px', marginBottom: 4, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ ...monoXs, color: '#fca5a5' }}>Port {p.port} ({p.protocol})</span>
                    <span style={{ ...monoXs, color: 'var(--t3)' }}>${(p.dailyOutageCostUSD / 1e6).toFixed(1)}M/day</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Selected Chokepoint Deep Dossier */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h2 style={{ ...mono, fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                      {selectedChokepoint.name}
                    </h2>
                    <span style={{ ...monoSm, padding: '2px 8px', borderRadius: 3, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600 }}>
                      THREAT INDEX: {selectedChokepoint.threatScore}/100
                    </span>
                  </div>
                  <div style={{ ...monoSm, color: 'var(--t3)', marginTop: 4 }}>
                    {selectedChokepoint.region} · Coordinates: {selectedChokepoint.coordinates.lat}°N, {selectedChokepoint.coordinates.lng}°E
                  </div>
                </div>

                {onSelectChokepoint && (
                  <button
                    onClick={() => onSelectChokepoint(selectedChokepoint)}
                    style={{ ...monoSm, padding: '5px 12px', background: 'rgba(45,212,191,0.15)', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Globe size={11} /> View on 3D Globe
                  </button>
                )}
              </div>

              {/* Chokepoint Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 10px' }}>
                  <div style={{ ...monoXs, color: 'var(--t4)' }}>GLOBAL TRADE VALUE</div>
                  <div style={{ ...monoSm, fontWeight: 600, color: 'var(--t1)', marginTop: 2 }}>{selectedChokepoint.globalTradeShare}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 10px' }}>
                  <div style={{ ...monoXs, color: 'var(--t4)' }}>CONTAINER VOLUME</div>
                  <div style={{ ...monoSm, fontWeight: 600, color: 'var(--t1)', marginTop: 2 }}>{selectedChokepoint.containerShare}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 10px' }}>
                  <div style={{ ...monoXs, color: 'var(--t4)' }}>PETROLEUM THROUGHPUT</div>
                  <div style={{ ...monoSm, fontWeight: 600, color: '#f59e0b', marginTop: 2 }}>{selectedChokepoint.oilFlow}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 10px' }}>
                  <div style={{ ...monoXs, color: 'var(--t4)' }}>REROUTE VOYAGE LAG</div>
                  <div style={{ ...monoSm, fontWeight: 600, color: '#ef4444', marginTop: 2 }}>
                    {selectedChokepoint.capeRerouteDays > 0 ? `+${selectedChokepoint.capeRerouteDays} Days (${selectedChokepoint.capeExtraDistanceNm} nm)` : 'Zero maritime bypass'}
                  </div>
                </div>
              </div>

              {/* Active Threats */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ ...monoXs, color: 'var(--t4)', marginBottom: 6, letterSpacing: '0.08em' }}>PRIMARY DISRUPTION VECTORS</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selectedChokepoint.primaryThreats.map((t, idx) => (
                    <span key={idx} style={{ ...monoXs, padding: '3px 8px', borderRadius: 3, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                      ⚠ {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Affected Commodities Table */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ ...monoXs, color: 'var(--t4)', marginBottom: 6, letterSpacing: '0.08em' }}>AFFECTED COMMODITIES & BENCHMARKS</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', ...monoSm }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--t3)' }}>
                        <th style={{ padding: '6px 10px' }}>TICKER</th>
                        <th style={{ padding: '6px 10px' }}>COMMODITY / BENCHMARK</th>
                        <th style={{ padding: '6px 10px' }}>DIRECTION</th>
                        <th style={{ padding: '6px 10px' }}>SENSITIVITY / RISK PREMIUM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedChokepoint.affectedCommodities.map(c => (
                        <tr key={c.sym} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '6px 10px', color: 'var(--accent)', fontWeight: 600 }}>{c.sym}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--t1)' }}>{c.name}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ color: c.direction === 'UP' ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                              {c.direction === 'UP' ? '▲ BULLISH' : '▼ BEARISH'}
                            </span>
                          </td>
                          <td style={{ padding: '6px 10px', color: 'var(--t2)' }}>{c.sensitivity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Exposed Equities & Theses */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ ...monoXs, color: 'var(--t4)', marginBottom: 6, letterSpacing: '0.08em' }}>EXPOSED CORPORATE EQUITIES & VALUATION THESES</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {selectedChokepoint.exposedTickers.map(tk => (
                    <div key={tk.sym} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ ...monoSm, fontWeight: 700, color: 'var(--accent)' }}>{tk.sym}</span>
                        <span style={{ ...monoXs, color: 'var(--t3)' }}>{tk.role}</span>
                      </div>
                      <div style={{ ...monoSm, color: 'var(--t1)', fontWeight: 500, marginBottom: 4 }}>{tk.name}</div>
                      <div style={{ ...monoXs, color: 'var(--t3)', lineHeight: 1.4 }}>{tk.thesis}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actionable Directives & Decision Gates (Pillars 1 & 4) */}
              <div style={{ background: 'rgba(45,212,191,0.04)', border: '1px solid rgba(45,212,191,0.3)', borderRadius: 4, padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Shield size={13} color="var(--accent)" />
                  <span style={{ ...monoSm, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em' }}>
                    ACTIONABLE STRATEGIC DIRECTIVE
                  </span>
                </div>
                <div style={{ ...monoSm, color: 'var(--t1)', lineHeight: 1.5, marginBottom: 8 }}>
                  {selectedChokepoint.actionableDirective}
                </div>
                <div style={{ ...monoXs, color: '#f97316', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>🛑 QUANTITATIVE KILL GATE:</span> {selectedChokepoint.decisionGate}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 2. CROSS-DOMAIN CORRELATIONS & ELASTICITIES ─────────────────── */}
        {subTab === 'correlations' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '16px' }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ ...mono, fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                CROSS-DOMAIN EMPIRICAL CORRELATION MATRIX & TRANSMISSION ENGINE
              </h2>
              <div style={{ ...monoSm, color: 'var(--t3)', marginTop: 4 }}>
                Mathematically maps physical/cyber OSINT signal densities to asset price returns, volatility, and freight rates.
              </div>
            </div>

            {/* Econometric Formula Highlights */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px' }}>
                <div style={{ ...monoXs, color: 'var(--accent)', fontWeight: 600 }}>FREIGHT-TO-BUNKER ELASTICITY</div>
                <div style={{ ...monoSm, color: 'var(--t1)', marginTop: 4, fontStyle: 'italic' }}>ε_freight, fuel = ∂ ln(Freight) / ∂ ln(Fuel) = 0.38</div>
                <div style={{ ...monoXs, color: 'var(--t3)', marginTop: 4 }}>10% bunker fuel spike lifts long-haul contract rates by 3.8%.</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px' }}>
                <div style={{ ...monoXs, color: 'var(--accent)', fontWeight: 600 }}>CHOKEPOINT TON-MILE MULTIPLIER</div>
                <div style={{ ...monoSm, color: 'var(--t1)', marginTop: 4, fontStyle: 'italic' }}>Spot_Cape = Spot_Base × (1 + ΔDays/Days_Base × κ)</div>
                <div style={{ ...monoXs, color: 'var(--t3)', marginTop: 4 }}>Cape diversion absorbs 11.2% of global containership capacity.</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px' }}>
                <div style={{ ...monoXs, color: 'var(--accent)', fontWeight: 600 }}>GEOPOLITICAL CRUDE RISK PREMIUM</div>
                <div style={{ ...monoSm, color: 'var(--t1)', marginTop: 4, fontStyle: 'italic' }}>P_Brent = P_Base + Σ ω_i × Threat_i × (OilFlow_i / Supply)</div>
                <div style={{ ...monoXs, color: 'var(--t3)', marginTop: 4 }}>Weighted risk markup directly calculated from Bab el-Mandeb & Hormuz.</div>
              </div>
            </div>

            {/* Correlation Heatmap Grid */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 4, overflowX: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', ...monoSm, textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--t4)' }}>OSINT / ASSET</th>
                    {CROSS_ASSET_CORRELATION_MATRIX.variables.map((v, i) => (
                      <th key={i} style={{ padding: '6px 4px', fontSize: 9, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                        {v.split(' ')[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CROSS_ASSET_CORRELATION_MATRIX.variables.map((rowVar, rIdx) => (
                    <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>
                        {rowVar}
                      </td>
                      {CROSS_ASSET_CORRELATION_MATRIX.matrix[rIdx].map((val, cIdx) => {
                        const isDiag = rIdx === cIdx
                        const isPos = val > 0
                        const alpha = Math.abs(val)
                        const bgClr = isDiag
                          ? 'rgba(255,255,255,0.05)'
                          : isPos
                          ? `rgba(34,197,94,${alpha * 0.35})`
                          : `rgba(239,68,68,${alpha * 0.35})`
                        const textClr = isDiag ? 'var(--t4)' : isPos ? '#4ade80' : '#f87171'
                        return (
                          <td
                            key={cIdx}
                            style={{
                              padding: '5px 4px',
                              background: bgClr,
                              color: textClr,
                              fontWeight: Math.abs(val) > 0.5 ? 700 : 400,
                              fontSize: 9
                            }}
                          >
                            {val.toFixed(2)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mineral & Aviation Disruption Models */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '12px', background: 'rgba(255,255,255,0.01)' }}>
                <div style={{ ...monoSm, fontWeight: 700, color: 'var(--t1)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={12} color="#f59e0b" /> EARTH & CRITICAL MINERAL CHOKEPOINTS
                </div>
                {MINERAL_SUPPLY_CHOKEPOINTS.map((m, idx) => (
                  <div key={idx} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ ...monoSm, fontWeight: 600, color: 'var(--accent)' }}>{m.mineral}</span>
                      <span style={{ ...monoXs, color: '#f59e0b' }}>{m.globalProductionSharePct}% Global Share</span>
                    </div>
                    <div style={{ ...monoXs, color: 'var(--t3)', marginTop: 2 }}>{m.zone}</div>
                    <div style={{ ...monoXs, color: 'var(--t2)', marginTop: 4 }}><strong>Trade:</strong> {m.immediateTradePlay}</div>
                  </div>
                ))}
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '12px', background: 'rgba(255,255,255,0.01)' }}>
                <div style={{ ...monoSm, fontWeight: 700, color: 'var(--t1)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Globe size={12} color="#60a5fa" /> AVIATION AIRSPACE & ROUTE DETOUR DRAG
                </div>
                {AVIATION_ROUTE_ECONOMICS.conflictCorridors.map((ac, idx) => (
                  <div key={idx} style={{ marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ ...monoSm, fontWeight: 600, color: 'var(--t1)' }}>{ac.corridor}</div>
                    <div style={{ ...monoXs, color: 'var(--t3)', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                      <span>{ac.affectedFlightsDay} flights/day</span>
                      <span style={{ color: '#ef4444' }}>+{ac.detourHours} hrs · +{ac.extraFuelTonsPerFlight}T fuel (+${ac.extraCostPerFlightUSD.toLocaleString()}/flight)</span>
                    </div>
                  </div>
                ))}
                <div style={{ ...monoXs, color: 'var(--accent)', marginTop: 8, fontStyle: 'italic' }}>
                  Trade: {AVIATION_ROUTE_ECONOMICS.tradeRecommendation}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 3. ALPHA DESK & BUSINESS OPPORTUNITIES ────────────────────────── */}
        {subTab === 'alpha' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ ...mono, fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                  THE ALPHA DESK: ACTIONABLE TRADE BASKETS & BUSINESS OPPORTUNITIES
                </h2>
                <div style={{ ...monoSm, color: 'var(--t3)', marginTop: 4 }}>
                  Institutional playbooks enforcing the <strong>Evidence Ledger Protocol</strong> (Fact | Derived | Assumption | Recommendation).
                </div>
              </div>

              {/* Epistemology Filter */}
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', padding: 3, borderRadius: 4, border: '1px solid var(--border)' }}>
                {['all', 'fact', 'derived', 'assumption', 'recommendation'].map(tabId => (
                  <button
                    key={tabId}
                    onClick={() => setActiveEpistemologyTab(tabId)}
                    style={{
                      ...monoXs,
                      padding: '3px 8px',
                      borderRadius: 2,
                      border: 'none',
                      cursor: 'pointer',
                      background: activeEpistemologyTab === tabId ? 'var(--accent)' : 'transparent',
                      color: activeEpistemologyTab === tabId ? '#000' : 'var(--t3)',
                      fontWeight: activeEpistemologyTab === tabId ? 700 : 400
                    }}
                  >
                    {tabId.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Playbooks Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {ALPHA_TRADE_PLAYBOOKS.map(p => {
                const convClr = p.conviction === 'VERY HIGH' ? '#22c55e' : p.conviction === 'HIGH' ? '#4ade80' : '#f59e0b'
                return (
                  <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '14px', background: 'rgba(255,255,255,0.015)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{p.title}</span>
                          <span style={{ ...monoXs, padding: '2px 6px', borderRadius: 2, background: `${convClr}20`, color: convClr, fontWeight: 700 }}>
                            {p.conviction} CONVICTION
                          </span>
                        </div>
                        <div style={{ ...monoXs, color: 'var(--t4)', marginTop: 3 }}>
                          Target Horizon: {p.targetHorizon} · Expected Sharpe Ratio: {p.expectedSharpeRatio}
                        </div>
                      </div>
                    </div>

                    {/* Evidence Ledger Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 4, border: '1px solid rgba(255,255,255,0.04)' }}>
                      {(activeEpistemologyTab === 'all' || activeEpistemologyTab === 'fact') && (
                        <div style={{ ...monoXs, display: 'flex', gap: 8 }}>
                          <span style={{ color: '#38bdf8', fontWeight: 700, width: 80, flexShrink: 0 }}>[FACT]</span>
                          <span style={{ color: 'var(--t2)' }}>{p.epistemology.fact}</span>
                        </div>
                      )}
                      {(activeEpistemologyTab === 'all' || activeEpistemologyTab === 'derived') && (
                        <div style={{ ...monoXs, display: 'flex', gap: 8 }}>
                          <span style={{ color: '#fbbf24', fontWeight: 700, width: 80, flexShrink: 0 }}>[DERIVED]</span>
                          <span style={{ color: 'var(--t2)' }}>{p.epistemology.derived}</span>
                        </div>
                      )}
                      {(activeEpistemologyTab === 'all' || activeEpistemologyTab === 'assumption') && (
                        <div style={{ ...monoXs, display: 'flex', gap: 8 }}>
                          <span style={{ color: '#f97316', fontWeight: 700, width: 80, flexShrink: 0 }}>[ASSUMPTION]</span>
                          <span style={{ color: 'var(--t2)' }}>{p.epistemology.assumption}</span>
                        </div>
                      )}
                      {(activeEpistemologyTab === 'all' || activeEpistemologyTab === 'recommendation') && (
                        <div style={{ ...monoXs, display: 'flex', gap: 8 }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 700, width: 80, flexShrink: 0 }}>[ACTION]</span>
                          <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{p.epistemology.recommendation}</span>
                        </div>
                      )}
                    </div>

                    {/* Long / Short Legs & Operational Hedge */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                      <div style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 4, padding: '8px' }}>
                        <div style={{ ...monoXs, color: '#4ade80', fontWeight: 700, marginBottom: 4 }}>LONG LEG (OUTPERFORM)</div>
                        {p.longLeg.map((l, i) => (
                          <div key={i} style={{ ...monoSm, color: 'var(--t1)' }}>▲ {l}</div>
                        ))}
                      </div>
                      <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, padding: '8px' }}>
                        <div style={{ ...monoXs, color: '#f87171', fontWeight: 700, marginBottom: 4 }}>SHORT LEG (UNDERPERFORM)</div>
                        {p.shortLeg.map((s, i) => (
                          <div key={i} style={{ ...monoSm, color: 'var(--t1)' }}>▼ {s}</div>
                        ))}
                      </div>
                      <div style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 4, padding: '8px' }}>
                        <div style={{ ...monoXs, color: '#60a5fa', fontWeight: 700, marginBottom: 4 }}>OPERATIONAL SUPPLY HEDGE</div>
                        <div style={{ ...monoSm, color: 'var(--t2)', lineHeight: 1.4 }}>{p.operationalHedge}</div>
                      </div>
                    </div>

                    {/* Downside Stress Test */}
                    <div style={{ ...monoXs, color: 'var(--t4)', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 3 }}>
                      <strong style={{ color: 'var(--t3)' }}>Downside Stress-Test:</strong> {p.downsideStressTest}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── 4. MACRO SCENARIO STRESS-TESTER ───────────────────────────────── */}
        {subTab === 'stress' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '16px' }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ ...mono, fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                INTERACTIVE MACRO SCENARIO STRESS-TESTER ("WHAT-IF" SIMULATOR)
              </h2>
              <div style={{ ...monoSm, color: 'var(--t3)', marginTop: 4 }}>
                Simulate catastrophic chokepoint blockades, Taiwan ADIZ quarantines, or seismic cluster shocks with real-time sliders.
              </div>
            </div>

            {/* Scenario Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {MACRO_STRESS_SCENARIOS.map(s => {
                const isSel = s.id === selectedScenarioId
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedScenarioId(s.id)
                      setStressDays(s.defaultDurationDays)
                      setStressSeverity(s.defaultSeverityPct)
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: 4,
                      border: `1px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
                      background: isSel ? 'rgba(45,212,191,0.1)' : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ ...monoSm, fontWeight: 700, color: isSel ? 'var(--accent)' : 'var(--t1)' }}>
                      {s.name}
                    </div>
                    <div style={{ ...monoXs, color: 'var(--t4)', marginTop: 4 }}>
                      Default: {s.defaultDurationDays} days · {s.defaultSeverityPct}% severity
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Interactive Sliders */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ ...monoSm, color: 'var(--t2)', fontWeight: 600 }}>DISRUPTION DURATION (DAYS)</span>
                    <span style={{ ...monoSm, color: 'var(--accent)', fontWeight: 700 }}>{stressDays} DAYS</span>
                  </div>
                  <input
                    type="range"
                    min="7"
                    max="90"
                    step="1"
                    value={stressDays}
                    onChange={e => setStressDays(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', ...monoXs, color: 'var(--t4)', marginTop: 2 }}>
                    <span>7 days (flash shock)</span>
                    <span>30 days (protracted)</span>
                    <span>90 days (systemic crisis)</span>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ ...monoSm, color: 'var(--t2)', fontWeight: 600 }}>CAPACITY REDUCTION / SEVERITY</span>
                    <span style={{ ...monoSm, color: '#f59e0b', fontWeight: 700 }}>{stressSeverity}% SEVERITY</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={stressSeverity}
                    onChange={e => setStressSeverity(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', ...monoXs, color: 'var(--t4)', marginTop: 2 }}>
                    <span>10% (minor delay)</span>
                    <span>50% (partial diversion)</span>
                    <span>100% (total shutdown)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Calculated Stress Outputs */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '14px', background: 'rgba(0,0,0,0.3)', marginBottom: 16 }}>
              <div style={{ ...monoXs, color: 'var(--t4)', marginBottom: 8, letterSpacing: '0.08em' }}>
                CALCULATED SYSTEMIC IMPACT DELTAS (DURATION: {stressDays}D | SEVERITY: {stressSeverity}%)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                {stressResults.deltaBrent && (
                  <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, padding: '10px' }}>
                    <div style={{ ...monoXs, color: 'var(--t4)' }}>Δ BRENT CRUDE</div>
                    <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#f87171', marginTop: 2 }}>
                      +${stressResults.deltaBrent}/bbl
                    </div>
                  </div>
                )}
                {stressResults.deltaGas && (
                  <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, padding: '10px' }}>
                    <div style={{ ...monoXs, color: 'var(--t4)' }}>Δ NATURAL GAS</div>
                    <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#f87171', marginTop: 2 }}>
                      +${stressResults.deltaGas}/MMBtu
                    </div>
                  </div>
                )}
                {stressResults.deltaCPI && (
                  <div style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 4, padding: '10px' }}>
                    <div style={{ ...monoXs, color: 'var(--t4)' }}>Δ GLOBAL CPI INFLATION</div>
                    <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#fbbf24', marginTop: 2 }}>
                      +{stressResults.deltaCPI}%
                    </div>
                  </div>
                )}
                {stressResults.tankerInsurance && (
                  <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, padding: '10px' }}>
                    <div style={{ ...monoXs, color: 'var(--t4)' }}>TANKER WAR RISK</div>
                    <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#f87171', marginTop: 2 }}>
                      +{stressResults.tankerInsurance} bps
                    </div>
                  </div>
                )}
                {stressResults.deltaFreight && (
                  <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, padding: '10px' }}>
                    <div style={{ ...monoXs, color: 'var(--t4)' }}>CONTAINER SPOT FREIGHT</div>
                    <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#f87171', marginTop: 2 }}>
                      +{stressResults.deltaFreight}%
                    </div>
                  </div>
                )}
                {stressResults.deltaTech && (
                  <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, padding: '10px' }}>
                    <div style={{ ...monoXs, color: 'var(--t4)' }}>TECH EQUITIES (SOXX)</div>
                    <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#f87171', marginTop: 2 }}>
                      {stressResults.deltaTech}%
                    </div>
                  </div>
                )}
                {stressResults.semiconductorLeadWeeks && (
                  <div style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 4, padding: '10px' }}>
                    <div style={{ ...monoXs, color: 'var(--t4)' }}>CHIP DELIVERY LEAD TIME</div>
                    <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#fbbf24', marginTop: 2 }}>
                      +{stressResults.semiconductorLeadWeeks} WEEKS
                    </div>
                  </div>
                )}
                {stressResults.deltaCopper && (
                  <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 4, padding: '10px' }}>
                    <div style={{ ...monoXs, color: 'var(--t4)' }}>Δ COPPER SPOT PRICE</div>
                    <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#4ade80', marginTop: 2 }}>
                      +{stressResults.deltaCopper}%
                    </div>
                  </div>
                )}
              </div>

              {/* Central Bank Reaction */}
              <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4, marginBottom: 12 }}>
                <span style={{ ...monoXs, color: 'var(--t4)' }}>CENTRAL BANK MONETARY POLICY IMPLICATION: </span>
                <span style={{ ...monoSm, color: 'var(--accent)', fontWeight: 600 }}>{stressResults.centralBank}</span>
              </div>

              {/* Recommended Stress Hedges */}
              <div>
                <div style={{ ...monoXs, color: 'var(--t4)', marginBottom: 6, letterSpacing: '0.08em' }}>RECOMMENDED PORTFOLIO HEDGES & TACTICAL DIRECTIVES</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selectedScenario.recommendedHedges.map((h, i) => (
                    <span key={i} style={{ ...monoSm, padding: '4px 10px', borderRadius: 3, background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.3)', color: 'var(--accent)' }}>
                      🛡 {h}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 5. INVESTMENT MEMO & EXECUTIVE EXPORTER ─────────────────────── */}
        {subTab === 'export' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '16px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h2 style={{ ...mono, fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                  INSTITUTIONAL MACRO & ECONOMIC INTELLIGENCE MEMO
                </h2>
                <div style={{ ...monoSm, color: 'var(--t3)', marginTop: 4 }}>
                  Publication-ready markdown briefing adhering to the Evidence Ledger and Strategic Directive.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={copyMemoToClipboard}
                  style={{
                    ...monoSm,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 12px',
                    borderRadius: 4,
                    border: '1px solid var(--accent)',
                    background: copiedMemo ? 'var(--accent)' : 'rgba(45,212,191,0.1)',
                    color: copiedMemo ? '#000' : 'var(--accent)',
                    cursor: 'pointer'
                  }}
                >
                  {copiedMemo ? <Check size={12} /> : <Copy size={12} />}
                  {copiedMemo ? 'Copied to Clipboard!' : 'Copy Briefing'}
                </button>
                <button
                  onClick={downloadMemo}
                  style={{
                    ...monoSm,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 12px',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--t1)',
                    cursor: 'pointer'
                  }}
                >
                  <Download size={12} /> Download .md
                </button>
              </div>
            </div>

            <textarea
              readOnly
              value={investmentMemo}
              style={{
                flex: 1,
                width: '100%',
                ...monoSm,
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '12px',
                color: 'var(--t2)',
                resize: 'none',
                lineHeight: 1.5,
                outline: 'none'
              }}
            />
          </div>
        )}

      </div>
    </div>
  )
}
