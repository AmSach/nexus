/**
 * useLocation — detect user's country from IP (free, no key needed)
 * Uses ip-api.com free tier. Cached in sessionStorage.
 */
import { useState, useEffect } from 'react'

export function useUserLocation() {
  const [loc, setLoc] = useState(() => {
    try {
      const cached = sessionStorage.getItem('nexus-loc')
      return cached ? JSON.parse(cached) : null
    } catch { return null }
  })
  const [loading, setLoading] = useState(!loc)

  useEffect(() => {
    if (loc) return // already have it
    // Try multiple free IP geo services in order
    const tryGeo = async () => {
      // 1. ipapi.co (HTTPS, CORS-friendly)
      try {
        const r = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(6000) })
        const d = await r.json()
        if (d?.country_code) return { country: d.country_name, countryCode: d.country_code, city: d.city, region: d.region }
      } catch {}
      // 2. ip-api (HTTP fallback)
      try {
        const r = await fetch('http://ip-api.com/json/?fields=country,countryCode,city,regionName', { signal: AbortSignal.timeout(6000) })
        const d = await r.json()
        if (d?.countryCode) return { country: d.country, countryCode: d.countryCode, city: d.city, region: d.regionName }
      } catch {}
      // 3. cloudflare trace (always works, parse text)
      try {
        const r = await fetch('https://1.1.1.1/cdn-cgi/trace', { signal: AbortSignal.timeout(5000) })
        const text = await r.text()
        const loc2 = Object.fromEntries(text.trim().split('\n').map(l => l.split('=')))
        if (loc2.loc) return { country: loc2.loc, countryCode: loc2.loc, city: '', region: '' }
      } catch {}
      return null
    }
    tryGeo().then(result => {
      if (result) {
        setLoc(result)
        try { sessionStorage.setItem('nexus-loc', JSON.stringify(result)) } catch {}
      }
    }).catch(()=>{}).finally(() => setLoading(false))
  }, [])

  return { loc, loading }
}

// Map country code / name to NEXUS region labels
export function countryToRegion(countryCode, country) {
  const cc = (countryCode||'').toUpperCase()
  const cn = (country||'').toLowerCase()

  if (['US','CA','MX'].includes(cc)) return 'North America'
  if (['GB','DE','FR','IT','ES','NL','BE','CH','AT','PL','SE','NO','DK','FI','PT','GR','IE','CZ','HU','RO','SK','HR','BG','RS','UA','BY','MD','AL','BA','ME','MK','SI','LV','LT','EE','LU','MT','CY','IS','LI','AD','SM','MC','VA'].includes(cc)) return 'Europe'
  if (['CN','JP','KR','TW','HK','MO','MN'].includes(cc)) return 'East Asia'
  if (['IN','PK','BD','LK','NP','BT','MV','AF'].includes(cc)) return 'South Asia'
  if (['ID','TH','VN','PH','MY','SG','MM','KH','LA','BN','TL'].includes(cc)) return 'Southeast Asia'
  if (['SA','AE','IL','IQ','IR','SY','JO','LB','KW','QA','BH','OM','YE','PS','TR','EG','LY','TN','DZ','MA'].includes(cc)) return 'Middle East'
  if (['NG','ZA','KE','ET','GH','TZ','UG','SN','CI','CM','AO','MZ','MG','ZM','ZW','SD','SS','LY','SO','CD','CF','TD','NE','ML','BF','GN','SL','LR','TG','BJ','ER','DJ','RW','BI','MW','NA','BW','SZ','LS','MU','SC','ST'].includes(cc)) return 'Africa'
  if (['BR','AR','CO','CL','PE','VE','EC','BO','PY','UY','GY','SR','CU','DO','HT','JM','TT','PA','CR','GT','HN','SV','NI','MX','BZ'].includes(cc)) return 'Latin America'
  if (['RU','KZ','UZ','TM','TJ','KG','AZ','AM','GE','MD'].includes(cc)) return 'Europe' // post-soviet
  if (['AU','NZ','FJ','PG'].includes(cc)) return 'Southeast Asia'
  return null
}

// Filter articles relevant to user's location
export function filterLocalNews(articles, loc) {
  if (!loc || !articles?.length) return articles || []
  const { country, countryCode, city, region: userRegion } = loc
  const nexusRegion = countryToRegion(countryCode, country)
  const terms = [
    country?.toLowerCase(),
    city?.toLowerCase(),
    userRegion?.toLowerCase(),
    countryCode?.toLowerCase(),
  ].filter(Boolean)

  return articles.filter(a => {
    const text = (a.title + ' ' + (a.summary||'') + ' ' + (a.region||'')).toLowerCase()
    // Match by NEXUS region label
    if (nexusRegion && a.region === nexusRegion) return true
    // Match by country/city name in text
    return terms.some(t => t.length > 2 && text.includes(t))
  })
}
