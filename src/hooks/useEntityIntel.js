/**
 * useEntityIntel — All sources via Vercel serverless function
 *
 * Diagnostic results showed GDELT, NewsAPI, allorigins ALL fail from browser.
 * Only Wikipedia, Wikidata, DuckDuckGo work direct.
 *
 * Solution: /api/intel serverless function runs on Vercel's server (no CORS,
 * no browser restrictions) and fetches GDELT, NewsAPI, Google News, sanctions etc.
 * The browser only calls:
 *   - Wikipedia/Wikidata/DDG: direct (confirmed working)
 *   - Everything else: /api/intel?name=... (server-side)
 */

import { useState, useCallback } from 'react'
import { cacheRead, cacheWrite } from '../utils/cache'
import { useStore } from '../store'

// Direct fetch for CORS-enabled APIs only
async function directJSON(url, ms = 12000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) })
    if (!r.ok) return null
    const t = await r.text()
    return t?.length > 5 ? JSON.parse(t) : null
  } catch { return null }
}

// ── Wikipedia ─────────────────────────────────────────────────────────────────
async function fetchWikipedia(name) {
  const osD = await directJSON(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=5&format=json&origin=*`
  )
  let titles = osD?.[1] || []
  if (!titles.length) {
    const ftD = await directJSON(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=5&format=json&origin=*`
    )
    titles = (ftD?.query?.search || []).map(h => h.title)
  }
  for (const title of titles.slice(0, 4)) {
    const slug = encodeURIComponent(title.replace(/ /g, '_'))
    const d = await directJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`)
    if (d?.extract?.length > 60 && d.type !== 'disambiguation') {
      const fullD = await directJSON(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts|categories|links&exintro=false&explaintext=true&cllimit=30&pllimit=50&format=json&origin=*`
      )
      const page = Object.values(fullD?.query?.pages || {})[0] || {}
      return {
        title: d.title,
        summary: d.extract,
        fullText: (page.extract || d.extract).slice(0, 8000),
        description: d.description || '',
        url: d.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${slug}`,
        thumbnail: d.thumbnail?.source || null,
        categories: (page.categories || []).map(c => c.title?.replace('Category:', '')).filter(c => c && !c.includes('CS1') && !c.includes('birth') && !c.includes('death')).slice(0, 20),
        links: (page.links || []).map(l => l.title).slice(0, 30),
      }
    }
  }
  return null
}

// ── Wikidata ──────────────────────────────────────────────────────────────────
async function fetchWikidata(name) {
  const res = await directJSON(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&limit=5&format=json&origin=*`
  )
  const entity = res?.search?.[0]
  if (!entity?.id) return null
  const det = await directJSON(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entity.id}&format=json&languages=en&props=claims|labels|descriptions|aliases&origin=*`
  )
  const ent = det?.entities?.[entity.id]
  if (!ent) return { id: entity.id, label: entity.label, description: entity.description || '' }
  const claims = ent.claims || {}
  const rv = v => { if (!v) return null; if (typeof v==='string') return v; if (v?.text) return v.text; if (v?.time) return v.time.replace(/^\+/,'').slice(0,10); if (v?.amount) return String(v.amount); if (v?.id) return v.id; return null }
  const get = p => rv(claims[p]?.[0]?.mainsnak?.datavalue?.value)
  const all = p => (claims[p]||[]).map(v=>rv(v?.mainsnak?.datavalue?.value)).filter(Boolean)
  const qids = [...new Set([get('P27'),get('P106'),get('P39'),get('P108'),get('P17'),get('P31'),get('P140'),...all('P102').slice(0,4),...all('P463').slice(0,5),...all('P39').slice(0,6),...all('P26').slice(0,3),...all('P40').slice(0,4)].filter(q=>q?.startsWith?.('Q')))]
  let labels = {}
  for (let i=0;i<qids.length;i+=50) {
    const ld = await directJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.slice(i,i+50).join('|')}&format=json&languages=en&props=labels&origin=*`)
    qids.slice(i,i+50).forEach(q=>{labels[q]=ld?.entities?.[q]?.labels?.en?.value||q})
  }
  const L = q => q?(labels[q]||q):null
  return {
    id:entity.id, label:ent.labels?.en?.value||entity.label,
    description:ent.descriptions?.en?.value||entity.description||'',
    aliases:(ent.aliases?.en||[]).map(a=>a.value).slice(0,8),
    birthDate:get('P569'), deathDate:get('P570'), birthPlace:get('P19'),
    nationality:L(get('P27')), occupation:L(get('P106')), position:L(get('P39')),
    allPositions:all('P39').slice(0,8).map(L).filter(Boolean),
    employer:L(get('P108')), parties:all('P102').slice(0,4).map(L).filter(Boolean),
    memberOf:all('P463').slice(0,6).map(L).filter(Boolean),
    country:L(get('P17')), instanceOf:L(get('P31')),
    inception:get('P571'), dissolved:get('P576'), hq:get('P159'),
    website:get('P856'), twitter:get('P2002'), netWorth:get('P2218'),
    religion:L(get('P140')), education:get('P69'),
    spouse:all('P26').slice(0,3).map(L).filter(Boolean),
    children:all('P40').slice(0,4).map(L).filter(Boolean),
    wikidataUrl:`https://www.wikidata.org/wiki/${entity.id}`,
  }
}

// ── DuckDuckGo ────────────────────────────────────────────────────────────────
async function fetchDDG(name) {
  const d = await directJSON(`https://api.duckduckgo.com/?q=${encodeURIComponent(name)}&format=json&no_html=1&skip_disambig=1`)
  const text = d?.AbstractText||d?.Answer||''
  if (text.length < 15) return null
  return { text, source:d.AbstractSource||'', url:d.AbstractURL||'', infobox:(d.Infobox?.content||[]).slice(0,12), related:(d.RelatedTopics||[]).filter(t=>t.Text).slice(0,8).map(t=>({text:t.Text,url:t.FirstURL})) }
}

// ── Server-side fetch (Vercel /api/intel) ─────────────────────────────────────
// Fetches GDELT, NewsAPI, Google News, Reddit, sanctions, ICIJ, etc.
// All from server — no CORS, no browser restrictions
async function fetchServerSide(name, extraKeys = {}) {
  try {
    const params = new URLSearchParams({ name })
    if (extraKeys.opencorp) params.set('opencorp_key', extraKeys.opencorp)
    if (extraKeys.urlscan_key) params.set('urlscan_key', extraKeys.urlscan_key)
    if (extraKeys.virustotal_key) params.set('virustotal_key', extraKeys.virustotal_key)
    const r = await fetch(`/api/intel?${params.toString()}`, {
      signal: AbortSignal.timeout(120000)
    })
    if (!r.ok) { console.error('[API] server error', r.status); return null }
    return await r.json()
  } catch (e) { console.error('[API] fetch failed:', e.message); return null }
}

// ── Groq AI synthesis ─────────────────────────────────────────────────────────
async function synthesizeGroq(name, data, groqKey) {
  if (!groqKey) return null
  const { wiki, wikidata, ddg, gdelt, newsapi, googleNews, bingNews, reddit, rssNews, icij, sanctions, opencorp, occrp, reliefweb, scholar, darkweb, wikiLinks, extractedEntities } = data

  const sections = []
  if (wiki?.fullText) sections.push(`=== WIKIPEDIA ===\n${wiki.title}${wiki.description?' ('+wiki.description+')':''}\nCategories: ${wiki.categories?.join(', ')}\nLinked: ${wiki.links?.slice(0,20).join(', ')}\n\n${wiki.fullText.slice(0,3000)}`)
  if (wikidata) {
    const f=[
      wikidata.aliases?.length&&`AKA: ${wikidata.aliases.join(', ')}`,
      wikidata.birthDate&&`Born: ${wikidata.birthDate}${wikidata.birthPlace?' in '+wikidata.birthPlace:''}`,
      wikidata.deathDate&&`Died: ${wikidata.deathDate}`,
      wikidata.nationality&&`Nationality: ${wikidata.nationality}`,
      wikidata.instanceOf&&`Type: ${wikidata.instanceOf}`,
      wikidata.allPositions?.length&&`All positions: ${wikidata.allPositions.join(' → ')}`,
      wikidata.parties?.length&&`Parties: ${wikidata.parties.join(', ')}`,
      wikidata.memberOf?.length&&`Member of: ${wikidata.memberOf.join(', ')}`,
      wikidata.employer&&`Employer: ${wikidata.employer}`,
      wikidata.netWorth&&`Net worth: ${wikidata.netWorth}`,
      wikidata.spouse?.length&&`Spouse: ${wikidata.spouse.join(', ')}`,
      wikidata.children?.length&&`Children: ${wikidata.children.join(', ')}`,
      wikidata.religion&&`Religion: ${wikidata.religion}`,
      wikidata.twitter&&`Twitter: @${wikidata.twitter}`,
      wikidata.website&&`Website: ${wikidata.website}`,
    ].filter(Boolean).join('\n')
    if(f) sections.push(`=== WIKIDATA ===\n${f}`)
  }
  if (ddg?.text) sections.push(`=== DUCKDUCKGO ===\n${ddg.text}\n${(ddg.infobox||[]).slice(0,10).map(i=>`${i.label}: ${i.value}`).filter(Boolean).join('\n')}`)
  if (gdelt?.articleCount>0) {
    const tc={},sc={},cc={}
    gdelt.articles.forEach(a=>{(a.themes||[]).forEach(t=>{if(t.length>2)tc[t]=(tc[t]||0)+1});if(a.domain)sc[a.domain]=(sc[a.domain]||0)+1;if(a.country)cc[a.country]=(cc[a.country]||0)+1})
    const topThemes=Object.entries(tc).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([t])=>t)
    const topSources=Object.entries(sc).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([s])=>s)
    const topCountries=Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([c])=>c)
    sections.push(`=== GDELT NEWS (${gdelt.articleCount} articles, 6 months) ===\nAvg tone: ${gdelt.avgTone} (−10=hostile, +10=positive)\nTop countries: ${topCountries.join(', ')}\nThemes: ${topThemes.join(' | ')}\nOutlets: ${topSources.join(', ')}\n\n${gdelt.articles.slice(0,25).map(a=>`[${a.date}] "${a.title}" — ${a.domain} tone:${a.tone?.toFixed(1)} ${a.country}`).join('\n')}`)
  }
  const allNews=[...(newsapi||[]).slice(0,12).map(a=>`[NewsAPI][${a.date}] "${a.title}" — ${a.source}: ${a.description?.slice(0,100)}`),...(googleNews||[]).slice(0,10).map(a=>`[GoogleNews][${a.date}] "${a.title}" — ${a.source}`),...(bingNews||[]).slice(0,8).map(a=>`[Bing][${a.date}] "${a.title}" — ${a.source}`),...(rssNews||[]).slice(0,8).map(a=>`[${a.source}][${a.date}] "${a.title}"`),...(reddit||[]).slice(0,8).map(a=>`[${a.source}] "${a.title}"`)]
  if(allNews.length) sections.push(`=== NEWS SOURCES ===\n${allNews.join('\n')}`)
  if(icij?.length) sections.push(`=== ⚠ ICIJ OFFSHORE LEAKS ===\n${icij.map(r=>`• ${r.name} | ${r.type} | ${r.jurisdiction} | ${r.dataset}`).join('\n')}`)
  if(sanctions?.length) sections.push(`=== ⚠ INTERNATIONAL SANCTIONS ===\n${sanctions.map(s=>`• ${s.name} | lists: ${s.datasets} | topics: ${s.topics} | match: ${(s.score*100).toFixed(0)}%`).join('\n')}`)
  if(opencorp?.length) sections.push(`=== COMPANY RECORDS (OpenCorporates) ===\n${opencorp.map(c=>`• ${c.name} | ${c.jurisdiction} | ${c.status} | inc: ${c.incorporated}`).join('\n')}`)
  if(occrp?.length) sections.push(`=== ⚠ OCCRP ALEPH (Organized Crime/Corruption) ===\n${occrp.map(r=>`• ${r.caption} [${r.schema}] — ${r.dataset} | ${r.country}`).join('\n')}`)
  if(reliefweb?.length) sections.push(`=== UN RELIEFWEB REPORTS ===\n${reliefweb.map(r=>`• [${r.date}] ${r.title} — ${r.source} | ${r.country}`).join('\n')}`)
  if(scholar?.length) sections.push(`=== ACADEMIC PAPERS ===\n${scholar.map(p=>`• [${p.year}] ${p.title} — ${p.authors?.slice(0,60)} (${p.citations} citations)`).join('\n')}`)
  if(darkweb?.length) sections.push(`=== DARK WEB (AHMIA TOR) ===\n${darkweb.map(d=>`• ${d.title}`).join('\n')}`)
  // CourtListener federal court records (PACER)
  try {
    const cr = await fetch(`https://www.courtlistener.com/api/rest/v3/search/?q=${encodeURIComponent(name)}&type=o&order_by=score+desc&stat_Precedential=on&format=json`, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } })
    if (cr.ok) {
      const cd = await cr.json()
      const court = (cd?.results || []).slice(0, 8).map(r => ({ case: r.caseName, court: r.court_citation_string, date: r.dateFiled, url: 'https://www.courtlistener.com' + (r.absolute_url || '') }))
      if (court.length) sections.push('=== ⚖️ COURT RECORDS (CourtListener/PACER) ===\n' + court.map(r => `• ${r.case} | ${r.court} | ${r.date}`).join('\n'))
    }
  } catch {}
  if(extractedEntities?.length) sections.push(`=== TOP CO-OCCURRING ENTITIES (extracted from all news) ===\n${extractedEntities.slice(0,30).map(e=>`• ${e.name} (mentioned ${e.count}x)`).join('\n')}`)
  if(wikiLinks?.links?.length) sections.push(`=== WIKIPEDIA LINKED ENTITIES ===\n${wikiLinks.links.slice(0,20).join(', ')}\nCategories: ${wikiLinks.categories?.slice(0,10).join(', ')}`)
  if(!sections.length) return null

  const hasFlags=icij?.length||sanctions?.length||occrp?.length
  const totalNews=(gdelt?.articleCount||0)+(newsapi?.length||0)+(googleNews?.length||0)+(bingNews?.length||0)+(rssNews?.length||0)+(reddit?.length||0)

  const _MODELS=['llama-3.3-70b-versatile','llama-3.1-70b-versatile','llama-3.1-8b-instant','mixtral-8x7b-32768','gemma2-9b-it','llama3-70b-8192','llama3-8b-8192']
  for(const _m of _MODELS){try{
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${groqKey}`},
      signal:AbortSignal.timeout(60000),
      body:JSON.stringify({
        model:_m,
        messages:[{role:'user',content:`Senior intelligence analyst. Profile: "${name}"

${sections.join('\n\n')}

---
CRITICAL RULES:
1. NEVER invent, assume, or infer ICIJ/Pandora/Panama Papers hits. ONLY report them if they appear VERBATIM in the raw icij data array provided. If icij array is empty, say "No ICIJ hits found."
2. NEVER fabricate sanctions, court cases, or legal exposure. Only report what is in the raw data.  
3. Every single claim MUST cite its exact source in [brackets] — Wikipedia, GDELT article title+date, Wikidata field name, etc.
4. If you don't have a source for a claim, DO NOT MAKE THE CLAIM.
5. Don't summarize Wikipedia. ANALYZE by cross-referencing ${totalNews} news articles.
${hasFlags?'⚠ VERIFIED FLAGS IN RAW DATA (ICIJ/Sanctions/OCCRP) — detail every hit':'NO ICIJ/SANCTIONS FLAGS in raw data — do not suggest any.'}
Tone ${gdelt?.avgTone||'N/A'}: interpret operationally.

CURRENT SITUATION
[What do the ${totalNews} articles reveal is happening RIGHT NOW? Specific dates, specific events.]

MEDIA POSTURE
[Tone ${gdelt?.avgTone||'N/A'} means: ___. Which outlets cover them? What narrative? Geographic distribution.]

STRUCTURED PROFILE
[Non-obvious Wikidata/DDG facts: career trajectory, org memberships, financial data, family. NOT Wikipedia intro paragraph.]

NETWORK MAP
[Every named connection from every source:
"Entity" → [relationship] → "Connected Party" [Source]]
${hasFlags?`
⚠ FLAGS & EXPOSURE
[Detail every ICIJ/Sanctions/OCCRP hit. Which lists, programs, what financial/legal exposure]
`:''}
RISK: [CRITICAL/HIGH/MEDIUM/LOW — named evidence]

GAPS: [3 specific questions]

WATCH LIST — 90 DAYS: [5 concrete triggers]`}],
        max_tokens:3500,temperature:0.1,stream:false,
      })
    })
    if(!r.ok){console.error('[Groq]',r.status);return null}
    const d=await r.json()
    return d.choices?.[0]?.message?.content||null
  }catch(e){if(e.name==='AbortError'||!(e.message?.includes('429')||e.message?.includes('503')||e.message?.includes('404')||e.message?.includes('500')))return null;await new Promise(r=>setTimeout(r,800))}}/*endloop*/
  return null
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useEntityIntel() {
  const { keys } = useStore()

  const [loading,   setLoading]   = useState(false)
  const [progress,  setProgress]  = useState('')
  const [result,    setResult]    = useState(null)
  const [error,     setError]     = useState(null)
  const [srcStatus, setSrcStatus] = useState({})

  const enrich = useCallback(async (entityName) => {
    if (!entityName?.trim()) return
    setLoading(true); setError(null); setResult(null); setSrcStatus({})
    const name    = entityName.trim()
    const groqKey = keys.groq
    const status  = {}
    const track   = (key, val) => { status[key]=val!=null&&(!Array.isArray(val)||val.length>0); setSrcStatus({...status}) }

    try {
      // Check OC cache first — save API calls (OC costs 1 call per entity search)
      const ocCacheKey = 'oc-' + name.toLowerCase().replace(/[^a-z0-9]/g,'-')
      const ocCached = cacheRead(ocCacheKey, 24 * 60 * 60 * 1000) // 24h TTL for OC

      // Phase 1 & 2 run in parallel — browser-direct AND server-side simultaneously
      setProgress('Searching Wikipedia · Wikidata · DuckDuckGo + server-side GDELT · NewsAPI · Google News · Sanctions… (up to 2 minutes)')

      const [wiki, wikidata, ddg, serverData] = await Promise.all([
        fetchWikipedia(name).then(r=>{track('Wikipedia',r);return r}),
        fetchWikidata(name).then(r =>{track('Wikidata',r); return r}),
        fetchDDG(name).then(r      =>{track('DuckDuckGo',r);return r}),
        fetchServerSide(name).then(r=>{
          if (r) {
            track('GDELT',           r.articles?.length>0?r.articles:null)
            track('Google News',     r.gnews?.length>0?r.gnews:null)
            track('Bing News',       r.bing?.length>0?r.bing:null)
            track('OpenSanctions',   r.sanctions?.length>0?r.sanctions:(r.ofac?.length>0?r.ofac:null))
            track('ICIJ OffshoreLeaks', r.icij?.length>0?r.icij:null)
            track('OpenCorporates',  r.companies?.length>0?r.companies:(r.officerships?.length>0?r.officerships:null))
            track('OCCRP ALEPH',     r.occrp?.length>0?r.occrp:null)
            track('Ahmia (Tor)',     r.ahmia?.length>0?r.ahmia:null)
            track('Wikipedia Links', r.wikiLinks?.length>0?r.wikiLinks:null)
            track('Entity Extract',  r.socialProfiles?.length>0?r.socialProfiles:(r.locations?.length>0?r.locations:null))
            track('GreyNoise',       r.greynoise)
            track('ThreatFox',       r.threatfox?.length>0?r.threatfox:null)
            track('WHOIS/RDAP',      r.whois)
            track('OpenSanctions',   (r.opensanctions?.length>0?r.opensanctions:null) || r.sanctions?.length>0?r.sanctions:null)
            track('Shodan',          r.shodan)
            track('VirusTotal',      r.virustotal)
            track('AbuseIPDB',       r.abuseipdb)
            track('LeakIX',          r.leakix?.length>0?r.leakix:null)
            track('Hunter.io',       r.hunterEmails?.length>0?r.hunterEmails:null)
          }
          return r
        }),
      ])

      const data = {
        wiki, wikidata, ddg,
        // Map api/intel.js field names → what synthesizeGroq expects
        gdelt:             { articles: serverData?.articles || [], articleCount: serverData?.articles?.length || 0 },
        newsapi:           serverData?.articles || [],
        googleNews:        serverData?.gnews || [],
        bingNews:          serverData?.bing || [],
        reddit:            [],
        rssNews:           serverData?.articles || [],
        sanctions:         serverData?.sanctions || serverData?.ofac || [],
        icij:              serverData?.icij || [],
        opencorp:          ocCached?.data?.companies || serverData?.companies || [],
        occrp:             serverData?.occrp || [],
        reliefweb:         serverData?.documents || [],
        scholar:           [],
        darkweb:           serverData?.ahmia || [],
        wikiLinks:         serverData?.wikiLinks || [],
        extractedEntities: serverData?.socialProfiles || [],
        courts:            serverData?.courts || [],
        dockets:           serverData?.dockets || [],
        interpol:          serverData?.interpol || [],
        ofac:              serverData?.ofac || [],
        ukCompanies:       serverData?.ukOfficers || [],
        opencorpOfficers:  ocCached?.data?.officerships || serverData?.officerships || [],
        worldbank:         serverData?.worldbank || [],
        fec:               serverData?.fec || [],
        locations:         serverData?.locations || [],
        sec:               serverData?.sec || [],
        intelx:            serverData?.intelx || [],
        socialProfiles:    serverData?.socialProfiles || [],
        // New OSINT tools added v85
        greynoise:         serverData?.greynoise || null,
        threatfox:         serverData?.threatfox || [],
        whois:             serverData?.whois || null,
        opensanctions_new: serverData?.opensanctions || [],
        shodan:            serverData?.shodan || null,
        virustotal:        serverData?.virustotal || null,
        ipinfo:            serverData?.ipinfo || null,
        bgpview:           serverData?.bgpview || null,
        urlscan:           serverData?.urlscan || [],
        abuseipdb:         serverData?.abuseipdb || null,
        leakix:            serverData?.leakix || [],
        hunterEmails:      serverData?.hunterEmails || [],
      }

      const hasData = Object.values(data).some(v=>v!=null&&(!Array.isArray(v)||v.length>0))
      if (!hasData) {
        setError(`No data found for "${name}". Try the full official name.`)
        return
      }

      // AI synthesis with everything
      let aiProfile = null
      if (groqKey) {
        setProgress('AI synthesis across all sources…')
        aiProfile = await synthesizeGroq(name, data, groqKey)
        track('Groq AI', aiProfile)
      }

      // Cache OC data to avoid burning API quota on repeat searches
      if (serverData?.companies?.length || serverData?.officerships?.length) {
        try { cacheWrite(ocCacheKey, { companies: serverData.companies, officerships: serverData.officerships }) } catch {}
      }

      setResult({ name, ...data, aiProfile, srcStatus:{...status}, enrichedAt:new Date() })

    } catch (e) {
      setError(`Error: ${e.message}`)
    } finally {
      setLoading(false); setProgress('')
    }
  }, [keys])

  const clear = useCallback(()=>{setResult(null);setError(null);setSrcStatus({})}, [])
  return { enrich, loading, progress, result, error, clear, srcStatus }
}
