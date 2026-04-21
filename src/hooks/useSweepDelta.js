/**
 * useSweepDelta — tracks what changed between signal refreshes
 * 
 * Instead of showing an analyst 150 articles every refresh,
 * this shows: what's NEW, what ESCALATED, what APPEARED for the first time.
 * 
 * Stored in localStorage (keyed per situation) so delta persists across tabs.
 */

import { useState, useCallback, useEffect, useRef } from 'react'

const STORE_KEY = 'nexus-sweep-delta-v1'

function loadDeltas() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}
function saveDelta(sitId, delta) {
  try {
    const all = loadDeltas()
    // Keep last 10 sweeps per situation
    all[sitId] = [delta, ...(all[sitId] || [])].slice(0, 10)
    localStorage.setItem(STORE_KEY, JSON.stringify(all))
  } catch {}
}

export function useSweepDelta(sitId) {
  const [deltas, setDeltas] = useState(() => loadDeltas()[sitId] || [])
  const prevIds = useRef(new Set())
  const prevSevMap = useRef({})

  // Called after every Fetch Now — computes what changed
  const computeDelta = useCallback((freshSignals) => {
    if (!freshSignals.length) return null

    const now = new Date()
    const currentIds = new Set(freshSignals.map(a => a.id))
    const currentSevMap = {}
    freshSignals.forEach(a => { currentSevMap[a.id] = a.severity })

    const delta = {
      timestamp:    now.toISOString(),
      time:         now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      totalSignals: freshSignals.length,
      newSignals:   [],
      escalations:  [],
      newSources:   [],
      velocityChange: 0,
    }

    // New signals (didn't exist last sweep)
    if (prevIds.current.size > 0) {
      freshSignals.forEach(a => {
        if (!prevIds.current.has(a.id)) {
          delta.newSignals.push({
            id:       a.id,
            title:    a.title,
            source:   a.source,
            severity: a.severity,
            url:      a.url,
            pub:      a.pub,
            _acled:   a._acled,
            _firms:   a._firms,
            _fred:    a._fred,
          })
        }
      })

      // Severity escalations (same article, worse severity)
      const sevRank = { critical: 4, high: 3, medium: 2, low: 1 }
      freshSignals.forEach(a => {
        const prevSev = prevSevMap.current[a.id]
        if (prevSev && sevRank[a.severity] > sevRank[prevSev]) {
          delta.escalations.push({
            id:      a.id,
            title:   a.title,
            source:  a.source,
            from:    prevSev,
            to:      a.severity,
            url:     a.url,
          })
        }
      })

      // New sources (source not seen before in this situation)
      const prevSources = new Set([...(loadDeltas()[sitId]?.[0]?.allSources || [])])
      const newSrcs = [...new Set(freshSignals.map(a => a.source))]
        .filter(s => !prevSources.has(s))
      delta.newSources = newSrcs
      delta.allSources = [...new Set(freshSignals.map(a => a.source))]

      // Velocity change
      const prevTotal = prevIds.current.size
      delta.velocityChange = prevTotal > 0 ? freshSignals.length - prevTotal : 0
    } else {
      // First sweep — everything is new but don't surface it as "delta"
      delta.allSources = [...new Set(freshSignals.map(a => a.source))]
    }

    // Sort new signals: critical first, then high, then recency
    const sevRank = { critical: 4, high: 3, medium: 2, low: 1 }
    delta.newSignals.sort((a, b) => {
      const sd = (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0)
      return sd !== 0 ? sd : new Date(b.pub) - new Date(a.pub)
    })

    // Update refs for next comparison
    prevIds.current    = currentIds
    prevSevMap.current = currentSevMap

    // Only save if there's meaningful delta
    const hasDelta = delta.newSignals.length > 0 || delta.escalations.length > 0
    if (hasDelta) {
      saveDelta(sitId, delta)
      setDeltas(prev => [delta, ...prev].slice(0, 10))
    }

    return delta
  }, [sitId])

  const clearDeltas = useCallback(() => {
    try {
      const all = loadDeltas()
      delete all[sitId]
      localStorage.setItem(STORE_KEY, JSON.stringify(all))
    } catch {}
    setDeltas([])
    prevIds.current    = new Set()
    prevSevMap.current = {}
  }, [sitId])

  return { deltas, latestDelta: deltas[0] || null, computeDelta, clearDeltas }
}
