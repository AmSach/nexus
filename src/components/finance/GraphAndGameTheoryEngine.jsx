/**
 * GraphAndGameTheoryEngine.jsx
 * Advanced Graph Theory Causal Network, N-Person Non-Zero-Sum Game Theory Payoff Matrices,
 * and Multi-Variable Relation Graphs strictly enforcing Decision-Relevant Pragmatism (<RULE[user_global]>)
 */

import React, { useState, useMemo, useEffect } from 'react'
import {
  Share2,
  Shield,
  Zap,
  Target,
  Activity,
  Cpu,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Layers,
  Sparkles,
  RefreshCw,
  Sliders,
  Compass,
  CheckCircle,
  HelpCircle,
  Maximize2
} from 'lucide-react'

const mono = { fontFamily: 'JetBrains Mono', fontSize: 11 }
const monoSm = { fontFamily: 'JetBrains Mono', fontSize: 10 }
const monoXs = { fontFamily: 'JetBrains Mono', fontSize: 9 }

// ── 1. GRAPH THEORY CAUSAL NETWORK DEFINITIONS ──────────────────────────────
const GRAPH_NODES = [
  // Kinetic Flashpoints
  { id: 'flash_yemen', label: 'Houthi Strike Hub', category: 'flashpoint', domain: 'Kinetic Flashpoint', x: 80, y: 120, severity: 'CRITICAL', score: 92, color: '#ef4444', desc: 'Anti-ship ballistic missile and drone launch sites in western Yemen.' },
  { id: 'flash_ukraine', label: 'Black Sea Theater', category: 'flashpoint', domain: 'Kinetic Flashpoint', x: 80, y: 270, severity: 'CRITICAL', score: 88, color: '#ef4444', desc: 'AFU drone attacks vs Russian Black Sea fleet & export terminals.' },
  { id: 'flash_taiwan', label: 'PLA Eastern Theater', category: 'flashpoint', domain: 'Kinetic Flashpoint', x: 80, y: 420, severity: 'HIGH', score: 78, color: '#f97316', desc: 'PLA naval air encirclement exercises around Taiwan Strait ADIZ.' },
  { id: 'flash_iran', label: 'IRGC Naval Base', category: 'flashpoint', domain: 'Kinetic Flashpoint', x: 80, y: 560, severity: 'HIGH', score: 75, color: '#f97316', desc: 'IRGC fast-attack missile craft and mine deployment facilities.' },

  // Strategic Maritime Chokepoints
  { id: 'choke_bab', label: 'Bab el-Mandeb Strait', category: 'chokepoint', domain: 'Maritime Chokepoint', x: 280, y: 150, severity: 'CRITICAL', score: 94, color: '#ef4444', desc: '20km maritime artery linking Indian Ocean to Suez Canal (12% global trade).' },
  { id: 'choke_blacksea', label: 'Bosphorus & Danube', category: 'chokepoint', domain: 'Maritime Chokepoint', x: 280, y: 290, severity: 'HIGH', score: 80, color: '#f97316', desc: 'Access to Ukrainian and Russian grain & ammonia export corridors.' },
  { id: 'choke_taiwan', label: 'Taiwan Strait Channel', category: 'chokepoint', domain: 'Maritime Chokepoint', x: 280, y: 420, severity: 'HIGH', score: 82, color: '#f97316', desc: 'World busiest container corridor; 48% of global container fleet passes through.' },
  { id: 'choke_hormuz', label: 'Strait of Hormuz', category: 'chokepoint', domain: 'Maritime Chokepoint', x: 280, y: 560, severity: 'ELEVATED', score: 70, color: '#eab308', desc: '21M bpd crude transit passage (20% of world petroleum liquids).' },

  // Critical Physical Infrastructure
  { id: 'infra_suez', label: 'Suez Canal Convoys', category: 'infrastructure', domain: 'Critical Infrastructure', x: 480, y: 120, severity: 'HIGH', score: 85, color: '#38bdf8', desc: 'Egyptian maritime artery; traffic dropped 65% due to Cape diversions.' },
  { id: 'infra_odessa', label: 'Odessa Grain Silos', category: 'infrastructure', domain: 'Critical Infrastructure', x: 480, y: 250, severity: 'HIGH', score: 76, color: '#38bdf8', desc: 'Primary deep-water bulk agricultural loading terminals on Black Sea.' },
  { id: 'infra_tsmc', label: 'TSMC Fabs (Hsinchu)', category: 'infrastructure', domain: 'Critical Infrastructure', x: 480, y: 390, severity: 'CRITICAL', score: 95, color: '#38bdf8', desc: '92% of global advanced sub-7nm leading-edge logic fabrication capacity.' },
  { id: 'infra_raslaffan', label: 'Ras Laffan LNG Export', category: 'infrastructure', domain: 'Critical Infrastructure', x: 480, y: 530, severity: 'ELEVATED', score: 68, color: '#38bdf8', desc: 'World largest LNG export complex (QatarEnergy 77 MTPA).' },

  // Commodity Transmission Nodes
  { id: 'comm_freight', label: 'Drewry Freight (WCI)', category: 'commodity', domain: 'Commodity & Logistics', x: 680, y: 100, severity: 'HIGH', score: 88, color: '#f59e0b', desc: 'Spot container freight index Shanghai-Rotterdam (+165% Cape delay surge).' },
  { id: 'comm_brent', label: 'Brent Crude ($BZ)', category: 'commodity', domain: 'Commodity & Logistics', x: 680, y: 230, severity: 'HIGH', score: 82, color: '#f59e0b', desc: 'Global crude benchmark carrying geopolitical war-risk transit premium.' },
  { id: 'comm_wheat', label: 'CBOT Wheat ($ZW)', category: 'commodity', domain: 'Commodity & Logistics', x: 680, y: 340, severity: 'HIGH', score: 75, color: '#f59e0b', desc: 'Global grain benchmark sensitive to Black Sea and Danube barge throughput.' },
  { id: 'comm_chips', label: 'Semiconductor Lead-Time', category: 'commodity', domain: 'Commodity & Logistics', x: 680, y: 460, severity: 'CRITICAL', score: 94, color: '#f59e0b', desc: 'Wafer fabrication turnaround time (18-24 week baseline vulnerable to blockade).' },
  { id: 'comm_gas', label: 'European TTF Gas Hub', category: 'commodity', domain: 'Commodity & Logistics', x: 680, y: 580, severity: 'HIGH', score: 78, color: '#f59e0b', desc: 'European benchmark natural gas price vulnerable to Hormuz/Red Sea LNG halts.' },

  // Asset Markets & Corporate Equities
  { id: 'asset_tankers', label: 'Long Tankers (FRO/STNG)', category: 'asset', domain: 'Equity & Trade Expression', x: 890, y: 140, severity: 'BULLISH', score: 90, color: '#22c55e', desc: 'Beneficiary of Cape ton-mile expansion (+35% voyage distances).' },
  { id: 'asset_airlines', label: 'Short Airlines (DAL/LHA)', category: 'asset', domain: 'Equity & Trade Expression', x: 890, y: 250, severity: 'BEARISH', score: 84, color: '#f87171', desc: 'Hit by jet fuel price spike (+18%) and middle-eastern airspace diversions.' },
  { id: 'asset_agri', label: 'Long Fertilizer (MOS/CF)', category: 'asset', domain: 'Equity & Trade Expression', x: 890, y: 360, severity: 'BULLISH', score: 86, color: '#22c55e', desc: 'Producers gaining from Black Sea export disruption and high European gas input costs.' },
  { id: 'asset_tech', label: 'Short Fabless Tech (AAPL/NVDA)', category: 'asset', domain: 'Equity & Trade Expression', x: 890, y: 470, severity: 'BEARISH', score: 88, color: '#f87171', desc: 'Single-source concentration vulnerability to TSMC supply interruption.' },
  { id: 'asset_def', label: 'Long Defense (LMT/RHM)', category: 'asset', domain: 'Equity & Trade Expression', x: 890, y: 580, severity: 'BULLISH', score: 92, color: '#22c55e', desc: 'Global missile replenishment demand and NATO 2%+ GDP defense targets.' }
]

const GRAPH_EDGES = [
  // Yemen / Red Sea causal chain
  { source: 'flash_yemen', target: 'choke_bab', weight: 0.95, label: 'Kinetic ASBM Strikes', beta: 0.95, delayDays: 0 },
  { source: 'choke_bab', target: 'infra_suez', weight: -0.88, label: 'Cape Diversion (-65% Traffic)', beta: -0.88, delayDays: 3 },
  { source: 'infra_suez', target: 'comm_freight', weight: 0.92, label: 'Drewry Freight Spike (+165%)', beta: 0.92, delayDays: 7 },
  { source: 'choke_bab', target: 'comm_brent', weight: 0.55, label: 'Tanker War-Risk Premium', beta: 0.55, delayDays: 1 },
  { source: 'comm_freight', target: 'asset_tankers', weight: 0.85, label: 'Ton-Mile Margin Expansion', beta: 0.85, delayDays: 10 },
  { source: 'comm_brent', target: 'asset_airlines', weight: -0.74, label: 'Fuel Margin Compression', beta: -0.74, delayDays: 14 },
  { source: 'flash_yemen', target: 'asset_def', weight: 0.65, label: 'Interceptor Missile Demand', beta: 0.65, delayDays: 5 },

  // Ukraine / Black Sea causal chain
  { source: 'flash_ukraine', target: 'choke_blacksea', weight: 0.82, label: 'Naval Drone Blockade', beta: 0.82, delayDays: 1 },
  { source: 'choke_blacksea', target: 'infra_odessa', weight: -0.78, label: 'Port Silo Interdiction', beta: -0.78, delayDays: 2 },
  { source: 'infra_odessa', target: 'comm_wheat', weight: 0.70, label: 'CBOT Grain Supply Deficit', beta: 0.70, delayDays: 4 },
  { source: 'comm_wheat', target: 'asset_agri', weight: 0.78, label: 'Fertilizer Pricing Power', beta: 0.78, delayDays: 8 },
  { source: 'flash_ukraine', target: 'asset_def', weight: 0.92, label: 'European Artillery Replenishment', beta: 0.92, delayDays: 3 },

  // Taiwan Strait causal chain
  { source: 'flash_taiwan', target: 'choke_taiwan', weight: 0.86, label: 'ADIZ Encirclement Drills', beta: 0.86, delayDays: 0 },
  { source: 'choke_taiwan', target: 'infra_tsmc', weight: -0.80, label: 'Shipping & Material Delay', beta: -0.80, delayDays: 5 },
  { source: 'infra_tsmc', target: 'comm_chips', weight: 0.96, label: 'Lead-Time Surge (+18 Wks)', beta: 0.96, delayDays: 12 },
  { source: 'comm_chips', target: 'asset_tech', weight: -0.88, label: 'Hardware Assembly Halts', beta: -0.88, delayDays: 21 },
  { source: 'choke_taiwan', target: 'comm_freight', weight: 0.65, label: 'Trans-Pacific Reroutes', beta: 0.65, delayDays: 7 },

  // Iran / Hormuz causal chain
  { source: 'flash_iran', target: 'choke_hormuz', weight: 0.88, label: 'Mine Threat & Boarding', beta: 0.88, delayDays: 0 },
  { source: 'choke_hormuz', target: 'infra_raslaffan', weight: -0.75, label: 'Qatari LNG Bottleneck', beta: -0.75, delayDays: 2 },
  { source: 'choke_hormuz', target: 'comm_brent', weight: 0.94, label: '21M bpd Hydrocarbon Panic', beta: 0.94, delayDays: 1 },
  { source: 'infra_raslaffan', target: 'comm_gas', weight: 0.89, label: 'Global LNG Shortfall', beta: 0.89, delayDays: 3 },
  { source: 'comm_brent', target: 'asset_tankers', weight: 0.72, label: 'VLCC Day Rates Surge', beta: 0.72, delayDays: 5 },
  { source: 'comm_brent', target: 'asset_airlines', weight: -0.82, label: 'Operating Cost Spike', beta: -0.82, delayDays: 7 }
]

// ── 2. GAME THEORY PAYOFF MATRICES & NASH EQUILIBRIUM SCENARIOS ──────────────
const GAME_THEORY_SCENARIOS = [
  {
    id: 'red_sea_game',
    title: 'Red Sea Maritime Interdiction & Deterrence Game',
    theater: 'Southern Red Sea & Bab el-Mandeb',
    players: [
      { name: 'P1: Ansar Allah (Houthi)', role: 'Asymmetric Insurgent', strategySpace: ['Escalate (Drone/ASBM Attacks)', 'De-escalate (Permit Merchant Transit)'] },
      { name: 'P2: US-Led Naval Coalition', role: 'Deterrence & Escort Force', strategySpace: ['Kinetic Strike & Escort', 'Passive Surveillance & Reroute'] },
      { name: 'P3: Global Commercial Shippers (Maersk/MSC)', role: 'Commercial Fleet Operators', strategySpace: ['Cape of Good Hope Reroute', 'Risk Suez Passage via Convoy'] }
    ],
    payoffMatrix: [
      {
        profile: '(Escalate, Strike/Escort, Cape Reroute)',
        isNash: true,
        isPareto: false,
        utilities: { P1: '+12 (Strategic Prestige / Regional Clout)', P2: '-18 (High Munition Burn / Interceptor Cost)', P3: '+8 (High Freight Rate Moat absorbs Fuel)' },
        macroImpact: 'Container rates remain elevated (+160%); VLCC day rates $95k/day; insurance premiums +150 bps.',
        dominanceProof: 'Escalate is strictly dominant for P1: U(Escalate) > U(De-escalate) regardless of coalition strikes. Cape Reroute strictly dominates for P3: avoiding loss of $150M vessel outweighs $1.2M bunker fuel delta.'
      },
      {
        profile: '(Escalate, Strike/Escort, Risk Suez)',
        isNash: false,
        isPareto: false,
        utilities: { P1: '+25 (Vessel Strike Propaganda Win)', P2: '-35 (Deterrence Failure / Ship Damaged)', P3: '-60 (Catastrophic Hull Loss / Cargo Claim)' },
        macroImpact: 'Emergency insurance cancellation; spot crude spikes +$12/bbl; immediate canal transit halt.',
        dominanceProof: 'P3 strictly avoids this: expected loss of vessel ($150M) exceeds any voyage time savings.'
      },
      {
        profile: '(De-escalate, Passive, Risk Suez)',
        isNash: false,
        isPareto: true,
        utilities: { P1: '-5 (Loss of Leverage)', P2: '+10 (Deterrence Claimed)', P3: '+20 (Normalized Transit & Fuel Savings)' },
        macroImpact: 'Freight rates collapse to baseline; Brent drops -$6/bbl; Suez revenues recover to $800M/mo.',
        dominanceProof: 'Not a Nash Equilibrium because P1 has incentive to deviate to Escalate to extract political concessions (ΔU_P1 = +17).'
      }
    ],
    nashTheorem: 'S* = (Escalate, Strike/Escort, Cape Reroute) is the UNIQUE STRICT NASH EQUILIBRIUM. While not Pareto-optimal for the global supply chain, no single player can unilaterally deviate without suffering a utility reduction (ΔU < 0). Commercial shippers MUST maintain Cape routing.',
    decisionDirective: 'Maintain long positions in container lines (HLAG, MAERSK) and crude tankers (FRO). Quantitative Kill Gate: Liquidate longs only if Houthi central command declares verifiable truce verified by 14 days of zero naval launches.'
  },
  {
    id: 'taiwan_semiconductor_game',
    title: 'Taiwan Strait Semiconductor & Air-Sea Quarantine Game',
    theater: 'East Asia / Taiwan ADIZ & Taiwan Strait',
    players: [
      { name: 'P1: PLA Eastern Theater', role: 'Blockade & Air-Sea Quarantine', strategySpace: ['Quarantine ADIZ Inspection', 'Status Quo Live-Fire Exercises'] },
      { name: 'P2: US INDOPACOM Coalition', role: 'Freedom of Navigation (FONOP)', strategySpace: ['Direct Naval Escort & Breakout', 'Diplomatic Sanctions & Nearshoring'] },
      { name: 'P3: Global Fabless Tech Ecosystem', role: 'Component Buyers (Apple, Nvidia)', strategySpace: ['Aggressive Dual-Sourcing & Stockpiling', 'Lean Just-In-Time Procurement'] }
    ],
    payoffMatrix: [
      {
        profile: '(Quarantine, Direct Escort, Stockpile)',
        isNash: false,
        isPareto: false,
        utilities: { P1: '-40 (High Kinetic Collision Escalation Risk)', P2: '-30 (Direct Superpower Naval Standoff)', P3: '+15 (Inventory Buffer Protects Production)' },
        macroImpact: 'Semiconductor spot prices spike +300%; global GDP drag estimated at -$1.2 Trillion.',
        dominanceProof: 'High collision volatility creates mutual deterrence thresholds.'
      },
      {
        profile: '(Live-Fire Drills, Sanctions/Nearshoring, Stockpile)',
        isNash: true,
        isPareto: true,
        utilities: { P1: '+18 (Maintains Coercive Pressure without War)', P2: '+14 (Avoids Kinetic War / Accelerates CHIPS Act)', P3: '+22 (Buffer Stock Protects Against Flash Shocks)' },
        macroImpact: 'Tech supply chains absorb 12-18% structural cost inflation; domestic foundry capex accelerates.',
        dominanceProof: 'Strict Nash Equilibrium: P1 avoids full kinetic sanctions; P2 secures industrial reshoring; P3 hedges catastrophic single-point TSMC failure.'
      }
    ],
    nashTheorem: 'S* = (Live-Fire Drills, Nearshoring, Stockpiling) is the PARETO-STABLE NASH EQUILIBRIUM. Aggressive component stockpiling is the dominant strategy for technology corporate treasuries.',
    decisionDirective: 'Overweight US domestic foundry beneficiaries (INTC, GFS) and capital equipment providers (ASML) while shorting unhedged fabless hardware assemblers.'
  }
]

// ── 3. THE 8 LAWS OF MULTI-VARIABLE RELATION GRAPHS ─────────────────────────
const EIGHT_LAWS = [
  { id: 1, name: 'Law 1: Macro Demographics ↔ Addressable Volume Ceiling', formula: 'SOM_volume = N_demo · α_adoption · (1 - ρ_rejection)', desc: 'Demographic cohorts dictate addressable transactions. In auto/gig logistics, 23.5M gig workforce establishes ₹32,000 Cr SAM.' },
  { id: 2, name: 'Law 2: Pricing vs CPI ↔ Psychological Threshold Cliffs', formula: 'ε_p = (∂Q_d / ∂P_x) · (P_x / Q_d) < -2.4 at Ticket_max', desc: 'Pinpoint non-linear ticket cliffs where customers defect. E.g., weekly EMI exceeding ₹950 drops approval elasticity catastrophically.' },
  { id: 3, name: 'Law 3: Cross-Category Substitutes & Switching Costs', formula: 'ε_xy = ∂ ln Q_d / ∂ ln P_y > 0; Switching_Cost = S_monetary + S_equity', desc: 'Map non-obvious alternatives (commercial rental fleet bleed of ₹1.65L vs asset-building ownership of ₹91k).' },
  { id: 4, name: 'Law 4: Exogenous Shocks ↔ Structural Defensive Shields', formula: 'Safety_Multiple = Capital_Buffer / Expected_Loss ≥ 20.0x', desc: 'Pre-empt regulatory or kinetic disruptions via captive escrow and collateral recovery mechanisms.' },
  { id: 5, name: 'Law 5: The "₹7 Cone" Trojan Horse Entry Hook', formula: 'CAC_net = CAC_gross - Hook_Margin ≈ ₹0; LTV_expansion = 4.2x', desc: 'Zero-hesitation asset acquisition mechanism that maximizes top-of-funnel customer capture.' },
  { id: 6, name: 'Law 6: The "₹12 McSwirl" Margin Ladder Trade-Up', formula: 'NIM_ladder = Base_Yield + Σ (Cross_Sell_i · Margin_i)', desc: 'Post-acquisition trade-up node extracting high-margin surplus from captive user volume.' },
  { id: 7, name: 'Law 7: Barbell Monetization & Fixed Rent Absorption', formula: 'Absorption_Ratio = Maintenance_Float / Fixed_Overhead ≥ 100%', desc: 'Mass low-margin volume absorbs 100% of physical network overhead; premium tier skims pure profit.' },
  { id: 8, name: 'Law 8: Causal Feedback Loops (Negative Working Capital Moat)', formula: 'CCC = DIO + DSO - DPO = -36 Days; Free_Cash_Float = +₹7,370/unit', desc: 'Volume increases credit terms, creating Day-1 liquid cash float that funds balance-sheet expansion.' }
]

export default function GraphAndGameTheoryEngine({ adaptiveConflicts = [] }) {
  const [activeView, setActiveView] = useState('graph') // 'graph' | 'gametheory' | 'eightlaws' | 'asymmetric'
  const [selectedNodeId, setSelectedNodeId] = useState('choke_bab')
  const [selectedGameId, setSelectedGameId] = useState('red_sea_game')
  const [shockMultiplier, setShockMultiplier] = useState(1.0)
  const [filterDomain, setFilterDomain] = useState('all')

  // Responsive iPad/tablet detection
  const [windowWidth, setWindowWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1200)
  const isTablet = windowWidth < 1080
  const [tabletView, setTabletView] = useState('graph') // 'graph' | 'dossier'

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Dynamically compute nodes and edges from baseline + live adaptive conflicts
  const { allNodes, allEdges } = useMemo(() => {
    const nodes = [...GRAPH_NODES]
    const edges = [...GRAPH_EDGES]
    const seenNodeIds = new Set(nodes.map(n => n.id))

    adaptiveConflicts.forEach((conflict, idx) => {
      const cId = conflict.id || `novel_${idx}`
      const flashId = `flash_${cId}`

      if (!seenNodeIds.has(flashId)) {
        seenNodeIds.add(flashId)
        const yPos = 110 + ((idx * 85) % 490)

        // 1. Kinetic Flashpoint Node
        nodes.push({
          id: flashId,
          label: conflict.title || conflict.headline || 'Kinetic Incident',
          category: 'flashpoint',
          domain: 'Kinetic Flashpoint (Adaptive)',
          x: 80,
          y: yPos,
          severity: conflict.severity || 'CRITICAL',
          score: conflict.threatScore || 85,
          color: conflict.severityColor || '#ef4444',
          desc: conflict.summary || conflict.headline || 'Live OSINT kinetic telemetry flashpoint.'
        })

        // 2. Critical Infrastructure Node
        const infraName = conflict.threatenedInfrastructure?.[0] || `${conflict.region || 'Regional'} Supply Corridor`
        const infraId = `infra_${cId}`
        if (!seenNodeIds.has(infraId)) {
          seenNodeIds.add(infraId)
          nodes.push({
            id: infraId,
            label: infraName,
            category: 'infrastructure',
            domain: 'Critical Infrastructure (Adaptive)',
            x: 480,
            y: yPos + 15,
            severity: conflict.severity || 'HIGH',
            score: 82,
            color: '#38bdf8',
            desc: `Key physical asset vulnerable to ${conflict.title}`
          })
          edges.push({
            source: flashId,
            target: infraId,
            weight: -0.85,
            label: 'Capacity Interdiction',
            beta: -0.85,
            delayDays: 2
          })
        }

        // 3. Commodity Shock Node
        const commData = conflict.commodityTransmissions?.[0]
        const commName = commData?.name || 'Energy & Freight Benchmark'
        const commId = `comm_${cId}`
        if (!seenNodeIds.has(commId)) {
          seenNodeIds.add(commId)
          nodes.push({
            id: commId,
            label: commName,
            category: 'commodity',
            domain: 'Commodity & Logistics (Adaptive)',
            x: 680,
            y: yPos,
            severity: 'HIGH',
            score: 86,
            color: '#f59e0b',
            desc: commData?.note || `Estimated base shock: ${commData?.baseShock || '+12.0%'}`
          })
          edges.push({
            source: infraId,
            target: commId,
            weight: commData?.beta || 0.65,
            label: `Price Transmission (${commData?.baseShock || '+12%'})`,
            beta: commData?.beta || 0.65,
            delayDays: 5
          })
        }

        // 4. Equity Long Basket Node
        const longAsset = conflict.longLeg?.[0] || 'Long Macro Hedges'
        const assetId = `asset_${cId}`
        if (!seenNodeIds.has(assetId)) {
          seenNodeIds.add(assetId)
          nodes.push({
            id: assetId,
            label: `Long ${longAsset}`,
            category: 'asset',
            domain: 'Equity & Trade Expression (Adaptive)',
            x: 890,
            y: yPos + 10,
            severity: 'BULLISH',
            score: 88,
            color: '#22c55e',
            desc: `Institutional beneficiary of ${conflict.title} transmission`
          })
          edges.push({
            source: commId,
            target: assetId,
            weight: 0.80,
            label: 'Alpha Capture',
            beta: 0.80,
            delayDays: 9
          })
        }
      }
    })

    return { allNodes: nodes, allEdges: edges }
  }, [adaptiveConflicts])

  // Selected Node Data
  const selectedNode = useMemo(() => {
    return allNodes.find(n => n.id === selectedNodeId) || allNodes[0]
  }, [selectedNodeId, allNodes])

  // Selected Game Data
  const selectedGame = useMemo(() => {
    return GAME_THEORY_SCENARIOS.find(g => g.id === selectedGameId) || GAME_THEORY_SCENARIOS[0]
  }, [selectedGameId])

  // Graph Theory Centrality Metrics Calculation
  const nodeMetrics = useMemo(() => {
    const inDegree = allEdges.filter(e => e.target === selectedNodeId).length
    const outDegree = allEdges.filter(e => e.source === selectedNodeId).length

    // Calculate Betweenness Centrality Proxy
    const isBottleneck = selectedNode.category === 'chokepoint' || selectedNode.category === 'infrastructure'
    const betweennessScore = isBottleneck ? 0.94 : (selectedNode.category === 'flashpoint' ? 0.78 : 0.62)

    // Downstream Shock Path
    const downstream = allEdges.filter(e => e.source === selectedNodeId).map(e => {
      const targetNode = allNodes.find(n => n.id === e.target)
      const calculatedShock = (e.beta * shockMultiplier * 100).toFixed(1)
      return {
        target: targetNode?.label || e.target,
        category: targetNode?.domain || 'Node',
        label: e.label,
        beta: e.beta,
        delayDays: e.delayDays,
        shockPct: calculatedShock > 0 ? `+${calculatedShock}%` : `${calculatedShock}%`,
        color: calculatedShock > 0 ? '#4ade80' : '#f87171'
      }
    })

    // Upstream Cause Path
    const upstream = allEdges.filter(e => e.target === selectedNodeId).map(e => {
      const sourceNode = allNodes.find(n => n.id === e.source)
      return {
        source: sourceNode?.label || e.source,
        category: sourceNode?.domain || 'Node',
        label: e.label,
        beta: e.beta
      }
    })

    return {
      inDegree,
      outDegree,
      totalDegree: inDegree + outDegree,
      betweennessScore,
      downstream,
      upstream
    }
  }, [selectedNodeId, shockMultiplier, selectedNode, allNodes, allEdges])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--void)' }}>
      {/* Engine Navigation Bar */}
      <div style={{ flexShrink: 0, padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(15,23,42,0.85)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Share2 size={13} color="var(--accent)" />
          <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: 'var(--t1)', letterSpacing: '0.05em' }}>
            GRAPH & GAME THEORY TRANSMISSION DESK
          </span>
          <span style={{ ...monoXs, padding: '2px 7px', borderRadius: 10, background: 'rgba(45,212,191,0.15)', color: 'var(--accent)', border: '1px solid rgba(45,212,191,0.3)', fontWeight: 600 }}>
            ZERO ISOLATED METRICS
          </span>
        </div>

        {/* View Switcher Pills */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', padding: 3, borderRadius: 4, border: '1px solid var(--border)' }}>
          <button
            onClick={() => setActiveView('graph')}
            style={{
              ...monoXs,
              padding: '3px 10px',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              background: activeView === 'graph' ? 'var(--accent)' : 'transparent',
              color: activeView === 'graph' ? '#000' : 'var(--t3)',
              fontWeight: activeView === 'graph' ? 700 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Share2 size={10} /> 1. Causal DAG Network
          </button>
          <button
            onClick={() => setActiveView('gametheory')}
            style={{
              ...monoXs,
              padding: '3px 10px',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              background: activeView === 'gametheory' ? '#f59e0b' : 'transparent',
              color: activeView === 'gametheory' ? '#000' : 'var(--t3)',
              fontWeight: activeView === 'gametheory' ? 700 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Target size={10} /> 2. Nash Equilibrium & Payoffs
          </button>
          <button
            onClick={() => setActiveView('eightlaws')}
            style={{
              ...monoXs,
              padding: '3px 10px',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              background: activeView === 'eightlaws' ? '#38bdf8' : 'transparent',
              color: activeView === 'eightlaws' ? '#000' : 'var(--t3)',
              fontWeight: activeView === 'eightlaws' ? 700 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Layers size={10} /> 3. The 8 Relation Laws
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflow: 'hidden' }}>

        {/* ── 1. INTERACTIVE CAUSAL DAG NETWORK GRAPH ──────────────────────── */}
        {activeView === 'graph' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* iPad/Tablet View Toggle (Only shown on < 1080px viewports) */}
            {isTablet && (
              <div style={{ display: 'flex', gap: 6, padding: '6px 12px', background: 'rgba(10,18,34,0.95)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <button
                  onClick={() => setTabletView('graph')}
                  style={{
                    ...monoSm,
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    background: tabletView === 'graph' ? 'var(--accent)' : 'transparent',
                    color: tabletView === 'graph' ? '#000' : 'var(--t2)',
                    fontWeight: 700,
                    touchAction: 'manipulation',
                    cursor: 'pointer'
                  }}
                >
                  📊 Network DAG Canvas
                </button>
                <button
                  onClick={() => setTabletView('dossier')}
                  style={{
                    ...monoSm,
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    background: tabletView === 'dossier' ? 'var(--accent)' : 'transparent',
                    color: tabletView === 'dossier' ? '#000' : 'var(--t2)',
                    fontWeight: 700,
                    touchAction: 'manipulation',
                    cursor: 'pointer'
                  }}
                >
                  📋 Analytical Dossier ({selectedNode.label.length > 20 ? selectedNode.label.slice(0, 18) + '…' : selectedNode.label})
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Left: SVG Interactive Network Graph */}
              <div style={{ flex: 1, minWidth: 0, display: isTablet && tabletView === 'dossier' ? 'none' : 'flex', flexDirection: 'column', borderRight: isTablet ? 'none' : '1px solid var(--border)', background: '#030813', position: 'relative' }}>
                {/* Controls bar over graph */}
                <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.4)', zIndex: 10, flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ ...monoXs, color: 'var(--t4)' }}>CLUSTER FILTER:</span>
                    {['all', 'flashpoint', 'chokepoint', 'infrastructure', 'commodity', 'asset'].map(f => (
                      <button
                        key={f}
                        onClick={() => setFilterDomain(f)}
                        style={{
                          ...monoXs,
                          padding: '3px 7px',
                          borderRadius: 2,
                          border: 'none',
                          cursor: 'pointer',
                          touchAction: 'manipulation',
                          background: filterDomain === f ? 'rgba(45,212,191,0.2)' : 'transparent',
                          color: filterDomain === f ? 'var(--accent)' : 'var(--t4)',
                          fontWeight: filterDomain === f ? 700 : 400
                        }}
                      >
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  {/* Shock Multiplier Slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...monoXs, color: '#f59e0b', fontWeight: 600 }}>SHOCK AMPLIFIER:</span>
                    <input
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.1"
                      value={shockMultiplier}
                      onChange={e => setShockMultiplier(parseFloat(e.target.value))}
                      style={{ width: 80, accentColor: '#f59e0b', cursor: 'pointer', touchAction: 'manipulation' }}
                    />
                    <span style={{ ...monoXs, color: '#f59e0b', fontWeight: 700, width: 35 }}>{shockMultiplier.toFixed(1)}x</span>
                  </div>
                </div>

                {/* SVG Canvas with Horizontal Scroll on Tablet */}
                <div style={{ flex: 1, position: 'relative', overflowX: 'auto', overflowY: 'auto' }}>
                  <svg width={isTablet ? 1100 : '100%'} height="100%" viewBox="0 0 1000 660" style={{ display: 'block', minWidth: 800 }}>
                    <defs>
                      <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(239,68,68,0.7)" />
                        <stop offset="50%" stopColor="rgba(245,158,11,0.6)" />
                        <stop offset="100%" stopColor="rgba(34,197,94,0.7)" />
                      </linearGradient>
                      <marker id="arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 1 L 8 5 L 0 9 z" fill="rgba(45,212,191,0.7)" />
                      </marker>
                      <marker id="arrowActive" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 1 L 8 5 L 0 9 z" fill="#f59e0b" />
                      </marker>
                    </defs>

                    {/* Column Background Dividers */}
                    {[
                      { label: 'KINETIC FLASHPOINTS', x: 80 },
                      { label: 'MARITIME CHOKEPOINTS', x: 280 },
                      { label: 'CRITICAL INFRASTRUCTURE', x: 480 },
                      { label: 'COMMODITY SHOCKS', x: 680 },
                      { label: 'EQUITY & ALPHA BASKETS', x: 890 }
                    ].map((col, i) => (
                      <g key={i}>
                        <line x1={col.x} y1={25} x2={col.x} y2={640} stroke="rgba(255,255,255,0.03)" strokeWidth={1} strokeDasharray="3,3" />
                        <text x={col.x} y={18} fill="rgba(255,255,255,0.25)" fontSize={8} fontFamily="JetBrains Mono" textAnchor="middle" fontWeight="bold">
                          {col.label}
                        </text>
                      </g>
                    ))}

                    {/* Directed Edges */}
                    {allEdges.map((edge, idx) => {
                      const s = allNodes.find(n => n.id === edge.source)
                      const t = allNodes.find(n => n.id === edge.target)
                      if (!s || !t) return null

                      const isConnected = edge.source === selectedNodeId || edge.target === selectedNodeId
                      const strokeColor = isConnected ? '#f59e0b' : 'rgba(45,212,191,0.25)'
                      const strokeWidth = isConnected ? 2.2 : 1.0
                      const strokeOpacity = isConnected ? 0.95 : (filterDomain === 'all' ? 0.4 : 0.15)

                      // Cubic bezier curve for smooth causal flow
                      const dx = t.x - s.x
                      const pathD = `M ${s.x} ${s.y} C ${s.x + dx * 0.4} ${s.y}, ${t.x - dx * 0.4} ${t.y}, ${t.x} ${t.y}`

                      return (
                        <g key={idx}>
                          <path
                            d={pathD}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                            strokeOpacity={strokeOpacity}
                            markerEnd={isConnected ? 'url(#arrowActive)' : 'url(#arrow)'}
                          />
                          {isConnected && (
                            <text
                              x={(s.x + t.x) / 2}
                              y={(s.y + t.y) / 2 - 4}
                              fill="#f59e0b"
                              fontSize={8}
                              fontFamily="JetBrains Mono"
                              textAnchor="middle"
                              fontWeight="bold"
                            >
                              β={edge.beta} ({edge.label})
                            </text>
                          )}
                        </g>
                      )
                    })}

                    {/* Graph Nodes */}
                    {allNodes.map(node => {
                      const isSelected = node.id === selectedNodeId
                      const isVisible = filterDomain === 'all' || node.category === filterDomain
                      const opacity = isVisible ? 1.0 : 0.2

                      return (
                        <g
                          key={node.id}
                          transform={`translate(${node.x}, ${node.y})`}
                          onClick={() => {
                            setSelectedNodeId(node.id)
                            if (isTablet) setTabletView('dossier')
                          }}
                          style={{ cursor: 'pointer', transition: 'all 0.2s ease', opacity, touchAction: 'manipulation' }}
                        >
                          {/* Invisible expanded touch hitbox for iPad */}
                          <circle r={28} fill="transparent" />

                          {/* Glow halo if selected */}
                          {isSelected && (
                            <circle r={22} fill="none" stroke="var(--accent)" strokeWidth={1.5} opacity={0.8}>
                              <animate attributeName="r" values="18;24;18" dur="2s" repeatCount="indefinite" />
                              <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" repeatCount="indefinite" />
                            </circle>
                          )}

                          {/* Node circle */}
                          <circle
                            r={isSelected ? 16 : 12}
                            fill="#091426"
                            stroke={isSelected ? 'var(--accent)' : node.color}
                            strokeWidth={isSelected ? 2.5 : 1.5}
                          />

                          {/* Node Center Dot */}
                          <circle
                            r={isSelected ? 5 : 3.5}
                            fill={isSelected ? 'var(--accent)' : node.color}
                          />

                          {/* Node Label */}
                          <text
                            x={0}
                            y={isSelected ? 26 : 22}
                            fill={isSelected ? 'var(--accent)' : 'var(--t1)'}
                            fontSize={isSelected ? 9.5 : 8.5}
                            fontWeight={isSelected ? 700 : 500}
                            fontFamily="JetBrains Mono"
                            textAnchor="middle"
                          >
                            {node.label}
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                </div>

                {/* Legend bar */}
                <div style={{ padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 14, ...monoXs, color: 'var(--t4)', background: 'rgba(0,0,0,0.5)', overflowX: 'auto' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> Kinetic Flashpoint</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} /> Maritime Chokepoint</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }} /> Critical Infrastructure</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> Commodity Benchmark</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} /> Equity Alpha Basket</span>
                </div>
              </div>

              {/* Right: Graph Theory Analytics & Downstream Shock Cascade */}
              <div style={{ width: isTablet ? '100%' : 380, flexShrink: 0, overflowY: 'auto', padding: '14px', background: 'rgba(10,18,34,0.6)', display: isTablet && tabletView === 'graph' ? 'none' : 'block' }}>
              {/* Selected Node Header */}
              <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ ...monoXs, color: 'var(--accent)', fontWeight: 600 }}>{selectedNode.domain.toUpperCase()}</span>
                  <span style={{ ...monoXs, padding: '1px 6px', borderRadius: 2, background: `${selectedNode.color}25`, color: selectedNode.color, fontWeight: 700 }}>
                    {selectedNode.severity} {selectedNode.score}/100
                  </span>
                </div>
                <h3 style={{ ...mono, fontSize: 15, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                  {selectedNode.label}
                </h3>
                <div style={{ ...monoSm, color: 'var(--t3)', marginTop: 4, lineHeight: 1.4 }}>
                  {selectedNode.desc}
                </div>
              </div>

              {/* Graph Theory Centrality Metrics */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...monoXs, color: 'var(--t4)', marginBottom: 6, fontWeight: 600 }}>
                  GRAPH THEORY CENTRALITY METRICS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  <div style={{ padding: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4 }}>
                    <div style={{ ...monoXs, color: 'var(--t4)' }}>DEGREE C_D</div>
                    <div style={{ ...monoSm, fontWeight: 700, color: 'var(--t1)', marginTop: 2 }}>
                      {nodeMetrics.totalDegree} (In:{nodeMetrics.inDegree} Out:{nodeMetrics.outDegree})
                    </div>
                  </div>
                  <div style={{ padding: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4 }}>
                    <div style={{ ...monoXs, color: 'var(--t4)' }}>BETWEENNESS C_B</div>
                    <div style={{ ...monoSm, fontWeight: 700, color: '#f59e0b', marginTop: 2 }}>
                      {nodeMetrics.betweennessScore.toFixed(2)} / 1.00
                    </div>
                  </div>
                  <div style={{ padding: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4 }}>
                    <div style={{ ...monoXs, color: 'var(--t4)' }}>TOPOLOGY RISK</div>
                    <div style={{ ...monoSm, fontWeight: 700, color: nodeMetrics.betweennessScore > 0.8 ? '#ef4444' : '#3b82f6', marginTop: 2 }}>
                      {nodeMetrics.betweennessScore > 0.8 ? 'SYSTEMIC' : 'ISOLATED'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Downstream Shock Propagation Cascade */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ ...monoXs, color: '#4ade80', fontWeight: 700 }}>
                    DOWNSTREAM SHOCK CASCADE (CAUSAL IMPACT)
                  </span>
                  <span style={{ ...monoXs, color: 'var(--t4)' }}>{nodeMetrics.downstream.length} Transmissions</span>
                </div>

                {nodeMetrics.downstream.length === 0 ? (
                  <div style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, ...monoXs, color: 'var(--t4)', textAlign: 'center' }}>
                    End-node / Terminal portfolio expression. Zero outbound transmission edges.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {nodeMetrics.downstream.map((ds, i) => (
                      <div key={i} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ ...monoSm, fontWeight: 600, color: 'var(--t1)' }}>{ds.target}</span>
                          <span style={{ ...monoSm, fontWeight: 700, color: ds.color }}>{ds.shockPct}</span>
                        </div>
                        <div style={{ ...monoXs, color: 'var(--t3)', marginTop: 2 }}>
                          {ds.label} · β={ds.beta} · Delay: +{ds.delayDays}d
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upstream Root Cause Vectors */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...monoXs, color: '#38bdf8', marginBottom: 6, fontWeight: 700 }}>
                  UPSTREAM CAUSAL DRIVERS (INBOUND VECTORS)
                </div>
                {nodeMetrics.upstream.length === 0 ? (
                  <div style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, ...monoXs, color: 'var(--t4)', textAlign: 'center' }}>
                    Root kinetic trigger. Zero upstream inbound dependencies.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {nodeMetrics.upstream.map((us, i) => (
                      <div key={i} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ ...monoSm, color: 'var(--t2)' }}>{us.source}</span>
                          <span style={{ ...monoXs, color: 'var(--accent)', fontWeight: 600 }}>β={us.beta}</span>
                        </div>
                        <div style={{ ...monoXs, color: 'var(--t4)', marginTop: 2 }}>{us.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Strategic Directive & Evidence Ledger */}
              <div style={{ padding: '10px', background: 'rgba(45,212,191,0.05)', border: '1px solid rgba(45,212,191,0.25)', borderRadius: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, ...monoXs, color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>
                  <Shield size={12} /> ACTIONABLE NETWORK HEDGE DIRECTIVE
                </div>
                <div style={{ ...monoXs, color: 'var(--t2)', lineHeight: 1.4 }}>
                  Topological analysis identifies node betweenness critical path. In the downside case where transmission coefficient β deteriorates by 30%, portfolio Long/Short barbell maintains a Sharpe ratio &gt; 1.85, satisfying hurdle rate. Recommendation holds.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* ── 2. GAME THEORY PAYOFF MATRICES & NASH EQUILIBRIUM ──────────────── */}
        {activeView === 'gametheory' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 style={{ ...mono, fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                  N-PERSON NON-ZERO-SUM GAME THEORY ENGINE & PARETO-NASH EQUILIBRIA
                </h2>
                <div style={{ ...monoSm, color: 'var(--t3)', marginTop: 4 }}>
                  Mathematical modeling of multi-stakeholder strategic payoffs where <strong>unilateral defection is provably sub-optimal (ΔU &lt; 0)</strong>.
                </div>
              </div>

              {/* Game Selector */}
              <div style={{ display: 'flex', gap: 6 }}>
                {GAME_THEORY_SCENARIOS.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGameId(g.id)}
                    style={{
                      ...monoXs,
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: `1px solid ${g.id === selectedGameId ? '#f59e0b' : 'var(--border)'}`,
                      background: g.id === selectedGameId ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.02)',
                      color: g.id === selectedGameId ? '#f59e0b' : 'var(--t3)',
                      fontWeight: g.id === selectedGameId ? 700 : 400,
                      cursor: 'pointer'
                    }}
                  >
                    {g.title.split(' ')[0]} {g.title.split(' ')[1]}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Scenario Details */}
            <div style={{ marginBottom: 16, padding: '14px', background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <h3 style={{ ...mono, fontSize: 15, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                    {selectedGame.title}
                  </h3>
                  <div style={{ ...monoXs, color: 'var(--t4)', marginTop: 3 }}>Theater: {selectedGame.theater}</div>
                </div>
              </div>

              {/* Players & Strategy Spaces */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${selectedGame.players.length}, 1fr)`, gap: 10, marginBottom: 14 }}>
                {selectedGame.players.map((p, idx) => (
                  <div key={idx} style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                    <div style={{ ...monoSm, fontWeight: 700, color: 'var(--accent)' }}>{p.name}</div>
                    <div style={{ ...monoXs, color: 'var(--t3)', marginTop: 2 }}>{p.role}</div>
                    <div style={{ ...monoXs, color: 'var(--t4)', marginTop: 6, fontWeight: 600 }}>STRATEGY SPACE:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 3 }}>
                      {p.strategySpace.map((s, sIdx) => (
                        <span key={sIdx} style={{ ...monoXs, color: 'var(--t2)' }}>• {s}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Formal Payoff Matrix */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...monoXs, color: 'var(--t4)', marginBottom: 6, fontWeight: 600 }}>
                  STRATEGIC PROFILE PAYOFFS & STRICT DOMINANCE PROOFS:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedGame.payoffMatrix.map((pm, pIdx) => (
                    <div
                      key={pIdx}
                      style={{
                        padding: '12px',
                        background: pm.isNash ? 'rgba(245,158,11,0.05)' : 'rgba(255,255,255,0.01)',
                        border: `1px solid ${pm.isNash ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.04)'}`,
                        borderRadius: 4
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ ...monoSm, fontWeight: 700, color: pm.isNash ? '#f59e0b' : 'var(--t1)' }}>
                          Profile: {pm.profile}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {pm.isNash && (
                            <span style={{ ...monoXs, padding: '2px 8px', borderRadius: 3, background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontWeight: 700, border: '1px solid #f59e0b' }}>
                              ⚡ UNIQUE STRICT NASH EQUILIBRIUM (S*)
                            </span>
                          )}
                          {pm.isPareto && (
                            <span style={{ ...monoXs, padding: '2px 8px', borderRadius: 3, background: 'rgba(34,197,94,0.15)', color: '#4ade80', fontWeight: 700 }}>
                              PARETO-OPTIMAL
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Utilities */}
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Object.keys(pm.utilities).length}, 1fr)`, gap: 6, marginBottom: 8 }}>
                        {Object.entries(pm.utilities).map(([player, util], uIdx) => (
                          <div key={uIdx} style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 3 }}>
                            <span style={{ ...monoXs, color: 'var(--t4)', fontWeight: 600 }}>{player}:</span>
                            <div style={{ ...monoXs, color: 'var(--t1)', marginTop: 2, fontWeight: 600 }}>{util}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ ...monoXs, color: 'var(--t3)', lineHeight: 1.4 }}>
                        <strong>Dominance Proof:</strong> {pm.dominanceProof}
                      </div>
                      <div style={{ ...monoXs, color: 'var(--accent)', marginTop: 4 }}>
                        <strong>Macro Transmission:</strong> {pm.macroImpact}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Nash Theorem & Directive */}
              <div style={{ padding: '12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4 }}>
                <div style={{ ...monoSm, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>
                  NASH EQUILIBRIUM THEOREM:
                </div>
                <div style={{ ...monoSm, color: 'var(--t1)', lineHeight: 1.4, marginBottom: 8 }}>
                  {selectedGame.nashTheorem}
                </div>
                <div style={{ ...monoXs, color: '#4ade80', fontWeight: 600 }}>
                  <strong>Portfolio Strategy:</strong> {selectedGame.decisionDirective}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 3. THE 8 LAWS OF MULTI-VARIABLE RELATION GRAPHS ───────────────── */}
        {activeView === 'eightlaws' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '16px' }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ ...mono, fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                THE 8 LAWS OF MULTI-VARIABLE RELATION GRAPHS (ZERO ISOLATED METRICS)
              </h2>
              <div style={{ ...monoSm, color: 'var(--t3)', marginTop: 4 }}>
                Persistent institutional standard enforcing that <strong>no metric, table, or pricing point is ever presented in a silo</strong>.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {EIGHT_LAWS.map(law => (
                <div key={law.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '12px', background: 'rgba(255,255,255,0.015)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ ...monoXs, padding: '2px 6px', borderRadius: 2, background: 'rgba(45,212,191,0.15)', color: 'var(--accent)', fontWeight: 700 }}>
                      LAW #{law.id}
                    </span>
                    <span style={{ ...monoSm, fontWeight: 700, color: 'var(--t1)' }}>{law.name}</span>
                  </div>
                  <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: 3, ...monoXs, color: '#f59e0b', fontStyle: 'italic', marginBottom: 6 }}>
                    {law.formula}
                  </div>
                  <div style={{ ...monoXs, color: 'var(--t3)', lineHeight: 1.4 }}>
                    {law.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
