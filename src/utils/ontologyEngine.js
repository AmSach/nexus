/**
 * ontologyEngine.js
 * Stateful Semantic Ontology Engine & State Machine for NEXUS Enterprise Intelligence
 * Manages object lifecycles, threat interdiction state machines, and real-time operational cascades.
 */

import {
  VESSELS_ONTOLOGY,
  FACILITIES_ONTOLOGY,
  CHOKEPOINTS_ONTOLOGY,
  CORPORATE_UBO_ONTOLOGY,
  SUPPLY_CHAIN_BOM_NODES
} from '../data/ontologyData'

class OntologyEngine {
  constructor() {
    this.vessels = JSON.parse(JSON.stringify(VESSELS_ONTOLOGY))
    this.facilities = JSON.parse(JSON.stringify(FACILITIES_ONTOLOGY))
    this.chokepoints = JSON.parse(JSON.stringify(CHOKEPOINTS_ONTOLOGY))
    this.ubos = JSON.parse(JSON.stringify(CORPORATE_UBO_ONTOLOGY))
    this.bomNodes = JSON.parse(JSON.stringify(SUPPLY_CHAIN_BOM_NODES))
    this.eventLog = [
      {
        id: 'evt_init',
        timestamp: new Date().toISOString(),
        action: 'ONTOLOGY_INITIALIZED',
        details: 'Dynamic Semantic Ontology loaded 5 object types with full property schemas.'
      }
    ]
  }

  // Query engine with multi-attribute filtering
  queryVessels({ status, chokepointId, minRisk, search }) {
    return this.vessels.filter(v => {
      if (status && status !== 'ALL' && v.status !== status) return false
      if (chokepointId && chokepointId !== 'ALL' && v.chokepointId !== chokepointId) return false
      if (minRisk && v.riskScore < minRisk) return false
      if (search) {
        const q = search.toLowerCase()
        const matchesName = v.name.toLowerCase().includes(q)
        const matchesImo = v.imo.includes(q)
        const matchesFlag = v.flag.toLowerCase().includes(q)
        const matchesCargo = v.cargoManifest?.type?.toLowerCase().includes(q)
        if (!matchesName && !matchesImo && !matchesFlag && !matchesCargo) return false
      }
      return true
    })
  }

  getVesselById(id) {
    return this.vessels.find(v => v.id === id)
  }

  getFacilityById(id) {
    return this.facilities.find(f => f.id === id)
  }

  getUboById(id) {
    return this.ubos.find(u => u.id === id)
  }

  getChokepointById(id) {
    return this.chokepoints.find(c => c.id === id)
  }

  // State Machine transition for a single vessel
  transitionVesselState(vesselId, nextStatus, reason) {
    const vessel = this.vessels.find(v => v.id === vesselId)
    if (!vessel) return null

    const prevStatus = vessel.status
    vessel.status = nextStatus
    
    // Add telemetry record
    if (!vessel.telemetryHistory) vessel.telemetryHistory = []
    vessel.telemetryHistory.unshift({
      timestamp: 'Just Now (Manual Transition)',
      lat: vessel.lat,
      lng: vessel.lng,
      speed: vessel.speedKnots,
      alert: `State transition: ${prevStatus} -> ${nextStatus} (${reason})`
    })

    const evt = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: 'VESSEL_STATE_TRANSITION',
      vesselId,
      vesselName: vessel.name,
      prevStatus,
      nextStatus,
      reason
    }
    this.eventLog.unshift(evt)
    return { vessel, evt }
  }

  // Interdiction Simulation: Cascading State Machine
  // E.g. A strike in Bab el-Mandeb forces Western vessels to divert around Cape of Good Hope
  simulateEscalationStrike({ chokepointId = 'bab_el_mandeb', threatType = 'ASBM_DRONE_SWARM', targetTier = 'ALL_WESTERN' }) {
    const cp = this.chokepoints.find(c => c.id === chokepointId)
    if (cp) {
      cp.currentTransitReductionPct = Math.min(100, cp.currentTransitReductionPct + 15)
      cp.threatLevel = 'CRITICAL'
    }

    const transitioned = []
    for (const v of this.vessels) {
      if (v.chokepointId === chokepointId) {
        // High risk flags / charters divert
        if (v.flag === 'United States' || v.flag === 'Marshall Islands' || v.flag === 'Panama') {
          if (v.status !== 'DIVERTED_CAPE') {
            const prev = v.status
            v.status = 'DIVERTED_CAPE'
            v.riskScore = Math.min(99, v.riskScore + 18)
            transitioned.push({ id: v.id, name: v.name, from: prev, to: 'DIVERTED_CAPE' })
          }
        } else if (v.status === 'NORMAL' && v.flag === 'China') {
          // Chinese vessels broadcast safe passage
          v.riskScore = Math.max(15, v.riskScore - 5)
        }
      }
    }

    const evt = {
      id: `evt_strike_${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'TACTICAL_STRIKE_SIMULATION',
      chokepointId,
      threatType,
      targetTier,
      transitionedCount: transitioned.length,
      transitionedVessels: transitioned
    }
    this.eventLog.unshift(evt)
    return { chokepoint: cp, transitioned, event: evt }
  }

  // Compute operational overview metrics
  getOperationalSummary() {
    const totalVessels = this.vessels.length
    const divertedCount = this.vessels.filter(v => v.status === 'DIVERTED_CAPE').length
    const darkAisCount = this.vessels.filter(v => v.status === 'AIS_DARK').length
    const highRiskCount = this.vessels.filter(v => v.riskScore >= 70).length
    
    let totalCargoValueUSD = 0
    for (const v of this.vessels) {
      if (v.cargoManifest?.cargoValueUSD) {
        totalCargoValueUSD += v.cargoManifest.cargoValueUSD
      }
    }

    // Downstream assembly plants affected
    const affectedPlants = this.facilities.filter(f => f.vulnerabilityIndex > 80)

    return {
      totalVessels,
      divertedCount,
      darkAisCount,
      highRiskCount,
      totalCargoValueUSD,
      affectedPlantsCount: affectedPlants.length,
      activeEventsCount: this.eventLog.length
    }
  }

  reset() {
    this.vessels = JSON.parse(JSON.stringify(VESSELS_ONTOLOGY))
    this.facilities = JSON.parse(JSON.stringify(FACILITIES_ONTOLOGY))
    this.chokepoints = JSON.parse(JSON.stringify(CHOKEPOINTS_ONTOLOGY))
    this.ubos = JSON.parse(JSON.stringify(CORPORATE_UBO_ONTOLOGY))
    this.bomNodes = JSON.parse(JSON.stringify(SUPPLY_CHAIN_BOM_NODES))
    this.eventLog.unshift({
      id: `evt_reset_${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'ONTOLOGY_RESET',
      details: 'All vessels and facilities restored to pristine baseline state.'
    })
  }
}

export const ontologyEngine = new OntologyEngine()
