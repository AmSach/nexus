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
  Sparkles,
  Flame,
  Plus,
  Radio,
  Trash2,
  RefreshCw,
  AlertOctagon,
  CheckCircle,
  X,
  Compass,
  Filter,
  Share2
} from 'lucide-react'
import {
  extractAdaptiveConflicts,
  synthesizeMacroPlaybook,
  addCustomConflict,
  deleteCustomConflict,
  getStoredConflicts,
  saveStoredConflicts
} from '../../utils/adaptiveConflictEngine'
import GraphAndGameTheoryEngine from './GraphAndGameTheoryEngine'

const mono = { fontFamily: 'JetBrains Mono', fontSize: 11 }
const monoSm = { fontFamily: 'JetBrains Mono', fontSize: 10 }
const monoXs = { fontFamily: 'JetBrains Mono', fontSize: 9 }

export default function EconomicResearchTerminal({ activeSubTab: externalSubTab, onTabChange, onSelectChokepoint, articles = [] }) {
  const [subTab, setSubTab] = useState(externalSubTab || 'chokepoints')
  const [selectedChokeId, setSelectedChokeId] = useState('bab_el_mandeb')
  const [selectedScenarioId, setSelectedScenarioId] = useState('hormuz_blockade')
  const [stressDays, setStressDays] = useState(30)
  const [stressSeverity, setStressSeverity] = useState(80)
  const [copiedMemo, setCopiedMemo] = useState(false)
  const [activeEpistemologyTab, setActiveEpistemologyTab] = useState('all')

  const changeTab = (id) => {
    setSubTab(id)
    if (onTabChange) onTabChange(id)
  }

  // Adaptive Conflict State
  const [adaptiveConflicts, setAdaptiveConflicts] = useState(() => {
    const stored = getStoredConflicts()
    if (stored && stored.length > 0) return stored
    return extractAdaptiveConflicts(articles)
  })
  const [playbookFilter, setPlaybookFilter] = useState('all') // 'all' | 'adaptive' | 'baseline'
  const [isScanning, setIsScanning] = useState(false)
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customHeadline, setCustomHeadline] = useState('')
  const [customDetails, setCustomDetails] = useState('')
  const [customRegion, setCustomRegion] = useState('Middle East')
  const [ingestSuccess, setIngestSuccess] = useState('')

  // Sync external tab if passed
  React.useEffect(() => {
    if (externalSubTab) setSubTab(externalSubTab)
  }, [externalSubTab])

  // Auto-scan articles when incoming articles change
  React.useEffect(() => {
    if (articles && articles.length > 0) {
      const discovered = extractAdaptiveConflicts(articles)
      if (discovered && discovered.length > 0) {
        setAdaptiveConflicts(prev => {
          const map = new Map(prev.map(p => [p.headline || p.title, p]))
          let hasNew = false
          for (const d of discovered) {
            const k = d.headline || d.title
            if (!map.has(k)) {
              map.set(k, d)
              hasNew = true
            }
          }
          if (hasNew) {
            const updated = Array.from(map.values())
            saveStoredConflicts(updated)
            return updated
          }
          return prev
        })
      }
    }
  }, [articles])

  const handleReScan = () => {
    setIsScanning(true)
    setTimeout(() => {
      const discovered = extractAdaptiveConflicts(articles)
      const existing = getStoredConflicts()
      const mergedMap = new Map()
      discovered.forEach(d => mergedMap.set(d.headline || d.title, d))
      existing.forEach(e => mergedMap.set(e.headline || e.title, e))
      const combined = Array.from(mergedMap.values())
      setAdaptiveConflicts(combined)
      saveStoredConflicts(combined)
      setIsScanning(false)
      setIngestSuccess(`Scanned ${articles.length || 150}+ feeds: Indexed ${combined.length} active conflict theaters.`)
      setTimeout(() => setIngestSuccess(''), 4000)
    }, 450)
  }

  const handleAddCustom = (e) => {
    if (e) e.preventDefault()
    if (!customHeadline.trim()) return
    const newPlaybook = addCustomConflict(customHeadline.trim(), customDetails.trim(), customRegion)
    setAdaptiveConflicts(prev => [newPlaybook, ...prev.filter(p => p.id !== newPlaybook.id)])
    setCustomHeadline('')
    setCustomDetails('')
    setShowCustomModal(false)
    setPlaybookFilter('all')
    setIngestSuccess(`Synthesized macro playbook for: "${newPlaybook.title}"`)
    setTimeout(() => setIngestSuccess(''), 4500)
  }

  const handleDeleteConflict = (id) => {
    const updated = deleteCustomConflict(id)
    setAdaptiveConflicts(updated)
  }

  const combinedPlaybooks = useMemo(() => {
    if (playbookFilter === 'adaptive') return adaptiveConflicts
    if (playbookFilter === 'baseline') return ALPHA_TRADE_PLAYBOOKS
    return [...adaptiveConflicts, ...ALPHA_TRADE_PLAYBOOKS]
  }, [adaptiveConflicts, playbookFilter])

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
${[...ALPHA_TRADE_PLAYBOOKS, ...adaptiveConflicts].map(p => `### ${p.title} (${p.isAdaptive ? '⚡ LIVE ADAPTIVE DISCOVERY | ' : ''}Horizon: ${p.targetHorizon} | Sharpe: ${p.expectedSharpeRatio} | Conviction: ${p.conviction})
- **[FACT]**: ${p.epistemology.fact}
- **[DERIVED]**: ${p.epistemology.derived}
- **[ASSUMPTION]**: ${p.epistemology.assumption}
- **[RECOMMENDATION]**: ${p.epistemology.recommendation}
- **Long Basket**: ${p.longLeg.join(', ')}
- **Short Basket**: ${p.shortLeg.join(', ')}
- **Operational Supply-Chain Hedge**: ${p.operationalHedge}
- **Downside Stress-Test**: ${p.downsideStressTest}
${p.killGate ? `- **Quantitative Decision Gate**: ${p.killGate}` : ''}
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
  }, [selectedScenario, stressDays, stressSeverity, stressResults, adaptiveConflicts])

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
      {/* Action & Context Bar (Zero Redundant Tabs) */}
      <div style={{ flexShrink: 0, padding: '7px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(15,23,42,0.7)', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...mono, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Sparkles size={12} /> MACRO RESEARCH DESK
          </span>
          <span style={{ color: 'var(--border)' }}>/</span>
          <span style={{ ...monoSm, color: 'var(--t1)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            {subTab === 'chokepoints' && <><Anchor size={11} color="var(--accent)"/> 1. Chokepoints & Supply Chains</>}
            {subTab === 'correlations' && <><Share2 size={11} color="var(--accent)"/> 2. Graph & Game Theory Engine</>}
            {subTab === 'alpha' && <><Target size={11} color="var(--accent)"/> 3. Alpha Desk & Trade Ops</>}
            {subTab === 'stress' && <><Cpu size={11} color="var(--accent)"/> 4. Scenario Stress-Testing Lab</>}
            {subTab === 'export' && <><FileText size={11} color="var(--accent)"/> 5. Strategic Briefing Export</>}
          </span>
          <span style={{ ...monoXs, padding: '2px 7px', borderRadius: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b' }} />
            {adaptiveConflicts.length} Live Theaters
          </span>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={handleReScan}
            disabled={isScanning}
            style={{
              ...monoXs,
              minHeight: 28,
              touchAction: 'manipulation',
              padding: '3px 9px',
              borderRadius: 3,
              border: '1px solid rgba(45,212,191,0.4)',
              background: isScanning ? 'rgba(45,212,191,0.2)' : 'rgba(45,212,191,0.08)',
              color: 'var(--accent)',
              cursor: isScanning ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
            title="Scan all live incoming RSS & GDELT articles for newly emerged flashpoints"
          >
            <RefreshCw size={10} className={isScanning ? 'spin' : ''} />
            {isScanning ? 'Scanning…' : '⚡ Live Scan'}
          </button>

          <button
            onClick={() => setShowCustomModal(true)}
            style={{
              ...monoXs,
              minHeight: 28,
              touchAction: 'manipulation',
              padding: '3px 9px',
              borderRadius: 3,
              border: '1px solid rgba(245,158,11,0.5)',
              background: 'rgba(245,158,11,0.12)',
              color: '#f59e0b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 600
            }}
            title="Ingest custom conflict or breaking event"
          >
            <Plus size={11} /> + Ingest Conflict
          </button>

          <button
            onClick={() => changeTab('export')}
            style={{
              ...monoXs,
              minHeight: 28,
              touchAction: 'manipulation',
              padding: '3px 9px',
              borderRadius: 3,
              border: `1px solid ${subTab === 'export' ? 'var(--accent)' : 'var(--border)'}`,
              background: subTab === 'export' ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
              color: subTab === 'export' ? '#000' : 'var(--t2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
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

        {/* ── 2. GRAPH & GAME THEORY NETWORK ENGINE ────────────────────────── */}
        {subTab === 'correlations' && (
          <GraphAndGameTheoryEngine adaptiveConflicts={adaptiveConflicts} />
        )}

        {/* ── 3. ALPHA DESK & BUSINESS OPPORTUNITIES ────────────────────────── */}
        {subTab === 'alpha' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '16px' }}>
            {/* Header & Subtitle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ ...mono, fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                    THE ALPHA DESK: ACTIONABLE TRADE BASKETS & BUSINESS OPPORTUNITIES
                  </h2>
                  <span style={{ ...monoXs, padding: '2px 8px', borderRadius: 12, background: 'rgba(45,212,191,0.15)', color: 'var(--accent)', border: '1px solid rgba(45,212,191,0.3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
                    {combinedPlaybooks.length} Active Theaters
                  </span>
                </div>
                <div style={{ ...monoSm, color: 'var(--t3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>Institutional baselines & <strong>⚡ Live Adaptive Conflict Discovery</strong> (NLP Extraction & Econometric Transmission).</span>
                </div>
              </div>

              {/* Action Buttons: Scan + Ingest Custom */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  onClick={handleReScan}
                  disabled={isScanning}
                  style={{
                    ...monoXs,
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: '1px solid rgba(45,212,191,0.4)',
                    background: isScanning ? 'rgba(45,212,191,0.2)' : 'rgba(45,212,191,0.08)',
                    color: 'var(--accent)',
                    cursor: isScanning ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5
                  }}
                  title="Re-scan all incoming news articles and OSINT points for newly emerging conflicts"
                >
                  <RefreshCw size={11} className={isScanning ? 'spin' : ''} />
                  {isScanning ? 'Scanning Live Feeds…' : '⚡ Re-Scan Live Feeds'}
                </button>

                <button
                  onClick={() => setShowCustomModal(true)}
                  style={{
                    ...monoXs,
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: '1px solid rgba(245,158,11,0.5)',
                    background: 'rgba(245,158,11,0.12)',
                    color: '#f59e0b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontWeight: 600
                  }}
                  title="Synthesize an on-the-fly macro playbook for any custom conflict or breaking event headline"
                >
                  <Plus size={11} /> + Ingest Custom Conflict
                </button>
              </div>
            </div>

            {/* Notification Banner */}
            {ingestSuccess && (
              <div style={{ marginBottom: 12, padding: '6px 12px', background: 'rgba(45,212,191,0.12)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--accent)', ...monoSm, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={14} /> {ingestSuccess}
              </div>
            )}

            {/* Filters Bar: Category Filter + Epistemology Filter */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid var(--border)' }}>
              {/* Playbook Type Filter */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setPlaybookFilter('all')}
                  style={{
                    ...monoXs,
                    padding: '3px 8px',
                    borderRadius: 3,
                    border: 'none',
                    cursor: 'pointer',
                    background: playbookFilter === 'all' ? 'var(--accent)' : 'transparent',
                    color: playbookFilter === 'all' ? '#000' : 'var(--t3)',
                    fontWeight: playbookFilter === 'all' ? 700 : 400
                  }}
                >
                  ALL PLAYBOOKS ({adaptiveConflicts.length + ALPHA_TRADE_PLAYBOOKS.length})
                </button>
                <button
                  onClick={() => setPlaybookFilter('adaptive')}
                  style={{
                    ...monoXs,
                    padding: '3px 8px',
                    borderRadius: 3,
                    border: 'none',
                    cursor: 'pointer',
                    background: playbookFilter === 'adaptive' ? '#f59e0b' : 'transparent',
                    color: playbookFilter === 'adaptive' ? '#000' : 'var(--t3)',
                    fontWeight: playbookFilter === 'adaptive' ? 700 : 400
                  }}
                >
                  ⚡ LIVE ADAPTIVE ({adaptiveConflicts.length})
                </button>
                <button
                  onClick={() => setPlaybookFilter('baseline')}
                  style={{
                    ...monoXs,
                    padding: '3px 8px',
                    borderRadius: 3,
                    border: 'none',
                    cursor: 'pointer',
                    background: playbookFilter === 'baseline' ? '#38bdf8' : 'transparent',
                    color: playbookFilter === 'baseline' ? '#000' : 'var(--t3)',
                    fontWeight: playbookFilter === 'baseline' ? 700 : 400
                  }}
                >
                  🏛 INSTITUTIONAL BASELINES ({ALPHA_TRADE_PLAYBOOKS.length})
                </button>
              </div>

              {/* Epistemology Filter */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ ...monoXs, color: 'var(--t4)', marginRight: 4 }}>EVIDENCE LEDGER:</span>
                {['all', 'fact', 'derived', 'assumption', 'recommendation'].map(tabId => (
                  <button
                    key={tabId}
                    onClick={() => setActiveEpistemologyTab(tabId)}
                    style={{
                      ...monoXs,
                      padding: '2px 7px',
                      borderRadius: 2,
                      border: 'none',
                      cursor: 'pointer',
                      background: activeEpistemologyTab === tabId ? 'rgba(255,255,255,0.15)' : 'transparent',
                      color: activeEpistemologyTab === tabId ? 'var(--t1)' : 'var(--t4)',
                      fontWeight: activeEpistemologyTab === tabId ? 700 : 400
                    }}
                  >
                    {tabId.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Ingestion Modal / Accordion */}
            {showCustomModal && (
              <div style={{ marginBottom: 16, padding: '14px', background: 'rgba(15,23,42,0.95)', border: '1px solid #f59e0b', borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...monoSm, fontWeight: 700, color: '#f59e0b' }}>
                    <Flame size={14} /> INGEST CUSTOM FLASHPOINT / BREAKING EVENT SCENARIO
                  </div>
                  <button onClick={() => setShowCustomModal(false)} style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer' }}>
                    <X size={14} />
                  </button>
                </div>
                <div style={{ ...monoXs, color: 'var(--t3)', marginBottom: 12 }}>
                  Input any breaking conflict, strike, or infrastructure sabotage headline. The lightweight in-browser model extracts combatants, vulnerable assets, and generates the complete econometric transmission playbook (&lt; 5ms).
                </div>

                {/* 1-Click Quick Scenario Presets */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ ...monoXs, color: 'var(--t4)', marginBottom: 6 }}>OR CLICK A LIVE FLASHPOINT PRESET:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { label: '🇸🇩 Sudan RSF Drones Strike Port Sudan Fuel Depot', region: 'Africa', headline: 'Sudan RSF drones strike Port Sudan fuel storage facility and export dock' },
                      { label: '🌊 Baltic Undersea Power Cable Cut near Gotland', region: 'Europe', headline: 'Subsea high-voltage power cable severed in central Baltic Sea near Gotland' },
                      { label: '⛏ Atacama Lithium Mine Sabotage & Blockade', region: 'Latin America', headline: 'Violent protests and road blockades halt lithium brine processing in Atacama desert' },
                      { label: '🚢 Malacca Strait GPS Spoofing Tanker Grounding', region: 'Southeast Asia', headline: 'Mass electronic warfare GPS spoofing causes commercial tanker grounding in Malacca Strait' }
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCustomHeadline(preset.headline)
                          setCustomRegion(preset.region)
                          setCustomDetails('Satellite and maritime signals confirm local operational stoppage.')
                        }}
                        style={{
                          ...monoXs,
                          padding: '3px 8px',
                          borderRadius: 3,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(255,255,255,0.03)',
                          color: 'var(--t2)',
                          cursor: 'pointer'
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Form */}
                <form onSubmit={handleAddCustom} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <label style={{ ...monoXs, color: 'var(--t3)', display: 'block', marginBottom: 4 }}>EVENT HEADLINE / SIGNAL (REQUIRED):</label>
                    <input
                      type="text"
                      placeholder="e.g. Drone strike targets Ras Isa oil terminal causing crude export suspension"
                      value={customHeadline}
                      onChange={e => setCustomHeadline(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        background: 'rgba(0,0,0,0.5)',
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        color: 'var(--t1)',
                        ...monoSm
                      }}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ ...monoXs, color: 'var(--t3)', display: 'block', marginBottom: 4 }}>INTELLIGENCE DETAILS / CONTEXT (OPTIONAL):</label>
                      <input
                        type="text"
                        placeholder="e.g. Explosions reported near storage tanks; tankers ordered to hold offshore."
                        value={customDetails}
                        onChange={e => setCustomDetails(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          background: 'rgba(0,0,0,0.5)',
                          border: '1px solid var(--border)',
                          borderRadius: 3,
                          color: 'var(--t1)',
                          ...monoSm
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ ...monoXs, color: 'var(--t3)', display: 'block', marginBottom: 4 }}>THEATER / REGION:</label>
                      <select
                        value={customRegion}
                        onChange={e => setCustomRegion(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          background: 'rgba(0,0,0,0.5)',
                          border: '1px solid var(--border)',
                          borderRadius: 3,
                          color: 'var(--t1)',
                          ...monoSm
                        }}
                      >
                        <option value="Middle East">Middle East</option>
                        <option value="Africa">Africa</option>
                        <option value="Europe">Europe</option>
                        <option value="East Asia">East Asia</option>
                        <option value="Southeast Asia">Southeast Asia</option>
                        <option value="Latin America">Latin America</option>
                        <option value="Global Geopolitical">Global Geopolitical</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      type="submit"
                      style={{
                        ...monoSm,
                        fontWeight: 700,
                        padding: '6px 14px',
                        borderRadius: 4,
                        border: 'none',
                        background: '#f59e0b',
                        color: '#000',
                        cursor: 'pointer'
                      }}
                    >
                      ⚡ Synthesize Macro Playbook
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCustomModal(false)}
                      style={{
                        ...monoSm,
                        padding: '6px 12px',
                        borderRadius: 4,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--t3)',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Playbooks Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {combinedPlaybooks.map(p => {
                const convClr = p.conviction === 'VERY HIGH' ? '#22c55e' : p.conviction === 'HIGH' ? '#4ade80' : '#f59e0b'
                const isAdaptive = Boolean(p.isAdaptive)

                return (
                  <div
                    key={p.id}
                    style={{
                      border: `1px solid ${isAdaptive ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                      borderRadius: 6,
                      padding: '14px',
                      background: isAdaptive ? 'rgba(245,158,11,0.02)' : 'rgba(255,255,255,0.015)',
                      boxShadow: isAdaptive ? '0 0 15px rgba(245,158,11,0.04)' : 'none'
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{p.title}</span>

                          {isAdaptive ? (
                            <span style={{ ...monoXs, padding: '2px 7px', borderRadius: 3, background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid rgba(245,158,11,0.4)' }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b' }} />
                              ⚡ LIVE ADAPTIVE DISCOVERY
                            </span>
                          ) : (
                            <span style={{ ...monoXs, padding: '2px 7px', borderRadius: 3, background: 'rgba(56,189,248,0.15)', color: '#38bdf8', fontWeight: 600, border: '1px solid rgba(56,189,248,0.3)' }}>
                              🏛 INSTITUTIONAL BASELINE
                            </span>
                          )}

                          <span style={{ ...monoXs, padding: '2px 6px', borderRadius: 2, background: `${convClr}20`, color: convClr, fontWeight: 700 }}>
                            {p.conviction} CONVICTION
                          </span>

                          {p.threatScore && (
                            <span style={{ ...monoXs, padding: '2px 6px', borderRadius: 2, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700 }}>
                              {p.severity} {p.threatScore}/100
                            </span>
                          )}
                        </div>

                        <div style={{ ...monoXs, color: 'var(--t4)', marginTop: 4, display: 'flex', gap: 12 }}>
                          <span>Target Horizon: {p.targetHorizon}</span>
                          <span>·</span>
                          <span>Sharpe Ratio: {p.expectedSharpeRatio}</span>
                          {p.theater && (
                            <>
                              <span>·</span>
                              <span style={{ color: 'var(--t3)' }}>Theater: {p.theater}</span>
                            </>
                          )}
                          {isAdaptive && p.source && (
                            <>
                              <span>·</span>
                              <span style={{ color: '#f59e0b' }}>Source: {p.source}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Delete button for user custom / stored conflicts */}
                      {isAdaptive && (
                        <button
                          onClick={() => handleDeleteConflict(p.id)}
                          title="Dismiss / remove this conflict playbook"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--t4)',
                            cursor: 'pointer',
                            padding: '3px 6px',
                            borderRadius: 3
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    {/* Adaptive Metadata: Combatants & Critical Infrastructure */}
                    {isAdaptive && (p.factions || p.threatenedInfrastructure) && (
                      <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(0,0,0,0.25)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.03)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {p.factions && (
                          <div>
                            <span style={{ ...monoXs, color: 'var(--t4)', fontWeight: 600 }}>BELLIGERENTS / FACTIONS:</span>
                            <div style={{ ...monoXs, color: 'var(--t2)', marginTop: 2 }}>{p.factions.join(' vs ')}</div>
                          </div>
                        )}
                        {p.threatenedInfrastructure && (
                          <div>
                            <span style={{ ...monoXs, color: 'var(--t4)', fontWeight: 600 }}>THREATENED CRITICAL ASSETS:</span>
                            <div style={{ ...monoXs, color: 'var(--t2)', marginTop: 2 }}>{p.threatenedInfrastructure.join(' · ')}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Evidence Ledger Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, background: 'rgba(0,0,0,0.35)', padding: 10, borderRadius: 4, border: '1px solid rgba(255,255,255,0.04)' }}>
                      {(activeEpistemologyTab === 'all' || activeEpistemologyTab === 'fact') && (
                        <div style={{ ...monoXs, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: '#38bdf8', fontWeight: 700, width: 85, flexShrink: 0 }}>[FACT]</span>
                          <span style={{ color: 'var(--t2)', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.45, flex: 1 }}>{p.epistemology.fact}</span>
                        </div>
                      )}
                      {(activeEpistemologyTab === 'all' || activeEpistemologyTab === 'derived') && (
                        <div style={{ ...monoXs, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: '#fbbf24', fontWeight: 700, width: 85, flexShrink: 0 }}>[DERIVED]</span>
                          <span style={{ color: 'var(--t2)', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.45, flex: 1 }}>{p.epistemology.derived}</span>
                        </div>
                      )}
                      {(activeEpistemologyTab === 'all' || activeEpistemologyTab === 'assumption') && (
                        <div style={{ ...monoXs, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: '#f97316', fontWeight: 700, width: 85, flexShrink: 0 }}>[ASSUMPTION]</span>
                          <span style={{ color: 'var(--t2)', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.45, flex: 1 }}>{p.epistemology.assumption}</span>
                        </div>
                      )}
                      {(activeEpistemologyTab === 'all' || activeEpistemologyTab === 'recommendation') && (
                        <div style={{ ...monoXs, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 700, width: 85, flexShrink: 0 }}>[ACTION]</span>
                          <span style={{ color: 'var(--t1)', fontWeight: 600, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.45, flex: 1 }}>{p.epistemology.recommendation}</span>
                        </div>
                      )}
                    </div>

                    {/* Commodity Transmissions (if present) */}
                    {p.commodityTransmissions && p.commodityTransmissions.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ ...monoXs, color: 'var(--t4)', marginBottom: 4, fontWeight: 600 }}>
                          MACRO TRANSMISSION CHANNELS (PRICE SHOCKS & BETAS):
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))`, gap: 6 }}>
                          {p.commodityTransmissions.map((c, i) => (
                            <div key={i} style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ ...monoSm, fontWeight: 600, color: 'var(--t1)' }}>{c.name}</span>
                                <span style={{ ...monoXs, color: '#f59e0b', fontWeight: 700 }}>{c.baseShock}</span>
                              </div>
                              <div style={{ ...monoXs, color: 'var(--t3)', marginTop: 2 }}>β = {c.beta} · {c.note}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Long / Short Legs & Operational Hedge */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 10 }}>
                      <div style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 4, padding: '8px' }}>
                        <div style={{ ...monoXs, color: '#4ade80', fontWeight: 700, marginBottom: 4 }}>LONG LEG (OUTPERFORM)</div>
                        {p.longLeg.map((l, i) => (
                          <div key={i} style={{ ...monoSm, color: 'var(--t1)', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.4 }}>▲ {l}</div>
                        ))}
                      </div>
                      <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, padding: '8px' }}>
                        <div style={{ ...monoXs, color: '#f87171', fontWeight: 700, marginBottom: 4 }}>SHORT LEG (UNDERPERFORM)</div>
                        {p.shortLeg.map((s, i) => (
                          <div key={i} style={{ ...monoSm, color: 'var(--t1)', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.4 }}>▼ {s}</div>
                        ))}
                      </div>
                      <div style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 4, padding: '8px' }}>
                        <div style={{ ...monoXs, color: '#60a5fa', fontWeight: 700, marginBottom: 4 }}>OPERATIONAL SUPPLY HEDGE</div>
                        <div style={{ ...monoSm, color: 'var(--t2)', lineHeight: 1.4, wordBreak: 'break-word', whiteSpace: 'normal' }}>{p.operationalHedge}</div>
                      </div>
                    </div>

                    {/* Quantitative Kill Gate */}
                    {p.killGate && (
                      <div style={{ ...monoXs, color: '#f59e0b', padding: '6px 8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 3, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.4 }}>
                        <Shield size={12} color="#f59e0b" style={{ flexShrink: 0 }} />
                        <span><strong>Quantitative Kill Gate:</strong> {p.killGate}</span>
                      </div>
                    )}

                    {/* Downside Stress Test */}
                    <div style={{ ...monoXs, color: 'var(--t4)', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 3, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.4 }}>
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
