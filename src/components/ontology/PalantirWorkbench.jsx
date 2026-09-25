/**
 * PalantirWorkbench.jsx
 * Institutional Operations & Dynamic Semantic Ontology Workbench
 * Features:
 *  1. Dynamic Semantic Ontology & State Machine (Vessels, Infrastructure, UBO corporate trees)
 *  2. Empirical Historical Calibration Lab (T_0 Known Inputs -> Model Derived Outputs -> Verified Historical Facts)
 *  3. Hard Telemetry & AIS Fleet Operations (Real-time tracking, dark fleet SAR reacquisition)
 *  4. Operational Execution & Decision Writeback (FIX tickets, SAP ERP purchase orders, Lloyd's War Risk calculator)
 */

import React, { useState, useMemo } from 'react'
import {
  Layers,
  Shield,
  Activity,
  Anchor,
  Compass,
  FileText,
  TrendingUp,
  Cpu,
  AlertTriangle,
  CheckCircle,
  Copy,
  Check,
  Download,
  Share2,
  RefreshCw,
  Search,
  ExternalLink,
  Target,
  DollarSign,
  Radio,
  Sliders,
  ChevronRight,
  Database,
  ArrowRight,
  Zap,
  Globe
} from 'lucide-react'
import { ontologyEngine } from '../../utils/ontologyEngine'
import { HISTORICAL_BENCHMARKS } from '../../data/historicalBenchmarks'
import {
  generateFixOrderTicket,
  generateSupplyChainInterventionPO,
  calculateWarRiskUnderwritingQuote
} from '../../utils/operationalExecution'

const mono = { fontFamily: 'JetBrains Mono', fontSize: 11 }
const monoSm = { fontFamily: 'JetBrains Mono', fontSize: 10 }
const monoXs = { fontFamily: 'JetBrains Mono', fontSize: 9 }

export default function PalantirWorkbench({ onBackToTerminal }) {
  const [activeSubView, setActiveSubView] = useState('calibration') // 'ontology' | 'calibration' | 'telemetry' | 'execution'
  const [engineState, setEngineState] = useState(() => ontologyEngine.getOperationalSummary())
  const [selectedVesselId, setSelectedVesselId] = useState('ves_front_altair')
  const [vesselFilter, setVesselFilter] = useState('ALL')
  const [vesselSearch, setVesselSearch] = useState('')
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState('benchmark_red_sea_2023_2024')
  const [copiedText, setCopiedText] = useState('')

  // Execution states
  const [fixSymbol, setFixSymbol] = useState('FRO')
  const [fixQuantity, setFixQuantity] = useState(25000)
  const [fixPrice, setFixPrice] = useState(24.50)
  const [fixSide, setFixSide] = useState('1') // 1 = Buy
  const [fixResult, setFixResult] = useState(() => generateFixOrderTicket({ symbol: 'FRO', quantity: 25000, price: 24.50, side: '1' }))
  
  // War Risk Underwriter states
  const [hullValueM, setHullValueM] = useState(140)
  const [hasNavalEscort, setHasNavalEscort] = useState(true)
  const [underwriterResult, setUnderwriterResult] = useState(() => calculateWarRiskUnderwritingQuote({ hullValueUSD: 140000000, hasNavalEscort: true }))

  // ERP Interceptor states
  const [erpResult, setErpResult] = useState(() => {
    const vessel = ontologyEngine.getVesselById('ves_msc_clara')
    const bom = ontologyEngine.bomNodes[0]
    const plant = ontologyEngine.getFacilityById('fac_tesla_berlin')
    return generateSupplyChainInterventionPO({ bomNode: bom, vessel, affectedPlant: plant })
  })

  const refreshSummary = () => {
    setEngineState(ontologyEngine.getOperationalSummary())
  }

  const handleSimulateStrike = () => {
    ontologyEngine.simulateEscalationStrike({ chokepointId: 'bab_el_mandeb', threatType: 'ASBM_DRONE_SWARM' })
    refreshSummary()
  }

  const handleReset = () => {
    ontologyEngine.reset()
    refreshSummary()
  }

  const handleVesselTransition = (vesselId, nextStatus, reason) => {
    ontologyEngine.transitionVesselState(vesselId, nextStatus, reason)
    refreshSummary()
  }

  const filteredVessels = useMemo(() => {
    return ontologyEngine.queryVessels({ status: vesselFilter, search: vesselSearch })
  }, [engineState, vesselFilter, vesselSearch])

  const selectedVessel = useMemo(() => {
    return ontologyEngine.getVesselById(selectedVesselId) || filteredVessels[0]
  }, [selectedVesselId, engineState, filteredVessels])

  const selectedUbo = useMemo(() => {
    if (!selectedVessel?.uboId) return null
    return ontologyEngine.getUboById(selectedVessel.uboId)
  }, [selectedVessel])

  const currentBenchmark = useMemo(() => {
    return HISTORICAL_BENCHMARKS.find(b => b.id === selectedBenchmarkId) || HISTORICAL_BENCHMARKS[0]
  }, [selectedBenchmarkId])

  const copyToClipboard = (text, tag) => {
    if (!text) return
    navigator.clipboard?.writeText(text)
    setCopiedText(tag)
    setTimeout(() => setCopiedText(''), 2500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--void)', color: 'var(--t1)', overflow: 'hidden' }}>
      {/* Top Palantir Header */}
      <div style={{ flexShrink: 0, padding: '10px 16px', background: 'var(--base)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: 'rgba(45,212,191,0.12)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
              <Layers size={16} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>NEXUS PALANTIR-GRADE WORKBENCH</span>
                <span className="chip" style={{ background: 'rgba(45,212,191,0.15)', color: 'var(--accent)', border: '1px solid var(--accent)', fontSize: '9px', padding: '1px 6px' }}>
                  AIP & GOTHAM OPERATIONAL TIER
                </span>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Dynamic Ontology</span>
                <span>•</span>
                <span>Hard Telemetry</span>
                <span>•</span>
                <span>Empirical Fact Calibration</span>
                <span>•</span>
                <span>Decision Writeback</span>
              </div>
            </div>
          </div>
        </div>

        {/* Global Operational Telemetry Strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', ...monoSm }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: '3px', border: '1px solid var(--border)' }}>
            <Anchor size={12} color="var(--accent)" />
            <span style={{ color: 'var(--t3)' }}>VESSELS:</span>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{engineState.totalVessels}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239,68,68,0.08)', padding: '4px 8px', borderRadius: '3px', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertTriangle size={12} color="var(--red)" />
            <span style={{ color: 'var(--red)' }}>CAPE DIVERTED:</span>
            <span style={{ fontWeight: 700, color: 'var(--red)' }}>{engineState.divertedCount}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(245,158,11,0.08)', padding: '4px 8px', borderRadius: '3px', border: '1px solid rgba(245,158,11,0.3)' }}>
            <Radio size={12} color="var(--orange)" />
            <span style={{ color: 'var(--orange)' }}>DARK AIS:</span>
            <span style={{ fontWeight: 700, color: 'var(--orange)' }}>{engineState.darkAisCount}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: '3px', border: '1px solid var(--border)' }}>
            <DollarSign size={12} color="#10b981" />
            <span style={{ color: 'var(--t3)' }}>CARGO VALUE:</span>
            <span style={{ fontWeight: 700, color: '#10b981' }}>${(engineState.totalCargoValueUSD / 1e6).toFixed(0)}M USD</span>
          </div>
        </div>

        {/* Global Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleSimulateStrike}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '3px',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid var(--red)',
              color: 'var(--red)',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '11px',
              fontFamily: 'Inter, sans-serif'
            }}
            title="Simulate asymmetric strike event to trigger live ontology state-machine cascade"
          >
            <Zap size={12} />
            <span>+ ASYMMETRIC STRIKE CASCADE</span>
          </button>
          <button
            onClick={handleReset}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 8px',
              borderRadius: '3px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--t3)',
              cursor: 'pointer',
              fontSize: '11px'
            }}
            title="Reset ontology state to baseline"
          >
            <RefreshCw size={12} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Sub-View Navigation Bar */}
      <div style={{ flexShrink: 0, padding: '4px 16px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {[
          { id: 'calibration', label: '1. Empirical Fact Calibration (Backtest)', Icon: CheckCircle, highlight: true },
          { id: 'ontology', label: '2. Dynamic Ontology & State Machine', Icon: Database },
          { id: 'telemetry', label: '3. Hard Telemetry & AIS Operations', Icon: Radio },
          { id: 'execution', label: '4. Decision Writeback & Execution', Icon: Target }
        ].map(tab => {
          const active = activeSubView === tab.id
          const Icon = tab.Icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubView(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '7px 14px',
                borderRadius: '3px',
                border: `1px solid ${active ? (tab.highlight ? 'var(--accent)' : 'var(--border-high)') : 'transparent'}`,
                background: active ? (tab.highlight ? 'rgba(45,212,191,0.15)' : 'var(--surface)') : 'transparent',
                color: active ? (tab.highlight ? 'var(--accent)' : 'var(--t1)') : 'var(--t3)',
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                fontSize: '11px',
                fontWeight: active ? 700 : 500,
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={13} color={active ? (tab.highlight ? 'var(--accent)' : '#fff') : 'var(--t3)'} />
              <span>{tab.label}</span>
              {tab.highlight && (
                <span className="chip" style={{ background: 'var(--accent)', color: '#000', fontSize: '8px', padding: '0 4px', fontWeight: 800 }}>
                  KEY DIRECTIVE
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* SUB-VIEW 1: EMPIRICAL HISTORICAL CALIBRATION (THE KEY USER REQUIREMENT) */}
      {activeSubView === 'calibration' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Executive Epistemology Header */}
          <div style={{ background: 'rgba(45,212,191,0.05)', border: '1px solid rgba(45,212,191,0.25)', borderRadius: '4px', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle size={20} color="var(--accent)" />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.02em' }}>
                    EMPIRICAL HISTORICAL CALIBRATION & PREDICTIVE ACCURACY LAB
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--t2)' }}>
                    Rigorous Epistemological Proof: Testing model-derived forecasts against verified historical ground truth using ONLY information available prior to the shock.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', ...monoSm }}>
                <span style={{ color: 'var(--t3)' }}>CALIBRATION ACCURACY:</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '3px', border: '1px solid rgba(16,185,129,0.3)' }}>
                  {currentBenchmark.overallPredictiveValidityPct}% PREDICTIVE VALIDITY
                </span>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--t3)', lineHeight: 1.5, borderTop: '1px solid rgba(45,212,191,0.15)', paddingTop: '8px' }}>
              {currentBenchmark.executiveSummary}
            </div>
          </div>

          {/* Benchmark Selection Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--t3)', marginRight: '4px' }}>SELECT CRISIS BENCHMARK:</span>
            {HISTORICAL_BENCHMARKS.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedBenchmarkId(b.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '3px',
                  border: `1px solid ${selectedBenchmarkId === b.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: selectedBenchmarkId === b.id ? 'rgba(45,212,191,0.12)' : 'var(--surface)',
                  color: selectedBenchmarkId === b.id ? 'var(--accent)' : 'var(--t2)',
                  fontSize: '11px',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: selectedBenchmarkId === b.id ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                <span>{b.title}</span>
                <span className="chip" style={{ fontSize: '9px', background: 'rgba(255,255,255,0.05)', color: 'var(--t3)' }}>
                  {b.timeHorizon}
                </span>
              </button>
            ))}
          </div>

          {/* 3-COLUMN EPISTEMOLOGICAL COMPARISON GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', alignItems: 'stretch' }}>
            {/* COLUMN 1: T_0 KNOWN PRE-EVENT DATA */}
            <div style={{ background: 'var(--base)', border: '1px solid var(--border)', borderRadius: '4px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Database size={13} color="var(--accent)" />
                  <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.02em' }}>1. KNOWN PRE-EVENT DATA (T_0)</span>
                </div>
                <span className="chip" style={{ background: 'rgba(45,212,191,0.1)', color: 'var(--accent)', fontSize: '9px' }}>
                  EPISTEMOLOGY: FACT
                </span>
              </div>
              <div style={{ padding: '6px 14px', background: 'rgba(0,0,0,0.2)', fontSize: '10px', color: 'var(--t3)', borderBottom: '1px solid var(--border)' }}>
                Baseline information available PRIOR to knowing the outcome ({currentBenchmark.preEventKnownData.timestamp})
              </div>
              <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
                {currentBenchmark.preEventKnownData.metrics.map((m, idx) => (
                  <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{m.label}</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--t1)', ...mono }}>{m.value}</div>
                    <div style={{ fontSize: '10px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <span>Source:</span>
                      <span style={{ fontStyle: 'italic' }}>{m.source}</span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--t3)', lineHeight: 1.4, borderTop: '1px dashed var(--border)', paddingTop: '4px', marginTop: '2px' }}>
                      {m.implication}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUMN 2: MODEL DERIVED PREDICTIONS */}
            <div style={{ background: 'var(--base)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '4px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Cpu size={13} color="var(--orange)" />
                  <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--orange)' }}>2. MODEL DERIVED PREDICTIONS</span>
                </div>
                <span className="chip" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--orange)', fontSize: '9px' }}>
                  EPISTEMOLOGY: DERIVED
                </span>
              </div>
              <div style={{ padding: '6px 14px', background: 'rgba(0,0,0,0.2)', fontSize: '10px', color: 'var(--t3)', borderBottom: '1px solid var(--border)' }}>
                Derived strictly from T_0 data using Causal DAG & Econometric Demand function
              </div>
              <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
                {currentBenchmark.modelDerivedPredictions.predictions.map((p, idx) => (
                  <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{p.domain}</div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--orange)', ...mono }}>{p.predictedRange}</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: '6px', ...mono }}>
                      <span style={{ fontSize: '9px', color: 'var(--t3)' }}>Point Est:</span>
                      <span>{p.pointEstimate}</span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--t3)', lineHeight: 1.4, borderTop: '1px dashed var(--border)', paddingTop: '4px', marginTop: '2px' }}>
                      {p.derivedLogic}
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--t4)', ...mono }}>CI: {p.confidenceInterval}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUMN 3: VERIFIED GROUND TRUTH FACTS */}
            <div style={{ background: 'var(--base)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '4px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.06)', borderBottom: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={13} color="#10b981" />
                  <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.02em', color: '#10b981' }}>3. VERIFIED GROUND TRUTH FACTS</span>
                </div>
                <span className="chip" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: '9px' }}>
                  EPISTEMOLOGY: FACT
                </span>
              </div>
              <div style={{ padding: '6px 14px', background: 'rgba(0,0,0,0.2)', fontSize: '10px', color: 'var(--t3)', borderBottom: '1px solid var(--border)' }}>
                Observed historical facts sourced from statutory filings, Drewry, and SEC reports
              </div>
              <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
                {currentBenchmark.verifiedGroundTruthFacts.facts.map((f, idx) => (
                  <div key={idx} style={{ background: 'var(--surface)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '3px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '10px', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{f.domain}</div>
                      <span className="chip" style={{ background: 'rgba(16,185,129,0.2)', color: '#10b981', fontSize: '8px', padding: '1px 5px', fontWeight: 800 }}>
                        {f.verdict}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#10b981', ...mono }}>{f.actualObservedValue}</div>
                    <div style={{ fontSize: '10px', color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: '6px', ...mono }}>
                      <span style={{ color: 'var(--t3)' }}>Error Delta:</span>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>{f.errorPercentage}</span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--t3)', lineHeight: 1.4, borderTop: '1px dashed var(--border)', paddingTop: '4px', marginTop: '2px' }}>
                      <span style={{ color: 'var(--t2)' }}>Source: </span>
                      {f.primarySource}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mathematical Transmission Proof Strip */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              MATHEMATICAL DERIVATION FORMULA & CAUSAL TRANSMISSION PROOF:
            </div>
            <div style={{ fontSize: '11px', color: 'var(--t2)', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '3px', ...mono, border: '1px solid var(--border)' }}>
              {currentBenchmark.modelDerivedPredictions.mathematicalFormulation}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: DYNAMIC ONTOLOGY & STATE MACHINE */}
      {activeSubView === 'ontology' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Column: Vessel & Asset Catalog with State Filters */}
          <div style={{ width: '380px', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--base)' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--t2)' }}>PHYSICAL MARITIME OBJECTS ({filteredVessels.length})</span>
                <span style={{ fontSize: '10px', color: 'var(--t3)', ...mono }}>CLICK TO INSPECT</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '4px 8px' }}>
                  <Search size={12} color="var(--t3)" />
                  <input
                    type="text"
                    placeholder="Search IMO, Vessel, Flag, Cargo..."
                    value={vesselSearch}
                    onChange={e => setVesselSearch(e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '11px', outline: 'none', width: '100%', fontFamily: 'Inter, sans-serif' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
                {['ALL', 'NORMAL', 'CORRIDOR_DEVIATION', 'DIVERTED_CAPE', 'AIS_DARK', 'ESCORTED'].map(st => (
                  <button
                    key={st}
                    onClick={() => setVesselFilter(st)}
                    style={{
                      padding: '3px 6px',
                      borderRadius: '2px',
                      fontSize: '9px',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: vesselFilter === st ? 700 : 500,
                      border: `1px solid ${vesselFilter === st ? 'var(--accent)' : 'var(--border)'}`,
                      background: vesselFilter === st ? 'rgba(45,212,191,0.15)' : 'transparent',
                      color: vesselFilter === st ? 'var(--accent)' : 'var(--t3)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Vessel List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filteredVessels.map(v => {
                const isSelected = v.id === selectedVessel?.id
                let statusColor = '#10b981'
                if (v.status === 'DIVERTED_CAPE') statusColor = 'var(--red)'
                if (v.status === 'CORRIDOR_DEVIATION') statusColor = 'var(--orange)'
                if (v.status === 'AIS_DARK') statusColor = 'var(--purple, #a855f7)'
                if (v.status === 'ESCORTED') statusColor = 'var(--accent)'

                return (
                  <div
                    key={v.id}
                    onClick={() => setSelectedVesselId(v.id)}
                    style={{
                      background: isSelected ? 'rgba(45,212,191,0.08)' : 'var(--surface)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '3px',
                      padding: '8px 10px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      transition: 'all 0.1s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: isSelected ? 'var(--accent)' : 'var(--t1)' }}>{v.name}</span>
                      <span className="chip" style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44`, fontSize: '8px', padding: '1px 5px', fontWeight: 800 }}>
                        {v.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--t3)', ...monoSm }}>
                      <span>IMO {v.imo} • {v.type}</span>
                      <span style={{ color: v.riskScore > 70 ? 'var(--red)' : 'var(--t3)' }}>Risk: {v.riskScore}/100</span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--t2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      📦 {v.cargoManifest?.type} (${(v.cargoManifest?.cargoValueUSD / 1e6).toFixed(0)}M)
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Column: Detailed Deep Ontology Inspector & State Machine */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {selectedVessel ? (
              <>
                {/* Header & Quick State Machine Trigger */}
                <div style={{ background: 'var(--base)', border: '1px solid var(--border)', borderRadius: '4px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{selectedVessel.name}</span>
                        <span className="chip" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)', fontSize: '9px', ...mono }}>
                          IMO: {selectedVessel.imo}
                        </span>
                        <span className="chip" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)', fontSize: '9px' }}>
                          FLAG: {selectedVessel.flag}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '2px' }}>
                        {selectedVessel.type} • {selectedVessel.dwt.toLocaleString()} DWT • Draft: {selectedVessel.draftMeters}m • Destination: {selectedVessel.destination}
                      </div>
                    </div>

                    {/* Interactive State Transition Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--t3)', marginRight: '4px' }}>FORCE STATE:</span>
                      <button
                        onClick={() => handleVesselTransition(selectedVessel.id, 'DIVERTED_CAPE', 'Manual Tactical Directive')}
                        style={{ padding: '4px 8px', borderRadius: '3px', background: 'rgba(239,68,68,0.15)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        DIVERT CAPE
                      </button>
                      <button
                        onClick={() => handleVesselTransition(selectedVessel.id, 'ESCORTED', 'Aegis Destroyer Escort Dispatched')}
                        style={{ padding: '4px 8px', borderRadius: '3px', background: 'rgba(45,212,191,0.15)', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        DISPATCH ESCORT
                      </button>
                      <button
                        onClick={() => handleVesselTransition(selectedVessel.id, 'AIS_DARK', 'Hostile Area Blackout')}
                        style={{ padding: '4px 8px', borderRadius: '3px', background: 'rgba(168,85,247,0.15)', border: '1px solid #a855f7', color: '#a855f7', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        SET DARK
                      </button>
                      <button
                        onClick={() => handleVesselTransition(selectedVessel.id, 'NORMAL', 'Threat Cleared')}
                        style={{ padding: '4px 8px', borderRadius: '3px', background: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', color: '#10b981', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        SET NORMAL
                      </button>
                    </div>
                  </div>

                  {/* Telemetry & Route Coordinates */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', ...monoSm }}>
                    <div style={{ background: 'var(--surface)', padding: '6px 8px', borderRadius: '3px' }}>
                      <div style={{ color: 'var(--t3)', fontSize: '9px' }}>COORDINATES</div>
                      <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{selectedVessel.lat.toFixed(3)}°N, {selectedVessel.lng.toFixed(3)}°E</div>
                    </div>
                    <div style={{ background: 'var(--surface)', padding: '6px 8px', borderRadius: '3px' }}>
                      <div style={{ color: 'var(--t3)', fontSize: '9px' }}>SPEED / HEADING</div>
                      <div style={{ color: 'var(--t1)', fontWeight: 700 }}>{selectedVessel.speedKnots} kts / {selectedVessel.heading}°</div>
                    </div>
                    <div style={{ background: 'var(--surface)', padding: '6px 8px', borderRadius: '3px' }}>
                      <div style={{ color: 'var(--t3)', fontSize: '9px' }}>CHOKEPOINT</div>
                      <div style={{ color: 'var(--t1)', fontWeight: 700 }}>{selectedVessel.chokepointId.toUpperCase()}</div>
                    </div>
                    <div style={{ background: 'var(--surface)', padding: '6px 8px', borderRadius: '3px' }}>
                      <div style={{ color: 'var(--t3)', fontSize: '9px' }}>INSURER (P&I CLUB)</div>
                      <div style={{ color: 'var(--t1)', fontWeight: 700, fontSize: '9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedVessel.piClub}</div>
                    </div>
                  </div>
                </div>

                {/* Cargo Manifest & Bills of Lading */}
                <div style={{ background: 'var(--base)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} />
                    <span>CARGO MANIFEST & BILL OF LADING TELEMETRY</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px', ...monoSm }}>
                    <div style={{ background: 'var(--surface)', padding: '8px', borderRadius: '3px' }}>
                      <div style={{ color: 'var(--t3)', fontSize: '9px' }}>CARGO DESCRIPTION</div>
                      <div style={{ color: 'var(--t1)', fontWeight: 700 }}>{selectedVessel.cargoManifest?.type}</div>
                      <div style={{ color: 'var(--t3)', fontSize: '9px', marginTop: '2px' }}>HTS Code: {selectedVessel.cargoManifest?.htsCode}</div>
                    </div>
                    <div style={{ background: 'var(--surface)', padding: '8px', borderRadius: '3px' }}>
                      <div style={{ color: 'var(--t3)', fontSize: '9px' }}>CARGO VALUE</div>
                      <div style={{ color: '#10b981', fontWeight: 800, fontSize: '13px' }}>
                        ${(selectedVessel.cargoManifest?.cargoValueUSD / 1e6).toFixed(1)}M USD
                      </div>
                    </div>
                    <div style={{ background: 'var(--surface)', padding: '8px', borderRadius: '3px' }}>
                      <div style={{ color: 'var(--t3)', fontSize: '9px' }}>VOLUME / TEU</div>
                      <div style={{ color: 'var(--t1)', fontWeight: 700 }}>
                        {selectedVessel.cargoManifest?.volumeBarrels ? `${selectedVessel.cargoManifest.volumeBarrels.toLocaleString()} bbl` : `${selectedVessel.cargoManifest?.volumeContainersTEU?.toLocaleString()} TEU`}
                      </div>
                    </div>
                    <div style={{ background: 'var(--surface)', padding: '8px', borderRadius: '3px' }}>
                      <div style={{ color: 'var(--t3)', fontSize: '9px' }}>CHARTERER</div>
                      <div style={{ color: 'var(--t1)', fontWeight: 700, fontSize: '10px' }}>{selectedVessel.cargoManifest?.charterer}</div>
                    </div>
                  </div>
                </div>

                {/* Ultimate Beneficial Ownership (UBO) Corporate Tree */}
                {selectedUbo && (
                  <div style={{ background: 'var(--base)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--orange)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Share2 size={14} />
                        <span>ULTIMATE BENEFICIAL OWNERSHIP (UBO) CORPORATE TREE</span>
                      </div>
                      <span className="chip" style={{ background: selectedUbo.sanctionsRiskScore > 50 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', color: selectedUbo.sanctionsRiskScore > 50 ? 'var(--red)' : '#10b981', fontSize: '9px', fontWeight: 700 }}>
                        SANCTIONS RISK: {selectedUbo.sanctionsRiskScore}/100
                      </span>
                    </div>
                    <div style={{ background: 'var(--surface)', padding: '10px', borderRadius: '3px', display: 'flex', flexDirection: 'column', gap: '6px', ...monoSm }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <span style={{ color: 'var(--t3)' }}>HOLDING ENTITY: </span>
                          <span style={{ color: 'var(--t1)', fontWeight: 700 }}>{selectedUbo.name}</span>
                          <span style={{ color: 'var(--t3)', marginLeft: '8px' }}>({selectedUbo.jurisdiction}, Reg: {selectedUbo.registrationNo})</span>
                        </div>
                      </div>
                      <div>
                        <span style={{ color: 'var(--t3)' }}>ULTIMATE BENEFICIAL OWNER: </span>
                        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{selectedUbo.ultimateBeneficialOwner}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {selectedUbo.sanctionsTags.map(tag => (
                          <span key={tag} className="chip" style={{ background: 'rgba(255,255,255,0.05)', color: tag.includes('SDN') ? 'var(--red)' : 'var(--t2)', fontSize: '8px' }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Telemetry Historical Intercepts */}
                <div style={{ background: 'var(--base)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Compass size={14} color="var(--accent)" />
                    <span>TELEMETRY COURSE & SATELLITE REACQUISITION LOG</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedVessel.telemetryHistory?.map((t, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--surface)', borderRadius: '3px', fontSize: '11px', ...monoSm }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: 'var(--t3)' }}>{t.timestamp}</span>
                          <span style={{ color: 'var(--t1)', fontWeight: 700 }}>{t.lat.toFixed(3)}°N, {t.lng.toFixed(3)}°E</span>
                          <span style={{ color: 'var(--t3)' }}>({t.speed} kts)</span>
                        </div>
                        {t.alert && (
                          <span style={{ color: t.alert.includes('Dark') ? '#a855f7' : (t.alert.includes('Rerouted') || t.alert.includes('Threat') ? 'var(--orange)' : 'var(--accent)') }}>
                            ⚠️ {t.alert}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)' }}>
                Select a vessel to inspect its ontology graph and state machine
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: HARD TELEMETRY & AIS FLEET OPERATIONS */}
      {activeSubView === 'telemetry' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--accent)' }}>MULTI-MODAL HARD TELEMETRY FLEET TRACKER</div>
              <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Fusing live AIS transponder NMEA data with Capella / Sentinel-2 SAR satellite radar reacquisition</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', ...monoSm }}>
              <span className="chip" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>STREAM: AISSTREAM.IO LIVE</span>
              <span className="chip" style={{ background: 'rgba(45,212,191,0.1)', color: 'var(--accent)' }}>RADAR: CAPELLA SAR 0.5M</span>
            </div>
          </div>

          {/* Full AIS Telemetry Table */}
          <div style={{ background: 'var(--base)', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', ...monoSm }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', color: 'var(--t3)' }}>
                  <th style={{ padding: '8px 12px' }}>VESSEL / IMO</th>
                  <th style={{ padding: '8px 12px' }}>TYPE</th>
                  <th style={{ padding: '8px 12px' }}>FLAG</th>
                  <th style={{ padding: '8px 12px' }}>LAT / LNG</th>
                  <th style={{ padding: '8px 12px' }}>SPEED</th>
                  <th style={{ padding: '8px 12px' }}>DRAFT</th>
                  <th style={{ padding: '8px 12px' }}>STATUS</th>
                  <th style={{ padding: '8px 12px' }}>CARGO VALUE</th>
                  <th style={{ padding: '8px 12px' }}>DESTINATION</th>
                </tr>
              </thead>
              <tbody>
                {ontologyEngine.vessels.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--border)', background: v.status === 'AIS_DARK' ? 'rgba(168,85,247,0.05)' : 'transparent' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--t1)' }}>
                      <div>{v.name}</div>
                      <div style={{ fontSize: '9px', color: 'var(--t3)' }}>IMO {v.imo}</div>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{v.type}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{v.flag}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--accent)' }}>{v.lat.toFixed(2)}°N, {v.lng.toFixed(2)}°E</td>
                    <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{v.speedKnots} kts</td>
                    <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{v.draftMeters} m</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className="chip" style={{ background: v.status === 'DIVERTED_CAPE' ? 'rgba(239,68,68,0.2)' : (v.status === 'AIS_DARK' ? 'rgba(168,85,247,0.2)' : 'rgba(16,185,129,0.2)'), color: v.status === 'DIVERTED_CAPE' ? 'var(--red)' : (v.status === 'AIS_DARK' ? '#a855f7' : '#10b981'), fontSize: '8px' }}>
                        {v.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 700 }}>
                      ${(v.cargoManifest?.cargoValueUSD / 1e6).toFixed(1)}M
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--t3)' }}>{v.destination}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: DECISION WRITEBACK & OPERATIONAL EXECUTION */}
      {activeSubView === 'execution' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'rgba(45,212,191,0.05)', border: '1px solid rgba(45,212,191,0.25)', borderRadius: '4px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--accent)' }}>ACTIONABLE DECISION WRITEBACK CONSOLE</div>
              <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Closing the loop: Translating intelligence directly into institutional order tickets, ERP purchase orders, and underwriting slips.</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* EXECUTION MODULE 1: FIX / OMS ORDER TICKET */}
            <div style={{ background: 'var(--base)', border: '1px solid var(--border)', borderRadius: '4px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Target size={14} color="var(--accent)" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>1. INSTITUTIONAL FIX / OMS ORDER TICKET</span>
                </div>
                <span className="chip" style={{ background: 'rgba(45,212,191,0.1)', color: 'var(--accent)', fontSize: '9px' }}>FIX 4.4 PROTOCOL</span>
              </div>

              {/* Order Parameters */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', ...monoSm }}>
                <div>
                  <div style={{ fontSize: '9px', color: 'var(--t3)' }}>SYMBOL</div>
                  <select
                    value={fixSymbol}
                    onChange={e => {
                      setFixSymbol(e.target.value)
                      setFixResult(generateFixOrderTicket({ symbol: e.target.value, quantity: fixQuantity, price: fixPrice, side: fixSide }))
                    }}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: '#fff', padding: '4px', borderRadius: '3px', width: '100%', fontSize: '11px' }}
                  >
                    <option value="FRO">FRO (Frontline)</option>
                    <option value="STNG">STNG (Scorpio Tankers)</option>
                    <option value="BZ=F">BZ=F (Brent Crude)</option>
                    <option value="DAL">DAL (Delta Air Lines - Short)</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '9px', color: 'var(--t3)' }}>SIDE</div>
                  <select
                    value={fixSide}
                    onChange={e => {
                      setFixSide(e.target.value)
                      setFixResult(generateFixOrderTicket({ symbol: fixSymbol, quantity: fixQuantity, price: fixPrice, side: e.target.value }))
                    }}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: '#fff', padding: '4px', borderRadius: '3px', width: '100%', fontSize: '11px' }}
                  >
                    <option value="1">1 (BUY / LONG)</option>
                    <option value="2">2 (SELL / SHORT)</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '9px', color: 'var(--t3)' }}>QUANTITY (SHS)</div>
                  <input
                    type="number"
                    value={fixQuantity}
                    onChange={e => {
                      const q = Number(e.target.value)
                      setFixQuantity(q)
                      setFixResult(generateFixOrderTicket({ symbol: fixSymbol, quantity: q, price: fixPrice, side: fixSide }))
                    }}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: '#fff', padding: '4px', borderRadius: '3px', width: '100%', fontSize: '11px' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '9px', color: 'var(--t3)' }}>LIMIT PRICE ($)</div>
                  <input
                    type="number"
                    step="0.05"
                    value={fixPrice}
                    onChange={e => {
                      const p = Number(e.target.value)
                      setFixPrice(p)
                      setFixResult(generateFixOrderTicket({ symbol: fixSymbol, quantity: fixQuantity, price: p, side: fixSide }))
                    }}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: '#fff', padding: '4px', borderRadius: '3px', width: '100%', fontSize: '11px' }}
                  />
                </div>
              </div>

              {/* Formatted FIX Message Payload */}
              <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '3px', border: '1px solid var(--border)', ...monoXs, color: 'var(--t2)', overflowX: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                {fixResult.readableFix}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => copyToClipboard(fixResult.rawFix, 'fix')}
                  style={{ flex: 1, padding: '6px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--t2)', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {copiedText === 'fix' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  <span>{copiedText === 'fix' ? 'COPIED FIX MESSAGE' : 'COPY RAW FIX 4.4'}</span>
                </button>
                <button
                  onClick={() => copyToClipboard(fixResult.csvRow, 'csv')}
                  style={{ flex: 1, padding: '6px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--t2)', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {copiedText === 'csv' ? <Check size={12} color="#10b981" /> : <Download size={12} />}
                  <span>{copiedText === 'csv' ? 'COPIED CSV' : 'EXPORT FOR EMSX / IBKR'}</span>
                </button>
              </div>
            </div>

            {/* EXECUTION MODULE 2: SUPPLY CHAIN ERP INTERCEPTOR */}
            <div style={{ background: 'var(--base)', border: '1px solid var(--border)', borderRadius: '4px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Cpu size={14} color="var(--orange)" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--orange)' }}>2. ENTERPRISE SUPPLY CHAIN ERP INTERCEPTOR</span>
                </div>
                <span className="chip" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--orange)', fontSize: '9px' }}>SAP S/4HANA PO</span>
              </div>

              <div style={{ background: 'var(--surface)', padding: '10px', borderRadius: '3px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px', ...monoSm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--t3)' }}>PO IDENTIFIER:</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{erpResult.summary.poNumber}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--t3)' }}>CRITICAL COMPONENT:</span>
                  <span style={{ color: 'var(--t1)', fontWeight: 700 }}>{erpResult.summary.component}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--t3)' }}>DESTINATION PLANT:</span>
                  <span style={{ color: 'var(--t1)' }}>{erpResult.summary.destinationPlant}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: '4px' }}>
                  <span style={{ color: 'var(--t3)' }}>AVOIDED LINE STOPPAGE LOSS:</span>
                  <span style={{ color: '#10b981', fontWeight: 800 }}>${(erpResult.summary.totalAvoidedLoss / 1e6).toFixed(1)}M USD</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--t3)' }}>EMERGENCY AIR CHARTER COST:</span>
                  <span style={{ color: 'var(--orange)' }}>${(erpResult.summary.emergencyCostUSD / 1e3).toFixed(0)}k USD ({erpResult.summary.roi} ROI)</span>
                </div>
              </div>

              {/* JSON Payload */}
              <div style={{ background: 'rgba(0,0,0,0.4)', padding: '8px', borderRadius: '3px', border: '1px solid var(--border)', ...monoXs, color: 'var(--t3)', height: '100px', overflowY: 'auto' }}>
                <pre style={{ margin: 0 }}>{erpResult.sapJsonString}</pre>
              </div>

              <button
                onClick={() => copyToClipboard(erpResult.sapJsonString, 'sap')}
                style={{ padding: '6px', background: 'rgba(245,158,11,0.15)', border: '1px solid var(--orange)', color: 'var(--orange)', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                {copiedText === 'sap' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                <span>{copiedText === 'sap' ? 'COPIED SAP JSON PAYLOAD' : 'DISPATCH SAP S/4HANA PO WEBHOOK'}</span>
              </button>
            </div>
          </div>

          {/* EXECUTION MODULE 3: LLOYD'S WAR RISK UNDERWRITER */}
          <div style={{ background: 'var(--base)', border: '1px solid var(--border)', borderRadius: '4px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Shield size={14} color="#10b981" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>3. DYNAMIC ACTUARIAL WAR-RISK UNDERWRITING CALCULATOR</span>
              </div>
              <span className="chip" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: '9px' }}>LLOYD'S JWC LISTED AREA</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', ...monoSm }}>
              <div>
                <div style={{ fontSize: '9px', color: 'var(--t3)' }}>VESSEL HULL VALUE ($M USD)</div>
                <input
                  type="number"
                  value={hullValueM}
                  onChange={e => {
                    const v = Number(e.target.value)
                    setHullValueM(v)
                    setUnderwriterResult(calculateWarRiskUnderwritingQuote({ hullValueUSD: v * 1e6, hasNavalEscort }))
                  }}
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: '#fff', padding: '4px 8px', borderRadius: '3px', width: '100%', fontSize: '11px' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '9px', color: 'var(--t3)' }}>NAVAL ESCORT (PROSPERITY GUARDIAN)</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    checked={hasNavalEscort}
                    onChange={e => {
                      setHasNavalEscort(e.target.checked)
                      setUnderwriterResult(calculateWarRiskUnderwritingQuote({ hullValueUSD: hullValueM * 1e6, hasNavalEscort: e.target.checked }))
                    }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--t1)' }}>Active Destroyer Escort (-0.25% discount)</span>
                </label>
              </div>
              <div style={{ background: 'var(--surface)', padding: '6px 10px', borderRadius: '3px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: '9px', color: 'var(--t3)' }}>ACTUARIAL PREMIUM DUE</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#10b981' }}>
                  ${Math.round(underwriterResult.finalPremiumUSD).toLocaleString()} USD
                </div>
                <div style={{ fontSize: '9px', color: 'var(--t3)' }}>
                  Rate: {underwriterResult.finalRatePct.toFixed(3)}% (Saved ${Math.round(underwriterResult.savingsUSD).toLocaleString()})
                </div>
              </div>
            </div>

            {/* Lloyd's Slip Preview */}
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '8px 12px', borderRadius: '3px', border: '1px solid var(--border)', ...monoXs, color: 'var(--t2)', maxHeight: '110px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
              {underwriterResult.lloydsSlipText}
            </div>

            <button
              onClick={() => copyToClipboard(underwriterResult.lloydsSlipText, 'lloyds')}
              style={{ padding: '6px', background: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', color: '#10b981', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              {copiedText === 'lloyds' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
              <span>{copiedText === 'lloyds' ? 'BINDING SLIP COPIED TO CLIPBOARD' : 'GENERATE & BIND LLOYD\'S WAR RISK POLICY SLIP'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
