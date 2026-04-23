/**
 * NEXUS Cache — persistent localStorage cache for all live data
 * Articles, satellite data, ACLED events, FIRMS fires all cached
 * so old data is never lost between refreshes.
 */

const PREFIX = 'nexus-cache-v1-'
const LIMITS = {
  articles:   2000,  // max articles stored
  satellite:  1,     // satellite blob (large, 1 version)
  acled:      500,   // ACLED conflict events
  firms:      1000,  // NASA FIRMS fire detections
  alerts:     200,   // live alerts
  markets:    300,   // prediction markets
}

export function cacheWrite(key, data, maxItems = null) {
  try {
    const payload = {
      ts: Date.now(),
      data: maxItems && Array.isArray(data) ? data.slice(0, maxItems) : data
    }
    localStorage.setItem(PREFIX + key, JSON.stringify(payload))
    return true
  } catch (e) {
    // Storage full — clear oldest caches and retry
    clearOldest()
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data }))
      return true
    } catch { return false }
  }
}

export function cacheRead(key, maxAgeMs = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (maxAgeMs && Date.now() - ts > maxAgeMs) return null
    return { data, ts, age: Date.now() - ts }
  } catch { return null }
}

// Merge new articles with cached ones, deduplicate by URL or title
export function mergeArticles(newArts, cachedArts, max = 2000) {
  const seen = new Set()
  const all = []
  for (const a of [...newArts, ...(cachedArts || [])]) {
    const key = a.url || (a.title || '').slice(0, 60)
    if (!key || seen.has(key)) continue
    seen.add(key)
    all.push(a)
  }
  // Sort by pub date newest first
  all.sort((a, b) => new Date(b.pub || 0) - new Date(a.pub || 0))
  return all.slice(0, max)
}

// Merge map points, deduplicate by id or lat/lng+type
export function mergeMapPoints(newPts, cachedPts, max = 5000) {
  const seen = new Set()
  const all = []
  for (const p of [...newPts, ...(cachedPts || [])]) {
    const key = p.id || `${p.type}-${(p.lat||0).toFixed(2)}-${(p.lng||0).toFixed(2)}`
    if (seen.has(key)) continue
    seen.add(key)
    all.push(p)
  }
  return all.slice(0, max)
}

// Clear oldest cache entries when storage is full
function clearOldest() {
  const entries = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith(PREFIX)) continue
    try {
      const { ts } = JSON.parse(localStorage.getItem(k))
      entries.push({ k, ts })
    } catch {}
  }
  entries.sort((a, b) => a.ts - b.ts)
  // Remove oldest 3
  entries.slice(0, 3).forEach(({ k }) => localStorage.removeItem(k))
}

export function cacheKeys() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) keys.push(k.replace(PREFIX, ''))
  }
  return keys
}

export function cacheClear(key) {
  localStorage.removeItem(PREFIX + key)
}

export function cacheStats() {
  let totalSize = 0
  const stats = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith(PREFIX)) continue
    const raw = localStorage.getItem(k)
    const size = raw ? raw.length : 0
    totalSize += size
    try {
      const { ts, data } = JSON.parse(raw)
      const count = Array.isArray(data) ? data.length : (data ? 1 : 0)
      stats.push({ key: k.replace(PREFIX, ''), size, count, age: Math.round((Date.now() - ts) / 60000) + 'm' })
    } catch {}
  }
  return { stats, totalSize, totalSizeKB: Math.round(totalSize / 1024) }
}
