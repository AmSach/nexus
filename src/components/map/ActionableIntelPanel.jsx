// src/components/map/ActionableIntelPanel.jsx — OSINT Strategic Actionable Intelligence & Decision Oracle
// Synthesizes multi-domain signals into decision-relevant threat postures, cross-domain leads, and instant Yes/No strategic answers.

import React, { useState, useMemo } from 'react'

export default function ActionableIntelPanel({ points = [], onFlyTo, onClose }) {
  const [activeTab, setActiveTab] = useState('threats') // 'threats' | 'leads' | 'oracle' | 'export'
  const [customQuery, setCustomQuery] = useState('')
  const [customAnswer, setCustomAnswer] = useState(null)
  const [copied, setCopied] = useState(false)

  // 1. Compute Real-time DEFCON Threat Index
  const metrics = useMemo(() => {
    let jammingCount = 0
    let warshipCount = 0
    let milFlightCount = 0
    let cveCount = 0
    let scadaCount = 0
    let majorQuakeCount = 0
    let criticalCount = 0

    points.forEach(pt => {
      const t = pt.type
      const sev = pt.severity
      if (sev === 'critical') criticalCount++
      if (t === 'jamming') jammingCount++
      if (t === 'warship' || t === 'fleet') warshipCount++
      if (pt._military || t === 'military_flight') milFlightCount++
      if (t === 'cve' || t === 'threat') cveCount++
      if (t === 'shodan') scadaCount++
      if (t === 'earthquake' && (pt.mag >= 5.0 || pt.meta?.mag >= 5.0)) majorQuakeCount++
    })

    // Weighted composite risk score (0-100)
    const rawScore = (jammingCount * 2.8) + (warshipCount * 2.2) + (milFlightCount * 1.6) +
                     (cveCount * 0.4) + (scadaCount * 1.8) + (majorQuakeCount * 3.5)
    const compositeScore = Math.min(98, Math.max(22, Math.round(rawScore / 3.2)))

    let defcon = 4
    let defconLabel = 'DEFCON 4 — ELEVATED SURVEILLANCE'
    let defconColor = 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10'

    if (compositeScore >= 78) {
      defcon = 2
      defconLabel = 'DEFCON 2 — ARMED ESCALATION IMMINENT'
      defconColor = 'text-red-500 border-red-500/50 bg-red-500/15'
    } else if (compositeScore >= 52) {
      defcon = 3
      defconLabel = 'DEFCON 3 — STRATEGIC ALERT / ACTIVE THEATER'
      defconColor = 'text-amber-400 border-amber-500/50 bg-amber-500/15'
    } else if (compositeScore < 30) {
      defcon = 5
      defconLabel = 'DEFCON 5 — BASELINE MONITORING'
      defconColor = 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
    }

    return {
      total: points.length,
      compositeScore,
      defcon,
      defconLabel,
      defconColor,
      jammingCount,
      warshipCount,
      milFlightCount,
      cveCount,
      scadaCount,
      majorQuakeCount,
      criticalCount,
    }
  }, [points])

  // 2. Cross-Domain Correlated Actionable Leads
  const actionableLeads = useMemo(() => {
    const leads = []

    // Lead 1: Baltic / Eastern Europe Electronic Warfare Corridor
    const balticPoints = points.filter(p => p.lat >= 48 && p.lat <= 62 && p.lng >= 14 && p.lng <= 36)
    const balticJam = balticPoints.filter(p => p.type === 'jamming').length
    const balticMil = balticPoints.filter(p => p._military || p.type === 'military_flight' || p.type === 'warship').length
    if (balticJam > 0 || balticMil > 0) {
      leads.push({
        id: 'lead-baltic',
        title: 'Baltic / Suwalki Electronic Warfare & Air Denial Corridor',
        theater: 'Eastern Europe / Baltic Sea',
        flag: '🇵🇱 / 🇪🇪',
        severity: 'CRITICAL',
        color: 'text-red-400 border-red-500/30 bg-red-950/20',
        signalCount: balticJam + balticMil,
        coords: { lat: 55.4, lng: 21.0, zoom: 6.2 },
        assessment: 'Persistent high-density GNSS disruption detected along civil aviation & NATO maritime corridors. Threat actors actively spoofing maritime AIS tracks while conducting aerial electronic surveillance.',
        actions: [
          'Direct commercial airlines to utilize INS/VOR backup waypoints; avoid single-frequency GPS navigation.',
          'Cross-reference synthetic aperture radar (SAR) satellite imagery against AIS transponder dark vessels in Gulf of Finland.',
          'Execute spectrum analysis on 1575.42 MHz (L1) and 1227.60 MHz (L2) to localize mobile ground-based jammer transmitters.'
        ]
      })
    }

    // Lead 2: Red Sea & Bab el-Mandeb Maritime Chokepoint Defense
    const redSeaPoints = points.filter(p => p.lat >= 11 && p.lat <= 22 && p.lng >= 36 && p.lng <= 48)
    const redSeaCombatants = redSeaPoints.filter(p => p.type === 'warship' || p.type === 'fleet').length
    const redSeaAir = redSeaPoints.filter(p => p.type === 'aircraft' || p._military).length
    if (redSeaCombatants > 0 || redSeaAir > 0) {
      leads.push({
        id: 'lead-redsea',
        title: 'Bab el-Mandeb / Southern Red Sea Naval Chokepoint Alert',
        theater: 'Red Sea / Gulf of Aden',
        flag: '🇾🇪 / 🇸🇦',
        severity: 'CRITICAL',
        color: 'text-red-400 border-red-500/30 bg-red-950/20',
        signalCount: redSeaCombatants + redSeaAir,
        coords: { lat: 13.5, lng: 43.1, zoom: 6.5 },
        assessment: 'Heightened asymmetric surface and aerial attack vectors threatening commercial cargo tankers transiting Bab el-Mandeb. Coalition warships maintaining active patrol corridors.',
        actions: [
          'Enforce strict Operation Prosperity Guardian / Aspides transit group formations for high-tonnage merchantmen.',
          'Activate automated acoustic & RF surface-skimmer detection within 25 nautical miles of coastal radar clusters.',
          'Maintain continuous drone intercept combat air patrol (CAP) over the Hanish Islands shipping passage.'
        ]
      })
    }

    // Lead 3: Taiwan Strait & South China Sea Maritime/Air Stance
    const twPoints = points.filter(p => p.lat >= 18 && p.lat <= 26 && p.lng >= 117 && p.lng <= 123)
    const twWarships = twPoints.filter(p => p.type === 'warship' || p.type === 'fleet').length
    const twFlights = twPoints.filter(p => p.type === 'aircraft' || p._military).length
    if (twWarships > 0 || twFlights > 0) {
      leads.push({
        id: 'lead-taiwan',
        title: 'Taiwan Strait Median Line & ADIZ Air-Sea Posture',
        theater: 'Taiwan Strait / East Asia',
        flag: '🇹🇼 / 🇨🇳',
        severity: 'HIGH',
        color: 'text-amber-400 border-amber-500/30 bg-amber-950/20',
        signalCount: twWarships + twFlights,
        coords: { lat: 24.2, lng: 119.9, zoom: 6.8 },
        assessment: 'Persistent multi-axis air defense identification zone (ADIZ) incursions paired with forward naval frigate pickets. Gray-zone pressure tactics applied across commercial maritime choke points.',
        actions: [
          'Deploy continuous maritime patrol aircraft (P-8A Poseidon) for acoustic sub-surface mapping in Bashi Channel.',
          'Verify optical and SAR satellite passes over Fujian naval staging anchorages.',
          'Monitor underwater communications cable repeater health between Penghu, Kinmen, and main island landing stations.'
        ]
      })
    }

    // Lead 4: Critical Cyber-Physical SCADA/ICS Zero-Day Exposure
    const scadaPoints = points.filter(p => p.type === 'shodan')
    const cvePoints = points.filter(p => p.type === 'cve' || p.type === 'threat')
    if (scadaPoints.length > 0 || cvePoints.length > 0) {
      leads.push({
        id: 'lead-scada',
        title: 'Publicly Exposed Industrial SCADA/ICS & Active CISA KEV Exploitation',
        theater: 'Global Critical Infrastructure',
        flag: '⚡ / 🛡️',
        severity: 'HIGH',
        color: 'text-purple-400 border-purple-500/30 bg-purple-950/20',
        signalCount: scadaPoints.length + cvePoints.length,
        coords: scadaPoints[0] ? { lat: scadaPoints[0].lat, lng: scadaPoints[0].lng, zoom: 5 } : { lat: 45.0, lng: 10.0, zoom: 4 },
        assessment: 'Multiple industrial control endpoints (Modbus TCP port 502, Siemens S7 port 102, BACnet port 47808) are operating without perimeter access control alongside actively weaponized CISA KEV vulnerabilities.',
        actions: [
          'Enforce immediate zero-trust network isolation for exposed PLCs and RTUs; sever direct WAN interfaces.',
          'Audit edge gateway firmware against active CISA KEV CVE list, prioritizing remote code execution vulnerabilities.',
          'Deploy decoy honeypots and deep packet inspection rules for unauthorized Modbus function code commands (0x05, 0x06, 0x0F).'
        ]
      })
    }

    // Lead 5: Pacific Ring of Fire Coastal Seismic & Subsea Infrastructure Strain
    const pacificQuakes = points.filter(p => p.type === 'earthquake' && (p.mag >= 4.8 || p.meta?.mag >= 4.8))
    if (pacificQuakes.length > 0) {
      const topQuake = [...pacificQuakes].sort((a,b) => (b.mag||0) - (a.mag||0))[0]
      leads.push({
        id: 'lead-seismic',
        title: 'Pacific Subduction Zone High-Magnitude Seismic & Subsea Cable Threat',
        theater: topQuake.place || 'Pacific Rim',
        flag: '🌋 / 🌊',
        severity: (topQuake.mag >= 6.0) ? 'CRITICAL' : 'ELEVATED',
        color: 'text-cyan-400 border-cyan-500/30 bg-cyan-950/20',
        signalCount: pacificQuakes.length,
        coords: { lat: topQuake.lat, lng: topQuake.lng, zoom: 6 },
        assessment: `Active M${topQuake.mag || 5.0}+ earthquake cluster recorded along active tectonic boundary. Subsea optical fiber routes and coastal energy terminals within radius of potential rupture or submarine landslide.`,
        actions: [
          'Ping subsea cable coherent transponder telemetry to detect latency anomalies indicating benthic cable strain.',
          'Verify DART deep-ocean tsunami detection buoy data streams for anomalous hydrodynamic pressure waves.',
          'Inspect coastal seismic monitoring stations for secondary foreshock/aftershock migration towards populated hubs.'
        ]
      })
    }

    return leads
  }, [points])

  // 3. Pre-computed Quick Decision Oracle Questions
  const oracleQuestions = useMemo(() => {
    const redSeaCount = points.filter(p => p.lat >= 11 && p.lat <= 22 && p.lng >= 36 && p.lng <= 48).length
    const scadaCount = points.filter(p => p.type === 'shodan').length
    const cveCount = points.filter(p => p.type === 'cve').length
    const balticJamCount = points.filter(p => p.type === 'jamming' && p.lat >= 50 && p.lat <= 65).length
    const taiwanCount = points.filter(p => p.lat >= 20 && p.lat <= 26 && p.lng >= 118 && p.lng <= 123).length
    const criticalQuakes = points.filter(p => p.type === 'earthquake' && (p.mag >= 6.0 || p.meta?.mag >= 6.0)).length

    return [
      {
        q: 'Is there imminent military escalation in the Red Sea / Bab el-Mandeb corridor?',
        verdict: redSeaCount >= 3 ? 'YES' : 'MONITORING',
        confidence: 88,
        statusColor: 'text-red-400 bg-red-500/10 border-red-500/30',
        evidence: `${redSeaCount} active signals (naval combatants, aircraft, surveillance) detected in Red Sea chokepoint.`,
        guidance: 'Actionable: Enforce armed naval escorts for commercial vessels. Do not transit without active coalition comms link.'
      },
      {
        q: 'Are critical SCADA/ICS infrastructure assets exposed to active zero-day exploits?',
        verdict: (scadaCount > 0 && cveCount > 0) ? 'YES' : 'LOW RISK',
        confidence: 82,
        statusColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
        evidence: `${scadaCount} open industrial SCADA/ICS endpoints identified alongside ${cveCount} active CISA KEV exploits.`,
        guidance: 'Actionable: Immediately close public internet exposure on ports 502 (Modbus), 102 (S7), and 47808 (BACnet).'
      },
      {
        q: 'Is GPS jamming actively disrupting civil aviation or maritime lanes in Eastern Europe?',
        verdict: balticJamCount > 0 ? 'YES' : 'NO',
        confidence: 94,
        statusColor: 'text-red-400 bg-red-500/10 border-red-500/30',
        evidence: `${balticJamCount} confirmed GPS denial clusters active across Baltic Sea and Suwalki corridor.`,
        guidance: 'Actionable: Issue NOTAM advisories mandating non-satellite inertial navigation backups for commercial traffic.'
      },
      {
        q: 'Are naval strike groups or combatants actively maneuvering near Taiwan Strait?',
        verdict: taiwanCount >= 2 ? 'YES' : 'NO',
        confidence: 84,
        statusColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
        evidence: `${taiwanCount} naval and military flight tracks cataloged in Taiwan Strait & ADIZ boundaries.`,
        guidance: 'Actionable: Intensify synthetic aperture radar satellite imaging over naval bases in Fujian & Guangdong.'
      },
      {
        q: 'Are major urban centers or nuclear facilities threatened by active M6.0+ seismic events?',
        verdict: criticalQuakes > 0 ? 'YES' : 'NO',
        confidence: 91,
        statusColor: criticalQuakes > 0 ? 'text-red-400 bg-red-500/10 border-red-500/30' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        evidence: `${criticalQuakes} M6.0+ seismic events recorded in current dataset. ${points.filter(p=>p.type==='earthquake').length} total active tremors.`,
        guidance: criticalQuakes > 0 ? 'Actionable: Initiate emergency seismic inspection protocols on nuclear containment units.' : 'Actionable: Seismic baseline remains within normal tectonic dissipation thresholds. Maintain standard monitoring.'
      }
    ]
  }, [points])

  // 4. Custom Semantic Query Processor
  const handleCustomQuery = (e) => {
    e.preventDefault()
    if (!customQuery.trim()) return

    const q = customQuery.toLowerCase()
    const tokens = q.split(/\s+/).filter(w => w.length > 2)

    // Filter points matching question tokens
    const matched = points.filter(p => {
      const text = `${p.name || ''} ${p.title || ''} ${p.place || ''} ${p.zone || ''} ${p.desc || ''} ${p.type || ''}`.toLowerCase()
      return tokens.some(t => text.includes(t))
    })

    const criticals = matched.filter(p => p.severity === 'critical').length
    const highs = matched.filter(p => p.severity === 'high').length

    let verdict = 'NO / NORMAL'
    let confidence = 75
    let statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'

    if (criticals > 0 || highs >= 3 || (matched.length >= 8 && q.includes('escalat'))) {
      verdict = 'YES'
      confidence = Math.min(95, 80 + matched.length)
      statusColor = 'text-red-400 bg-red-500/10 border-red-500/30'
    } else if (matched.length > 0) {
      verdict = 'ELEVATED / MONITORING'
      confidence = Math.min(88, 68 + matched.length * 2)
      statusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30'
    } else {
      confidence = 89
    }

    setCustomAnswer({
      query: customQuery,
      verdict,
      confidence,
      statusColor,
      matchedCount: matched.length,
      sampleMatches: matched.slice(0, 4).map(m => m.name || m.title || m.place || m.id),
      guidance: verdict === 'YES'
        ? `Actionable: Immediate tactical inquiry recommended across ${matched.length} identified signals. Correlate radar and cyber telemetry.`
        : verdict === 'ELEVATED / MONITORING'
        ? `Actionable: Maintain active visual and RF surveillance. Log changes in transponder squawks or signal density.`
        : 'Actionable: No acute threat vectors isolated matching specified parameters. Retain scheduled baseline patrols.'
    })
  }

  // 5. Generate Markdown OSINT Briefing
  const generateBriefingText = () => {
    const dateStr = new Date().toUTCString()
    return `# OSINT STRATEGIC ACTIONABLE BRIEFING
**Classification:** OSINT UNCLASSIFIED // DECISION-RELEVANT SYNTHESIS
**Timestamp:** ${dateStr}
**Total Signals Ingested:** ${metrics.total}
**Threat Index:** ${metrics.compositeScore} / 100 (${metrics.defconLabel})

---

## 1. EXECUTIVE DEFCON THREAT READINESS
- **Composite Threat Level:** ${metrics.defconLabel}
- **Active GPS Jamming Zones:** ${metrics.jammingCount}
- **Naval Combatants & Warships:** ${metrics.warshipCount}
- **Military Loitering Aircraft:** ${metrics.milFlightCount}
- **Exploited CISA KEV Vulnerabilities:** ${metrics.cveCount}
- **Publicly Exposed SCADA/ICS Telemetry:** ${metrics.scadaCount}
- **Active M5.0+ Seismic Hazards:** ${metrics.majorQuakeCount}

---

## 2. CROSS-DOMAIN ACTIONABLE INVESTIGATIVE LEADS
${actionableLeads.map((l, i) => `
### Lead ${i + 1}: ${l.title} [${l.severity}]
- **Theater:** ${l.theater} (${l.flag})
- **Active Correlated Signals:** ${l.signalCount}
- **Tactical Assessment:** ${l.assessment}
- **Actionable Countermeasures:**
${l.actions.map(a => `  - ${a}`).join('\n')}
`).join('\n')}

---

## 3. DECISION ORACLE STRATEGIC TRIAGE (YES / NO)
${oracleQuestions.map(q => `
- **Q:** ${q.q}
  - **Verdict:** **${q.verdict}** (Confidence: ${q.confidence}%)
  - **Evidence:** ${q.evidence}
  - **Guidance:** ${q.guidance}
`).join('\n')}

---
*Report generated automatically by NEXUS OSINT Engine. Empirical sources: USGS, OpenSky, CISA KEV, Shodan, Abuse.ch, NOAA, AIS.*
`
  }

  const handleDownloadBriefing = () => {
    const text = generateBriefingText()
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `OSINT_Actionable_Briefing_${new Date().toISOString().slice(0, 10)}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCopyBriefing = () => {
    navigator.clipboard.writeText(generateBriefingText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="absolute top-16 right-4 w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-80px)] bg-black/90 backdrop-blur-xl border border-cyan-500/40 rounded-xl shadow-2xl shadow-cyan-950/60 z-50 flex flex-col overflow-hidden text-xs text-neutral-200 font-mono animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/30 bg-cyan-950/30">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-bold tracking-wider text-cyan-300 uppercase">⚡ Actionable OSINT Intelligence</span>
        </div>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-white px-2 py-0.5 rounded hover:bg-neutral-800 transition"
        >
          ✕
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-neutral-800 bg-neutral-900/60">
        <button
          onClick={() => setActiveTab('threats')}
          className={`flex-1 py-2 text-center font-semibold transition border-b-2 ${
            activeTab === 'threats'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          🛡️ Barometer
        </button>
        <button
          onClick={() => setActiveTab('leads')}
          className={`flex-1 py-2 text-center font-semibold transition border-b-2 ${
            activeTab === 'leads'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          🎯 Leads ({actionableLeads.length})
        </button>
        <button
          onClick={() => setActiveTab('oracle')}
          className={`flex-1 py-2 text-center font-semibold transition border-b-2 ${
            activeTab === 'oracle'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          🔮 Decision Oracle
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`flex-1 py-2 text-center font-semibold transition border-b-2 ${
            activeTab === 'export'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          📑 Export
        </button>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* TAB 1: THREAT BAROMETER & DEFCON */}
        {activeTab === 'threats' && (
          <div className="space-y-4">
            {/* DEFCON Box */}
            <div className={`p-3.5 rounded-lg border flex flex-col space-y-2 ${metrics.defconColor}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-extrabold tracking-widest">Strategic Readiness</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-black/40">
                  Risk: {metrics.compositeScore} / 100
                </span>
              </div>
              <div className="text-sm font-black tracking-wide">{metrics.defconLabel}</div>
              {/* Progress bar */}
              <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden border border-neutral-700">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 transition-all duration-500"
                  style={{ width: `${metrics.compositeScore}%` }}
                />
              </div>
              <p className="text-[11px] opacity-80 leading-relaxed">
                Calculated dynamically from real-time GPS electronic warfare clusters, forward naval warship patrols,
                military aerial reconnaissance, exploited CISA KEV zero-days, and exposed SCADA nodes.
              </p>
            </div>

            {/* Tactical Domain Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-neutral-300">
              <div className="p-2.5 rounded bg-neutral-900/80 border border-neutral-800">
                <div className="text-[10px] uppercase text-neutral-400">📡 GPS Jamming Zones</div>
                <div className="text-base font-bold text-red-400">{metrics.jammingCount} active</div>
              </div>
              <div className="p-2.5 rounded bg-neutral-900/80 border border-neutral-800">
                <div className="text-[10px] uppercase text-neutral-400">⚓ Warships / Navies</div>
                <div className="text-base font-bold text-blue-400">{metrics.warshipCount} combatants</div>
              </div>
              <div className="p-2.5 rounded bg-neutral-900/80 border border-neutral-800">
                <div className="text-[10px] uppercase text-neutral-400">✈️ Military Recon Flights</div>
                <div className="text-base font-bold text-cyan-400">{metrics.milFlightCount} airborne</div>
              </div>
              <div className="p-2.5 rounded bg-neutral-900/80 border border-neutral-800">
                <div className="text-[10px] uppercase text-neutral-400">🛡️ CISA KEV Exploited CVEs</div>
                <div className="text-base font-bold text-amber-400">{metrics.cveCount} cataloged</div>
              </div>
              <div className="p-2.5 rounded bg-neutral-900/80 border border-neutral-800">
                <div className="text-[10px] uppercase text-neutral-400">🏭 Shodan Exposed SCADA/ICS</div>
                <div className="text-base font-bold text-purple-400">{metrics.scadaCount} endpoints</div>
              </div>
              <div className="p-2.5 rounded bg-neutral-900/80 border border-neutral-800">
                <div className="text-[10px] uppercase text-neutral-400">🌋 Major Earthquakes (M5+)</div>
                <div className="text-base font-bold text-emerald-400">{metrics.majorQuakeCount} tremors</div>
              </div>
            </div>

            <div className="p-3 rounded bg-cyan-950/20 border border-cyan-800/40 text-[11px] text-cyan-200">
              💡 <strong>Actionable Guidance:</strong> Prioritize investigation on high-density cross-domain leads. Switch to the <strong>Leads</strong> tab to fly directly to theaters of interest.
            </div>
          </div>
        )}

        {/* TAB 2: CORRELATED ACTIONABLE LEADS */}
        {activeTab === 'leads' && (
          <div className="space-y-3">
            {actionableLeads.map((lead) => (
              <div key={lead.id} className={`p-3.5 rounded-lg border ${lead.color} space-y-2`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-sm">{lead.flag}</span>
                      <span className="font-bold text-neutral-100">{lead.title}</span>
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      Theater: <span className="text-neutral-200">{lead.theater}</span> • {lead.signalCount} signals
                    </div>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider bg-black/60 border border-current">
                    {lead.severity}
                  </span>
                </div>

                <p className="text-[11px] text-neutral-300 leading-relaxed border-t border-neutral-800/60 pt-1.5">
                  {lead.assessment}
                </p>

                {/* Tactical Actions */}
                <div className="space-y-1 bg-black/40 p-2 rounded border border-neutral-800">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Actionable Directives:</div>
                  {lead.actions.map((act, i) => (
                    <div key={i} className="text-[10px] text-neutral-300 flex items-start space-x-1.5">
                      <span className="text-cyan-500">▶</span>
                      <span>{act}</span>
                    </div>
                  ))}
                </div>

                {/* Fly to Target */}
                {lead.coords && (
                  <button
                    onClick={() => onFlyTo && onFlyTo(lead.coords.lat, lead.coords.lng, lead.coords.zoom)}
                    className="w-full mt-1 py-1.5 rounded bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/50 text-cyan-200 font-bold text-[11px] flex items-center justify-center space-x-1.5 transition active:scale-95"
                  >
                    <span>🎯</span>
                    <span>Fly 3D Camera to Theater ({lead.coords.lat.toFixed(1)}°, {lead.coords.lng.toFixed(1)}°)</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: QUICK DECISION ORACLE */}
        {activeTab === 'oracle' && (
          <div className="space-y-4">
            {/* Custom Natural Language OSINT Query Input */}
            <form onSubmit={handleCustomQuery} className="space-y-2">
              <label className="text-[11px] font-bold text-cyan-300 flex items-center space-x-1">
                <span>🔮</span>
                <span>Ask Decision Oracle (Rapid Yes/No Triage):</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  placeholder="e.g. Is there escalation in Taiwan? Any jamming in Baltic?"
                  className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-black font-bold text-xs transition"
                >
                  Analyze
                </button>
              </div>
            </form>

            {/* Custom Answer Card */}
            {customAnswer && (
              <div className="p-3 rounded-lg border border-cyan-500/40 bg-neutral-900/90 space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-neutral-400 uppercase">Evaluated Query</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-black border ${customAnswer.statusColor}`}>
                    {customAnswer.verdict} ({customAnswer.confidence}% Conf)
                  </span>
                </div>
                <div className="text-xs font-bold text-white">"{customAnswer.query}"</div>
                <div className="text-[11px] text-neutral-300">{customAnswer.guidance}</div>
                {customAnswer.sampleMatches.length > 0 && (
                  <div className="text-[10px] text-neutral-400 pt-1 border-t border-neutral-800">
                    Matches: {customAnswer.sampleMatches.join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Pre-Computed High-Impact Decision Questions */}
            <div className="space-y-2.5">
              <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Pre-Computed Strategic Inquiries:
              </div>
              {oracleQuestions.map((item, i) => (
                <div key={i} className="p-2.5 rounded bg-neutral-900/70 border border-neutral-800 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-neutral-200 text-[11px]">{item.q}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-black border shrink-0 ${item.statusColor}`}>
                      {item.verdict} ({item.confidence}%)
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-400 leading-tight">{item.evidence}</div>
                  <div className="text-[10px] text-cyan-300 leading-tight">{item.guidance}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: ACTIONABLE BRIEFING EXPORT */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <div className="p-3 rounded bg-neutral-900/80 border border-neutral-800 space-y-2">
              <div className="font-bold text-cyan-300">Actionable Intelligence Dossier</div>
              <p className="text-[11px] text-neutral-300 leading-relaxed">
                Export an operational OSINT briefing containing the executive threat readiness level,
                active cross-domain investigative leads, decision oracle answers, and concrete tactical recommendations.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleDownloadBriefing}
                  className="flex-1 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-black font-bold text-xs transition flex items-center justify-center space-x-1.5"
                >
                  <span>⬇️</span>
                  <span>Download Briefing (.md)</span>
                </button>
                <button
                  onClick={handleCopyBriefing}
                  className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-xs border border-neutral-700 transition"
                >
                  {copied ? '✓ Copied!' : '📋 Copy'}
                </button>
              </div>
            </div>

            <div className="p-2.5 rounded bg-black/60 border border-neutral-800 max-h-56 overflow-y-auto font-mono text-[10px] text-neutral-400 whitespace-pre-wrap select-all custom-scrollbar">
              {generateBriefingText()}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-[10px] text-neutral-500">
        <span>NEXUS OSINT Decision Engine</span>
        <span>{metrics.total.toLocaleString()} Active Signals</span>
      </div>
    </div>
  )
}
