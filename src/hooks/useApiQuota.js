/**
 * useApiQuota — tracks API call counts per day/month
 * Stored in localStorage, resets automatically at midnight / month boundary
 *
 * Free tier limits:
 *   NewsAPI:      100 req/day  (developer tier)
 *   GNews:        100 req/day
 *   Alpha Vantage: 25 req/day
 *   NewsData.io:  200 req/day
 *   GDELT:        unlimited (no key, no limit)
 *   RSS:          unlimited
 *   Reddit:       unlimited
 */

const LIMITS = {
  newsapi:      { day: 90,  month: null, label: 'NewsAPI'       },
  gnews:        { day: 90,  month: null, label: 'GNews'         },
  alphavantage: { day: 22,  month: null, label: 'Alpha Vantage' },
  newsdata:     { day: 190, month: null, label: 'NewsData.io'   },
}

const STORAGE_KEY = 'nexus-api-quota-v1'

function todayKey() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

function loadQuota() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    // Reset stale days
    const today = todayKey()
    const cleaned = {}
    Object.entries(data).forEach(([api, entry]) => {
      cleaned[api] = {
        ...entry,
        today: entry.date === today ? entry.today : 0,
        date: today,
      }
    })
    return cleaned
  } catch { return {} }
}

function saveQuota(quota) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(quota)) } catch {}
}

// Singleton quota state (shared across hook instances)
let _quota = loadQuota()

export function recordApiCall(apiName, count = 1) {
  const today = todayKey()
  if (!_quota[apiName]) _quota[apiName] = { today: 0, date: today }
  if (_quota[apiName].date !== today) {
    _quota[apiName] = { today: 0, date: today }
  }
  _quota[apiName].today += count
  saveQuota(_quota)
}

export function getQuotaStatus() {
  return Object.entries(LIMITS).map(([api, limit]) => {
    const used = _quota[api]?.today || 0
    const pct  = Math.round((used / limit.day) * 100)
    const ok   = used < limit.day * 0.9   // warn at 90%
    const warn = used >= limit.day * 0.7  // yellow at 70%
    return { api, label: limit.label, used, limit: limit.day, pct, ok, warn }
  })
}

export function canCallApi(apiName) {
  const limit = LIMITS[apiName]
  if (!limit) return true // no limit defined = always ok (GDELT, RSS, Reddit)
  const used = _quota[apiName]?.today || 0
  return used < limit.day
}

/**
 * shouldRefreshApiSource — decides if enough time has passed to call a paid API again
 * Strategy:
 *   - RSS / GDELT / Reddit: refresh every 3 minutes (unlimited, free)
 *   - NewsAPI / GNews:      refresh every 30 minutes max
 *   - AlphaVantage:         refresh every 60 minutes max
 *   - NewsData:             refresh every 30 minutes max
 */
const REFRESH_INTERVALS = {
  newsapi:      30 * 60 * 1000,  // 30 min
  gnews:        30 * 60 * 1000,  // 30 min
  alphavantage: 60 * 60 * 1000,  // 60 min
  newsdata:     30 * 60 * 1000,  // 30 min
}

const _lastCall = {}

export function shouldRefreshApi(apiName) {
  const interval = REFRESH_INTERVALS[apiName]
  if (!interval) return true // no throttle = always refresh (free sources)
  if (!canCallApi(apiName)) return false // quota exhausted
  const last = _lastCall[apiName] || 0
  return Date.now() - last > interval
}

export function markApiCalled(apiName) {
  _lastCall[apiName] = Date.now()
  recordApiCall(apiName, 1)
}
