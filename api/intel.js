// api/intel.js — NEXUS Core Intelligence Engine v5
// Clean rewrite: parallel-only, no sequential awaits, hard timeouts
// Vercel maxDuration: 60s

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const q = req.query?.q || req.query?.name || req.query?.query || ''
  const timespan = req.query?.timespan || '1year'
  const OC_TOKEN = process.env.OPENCORP_KEY || req.query?.opencorp_key || 'F6ypvqUI1qEk2OCJJQfC'
  if (!q) return res.status(400).json({ error: 'q required' })

  const query   = decodeURIComponent(q).trim()
  const words   = query.split(/\s+/).filter(w => w.length > 0)
  const surname  = words[words.length - 1] || query
  const forename = words.slice(0, -1).join(' ') || ''

  // ── DocSearch fast path — IntelX only, bypasses full enrichment pipeline ──
  // Called by DocSearchPanel with ?docSearch=1 to fix browser CORS block on IntelX
  if (req.query?.docSearch === '1') {
    const ixKey = req.query?.intelx_key || process.env.INTELX_KEY || '6a3d39ff-cafe-4b9d-980a-396d31e2b784'
    try {
      const ctrl1 = new AbortController()
      setTimeout(() => ctrl1.abort(), 15000)
      const r1 = await fetch('https://free.intelx.io/intelligent/search', {
        method: 'POST',
        headers: { 'x-key': ixKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: query, maxresults: 30, media: 0, target: 0, timeout: 20, sort: 4, terminate: [] }),
        signal: ctrl1.signal,
      })
      if (r1.ok) {
        const sd = await r1.json()
        if (sd?.id) {
          await new Promise(r => setTimeout(r, 3000))
          const ctrl2 = new AbortController()
          setTimeout(() => ctrl2.abort(), 12000)
          const r2 = await fetch(
            `https://free.intelx.io/intelligent/search/result?k=${ixKey}&id=${sd.id}&limit=30`,
            { signal: ctrl2.signal }
          )
          if (r2.ok) {
            const rd = await r2.json()
            return res.status(200).json({
              intelx: (rd?.records || []).map(r => ({
                name:   r.name || r.systemid,
                type:   r.type,
                date:   r.date?.slice(0, 10),
                bucket: r.bucket,
                url:    'https://intelx.io/?did=' + r.systemid,
              }))
            })
          }
        }
      }
    } catch {}
    return res.status(200).json({ intelx: [] })
  }

  // Pass-through OSINT keys from browser settings
  const qk = req.query || {}
  const KEYS = {
    intelx:    qk.intelx_key    || process.env.INTELX_KEY    || '6a3d39ff-cafe-4b9d-980a-396d31e2b784',
    virustotal:qk.virustotal_key|| process.env.VIRUSTOTAL_KEY|| '2004a33892a12a3c47e8eeb8992d9e3619c69ed36bc855aec11004aca3aba397',
    hibp:      qk.hibp_key      || process.env.HIBP_KEY      || '',
    hunter:    qk.hunter_key    || process.env.HUNTER_KEY    || '',
    dehashed:  qk.dehashed_key  || process.env.DEHASHED_KEY  || '',
    urlscan:   qk.urlscan_key   || process.env.URLSCAN_KEY   || '',
    abuseipdb: qk.abuseipdb_key || process.env.ABUSEIPDB_KEY || '',
    sectrails: qk.sectrails_key || process.env.SECTRAILS_KEY || '',
    wigle:     qk.wigle_key     || process.env.WIGLE_KEY     || '',
  }

  const isTechnical = /^[\d.]+$/.test(query) || query.includes('.') && !query.includes(' ')

  const get = async (url, ms = 8000, hdrs = {}) => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), ms)
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'NEXUS-Intel/5.0', ...hdrs } })
      clearTimeout(t)
      return r.ok ? r : null
    } catch { return null }
  }

  const results = {}

  // ── ALL SOURCES FIRE IN PARALLEL ─────────────────────────────────────────
  await Promise.allSettled([

    // ── WIKIPEDIA ───────────────────────────────────────────────────────────
    (async () => {
      const r = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/\s+/g,'_'))}`, 6000)
      if (!r) return
      const d = await r.json().catch(() => null)
      if (!d || d.type === 'disambiguation') return
      results.wiki = { title: d.title, description: d.description || '', extract: d.extract || '', thumbnail: d.thumbnail?.source || null, url: d.content_urls?.desktop?.page || null }
    })(),

    (async () => {
      const r = await get(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=links|categories&pllimit=80&cllimit=30&plnamespace=0&format=json`, 6000)
      if (!r) return
      const d = await r.json().catch(() => null)
      const pages = Object.values(d?.query?.pages || {})
      if (!pages.length) return
      results.wikiLinks = (pages[0]?.links || []).map(l => l.title).filter(t => !t.includes('(') && !t.match(/^\d/) && t.split(' ').length <= 4).slice(0, 35)
      results.wikiCategories = (pages[0]?.categories || []).map(c => c.title.replace('Category:', '')).slice(0, 20)
    })(),

    // ── WIKIDATA ─────────────────────────────────────────────────────────────
    (async () => {
      const sR = await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&limit=1&format=json`, 6000)
      if (!sR) return
      const sD = await sR.json().catch(() => null)
      const entity = sD?.search?.[0]
      if (!entity) return
      const dR = await get(`https://www.wikidata.org/wiki/Special:EntityData/${entity.id}.json`, 7000)
      if (!dR) return
      const dD = await dR.json().catch(() => null)
      const ent = dD?.entities?.[entity.id]
      if (!ent) return
      const cv = prop => (ent.claims?.[prop] || []).map(c => c?.mainsnak?.datavalue?.value).filter(Boolean)
      const idList = ids => [...new Set(ids.map(v => v?.id).filter(Boolean))]
      const allIds = [...new Set([
        ...idList(cv('P27')), ...idList(cv('P39')), ...idList(cv('P463')),
        ...idList(cv('P108')), ...idList(cv('P69')), ...idList(cv('P26')),
        ...idList(cv('P40')), ...idList(cv('P102')), ...idList(cv('P551')),
      ])].slice(0, 40)
      let lm = {}
      if (allIds.length) {
        const lR = await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${allIds.join('|')}&props=labels&languages=en&format=json`, 6000)
        if (lR) { const lD = await lR.json().catch(() => null); Object.entries(lD?.entities || {}).forEach(([id, e]) => { lm[id] = e?.labels?.en?.value || id }) }
      }
      const res = ids => idList(ids).map(id => lm[id]).filter(Boolean)
      const born = cv('P569')[0], died = cv('P570')[0]
      results.wikidata = {
        id: entity.id, description: entity.description || '',
        birthDate: born?.time?.slice(1, 11), birthPlace: res(cv('P19')).join(', '),
        deathDate: died?.time?.slice(1, 11), deathPlace: res(cv('P20')).join(', '),
        nationalities: res(cv('P27')), positions: res(cv('P39')), memberships: res(cv('P463')),
        employers: res(cv('P108')), education: res(cv('P69')), spouses: res(cv('P26')),
        children: res(cv('P40')), politicalParties: res(cv('P102')), residences: res(cv('P551')),
        netWorthAmount: cv('P2218')[0]?.amount,
        twitterId: cv('P2002')[0]?.value || null,
        instagramId: cv('P2003')[0]?.value || null,
        officialUrl: cv('P856')[0]?.value || null,
        wikidataUrl: 'https://www.wikidata.org/wiki/' + entity.id,
      }
    })(),

    // ── GDELT NEWS ──────────────────────────────────────────────────────────
    (async () => {
      const variants = [
        { q: query, n: 75 },
        words.length > 1 ? { q: `"${query}"`, n: 50 } : null,
        { q: `${query} corruption fraud sanction`, n: 25 },
        { q: `${query} court arrested charged`, n: 25 },
      ].filter(Boolean)
      const seen = new Set(), articles = []
      await Promise.allSettled(variants.map(({ q: vq, n }) => {
        const enc = encodeURIComponent(vq) + '%20sourcelang:english'
        const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${enc}&mode=artlist&maxrecords=${n}&sort=DateDesc&timespan=${timespan}&format=json`
        return get(url, 15000).then(async r => {
          if (!r) return
          const d = await r.json().catch(() => null)
          ;(d?.articles || []).forEach(a => {
            if (!a?.title) return
            const k = (a.url || a.title).slice(0, 80)
            if (seen.has(k)) return
            seen.add(k); articles.push(a)
          })
        }).catch(() => {})
      }))
      results.articles = articles
      const enc2 = encodeURIComponent(query) + '%20sourcelang:english'
      const r2 = await get(`https://api.gdeltproject.org/api/v2/doc/doc?query=${enc2}&mode=timelinevol&timespan=${timespan}&format=json`, 10000)
      if (r2) results.timeline = await r2.json().catch(() => null)
    })(),

    // ── GOOGLE NEWS ─────────────────────────────────────────────────────────
    (async () => {
      const r = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`, 6000)
      if (!r) return
      const xml = await r.text()
      results.gnews = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 30).map(m => {
        const title = (m[1].match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1]?.trim() || ''
        const link  = (m[1].match(/<link>(.*?)<\/link>/i) || [])[1]?.trim() || '#'
        const date  = (m[1].match(/<pubDate>(.*?)<\/pubDate>/i) || [])[1]?.trim() || ''
        if (!title || title.length < 5) return null
        return { title, url: link, source: 'Google News', pubDate: date }
      }).filter(Boolean)
    })(),

    // ── BING NEWS ────────────────────────────────────────────────────────────
    (async () => {
      const r = await get(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`, 6000)
      if (!r) return
      const xml = await r.text()
      results.bing = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 20).map(m => {
        const title = (m[1].match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1]?.trim() || ''
        const link  = (m[1].match(/<link>(.*?)<\/link>/i) || [])[1]?.trim() || '#'
        const date  = (m[1].match(/<pubDate>(.*?)<\/pubDate>/i) || [])[1]?.trim() || ''
        if (!title) return null
        return { title, url: link, source: 'Bing News', pubDate: date }
      }).filter(Boolean)
    })(),

    // ── OPENSANCTIONS ────────────────────────────────────────────────────────
    (async () => {
      const seen = new Set(), all = []
      await Promise.allSettled([
        get(`https://api.opensanctions.org/search/default?q=${encodeURIComponent(query)}&limit=50`, 12000),
        forename ? get(`https://api.opensanctions.org/search/default?q=${encodeURIComponent(surname)}&limit=30`, 12000) : null,
      ].filter(Boolean).map(async rp => {
        const r = await rp; if (!r) return
        const d = await r.json().catch(() => null)
        ;(d?.results || []).forEach(e => {
          if (seen.has(e.id)) return; seen.add(e.id)
          all.push({ id: e.id, name: e.caption, schema: e.schema, datasets: e.datasets || [], score: e.score, properties: e.properties || {}, url: `https://www.opensanctions.org/entities/${e.id}/` })
        })
      }))
      results.sanctions = all
    })(),

    // ── OFAC ─────────────────────────────────────────────────────────────────
    (async () => {
      const r = await get(`https://api.ofac.treas.gov/v1/sdn/search?firstName=${encodeURIComponent(forename)}&lastName=${encodeURIComponent(surname)}&score=80`, 6000)
      if (!r) return
      const d = await r.json().catch(() => null)
      results.ofac = (d?.sdnList?.sdnEntry || []).slice(0, 10).map(s => ({
        uid: s.uid, name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        sdnType: s.sdnType, program: [s.programList?.program].flat().filter(Boolean).join(', '),
        remarks: s.remarks?.slice(0, 300),
      })).filter(s => s.name.trim())
    })(),

    // ── INTERPOL ─────────────────────────────────────────────────────────────
    (async () => {
      const seen = new Set(), all = []
      const urls = [
        forename ? `https://ws-public.interpol.int/notices/v1/red?name=${encodeURIComponent(surname)}&forename=${encodeURIComponent(forename)}&resultPerPage=10` : null,
        `https://ws-public.interpol.int/notices/v1/red?name=${encodeURIComponent(surname)}&resultPerPage=10`,
      ].filter(Boolean)
      await Promise.allSettled(urls.map(async url => {
        const r = await get(url, 6000); if (!r) return
        const d = await r.json().catch(() => null)
        ;(d?._embedded?.notices || []).forEach(n => {
          if (seen.has(n.entity_id)) return; seen.add(n.entity_id)
          all.push({ name: `${n.forename || ''} ${n.name || ''}`.trim(), dob: n.date_of_birth, nationalities: n.nationalities || [], charges: (n.arrest_warrants || []).map(w => `${w.charge} (${w.issuing_country_id})`).join('; '), url: n._links?.self?.href || '' })
        })
      }))
      results.interpol = all
    })(),

    // ── ICIJ OFFSHORE LEAKS ──────────────────────────────────────────────────
    (async () => {
      const r = await get(`https://offshoreleaks.icij.org/api/v1/search?q=${encodeURIComponent(query)}&c=&j=&d=&e=`, 7000, { 'Accept': 'application/json' })
      if (!r) return
      const d = await r.json().catch(() => null)
      results.icij = (d?.data || d?.results || []).slice(0, 30).map(n => ({
        nodeId: n.nodeId || n.id, name: n.caption || n.name, type: n.nodeType || n.type,
        jurisdiction: n.country || n.countries, source: n.dataFrom || n.sourceId,
        url: `https://offshoreleaks.icij.org/nodes/${n.nodeId || n.id}`,
      }))
    })(),

    // ── OPENCORPORATES — /companies/search + /officers/search (correct v0.4 endpoints) ──
    (async () => {
      // NOTE: /entities/search does NOT exist in OC API v0.4
      // Correct endpoints: /companies/search and /officers/search
      // Stagger 500ms to respect 2 req/sec limit
      let cR = null, oR = null
      try {
        cR = await get(
          `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(query)}&format=json&api_token=${OC_TOKEN}`,
          12000
        )
      } catch {}
      await new Promise(r => setTimeout(r, 500))
      try {
        oR = await get(
          `https://api.opencorporates.com/v0.4/officers/search?q=${encodeURIComponent(query)}&format=json&api_token=${OC_TOKEN}`,
          12000
        )
      } catch {}

      if (cR) {
        const d = await cR.json().catch(() => null)
        results.companies = (d?.results?.companies || []).map(({ company: c }) => ({
          name: c.name,
          number: c.company_number,
          jurisdiction: c.jurisdiction_code,
          status: c.current_status,
          type: c.company_type,
          incorporated: c.incorporation_date,
          dissolved: c.dissolution_date,
          address: c.registered_address_in_full,
          registered_address: c.registered_address,
          registered_agent: c.registered_agent_name,
          industry_codes: c.industry_codes,
          source: c.source,
          url: c.opencorporates_url,
          registry_url: c.registry_url,
          officers: (c.officers || []).map(o => o.officer || o),
          filings: (c.filings || []).slice(0, 10).map(f => f.filing || f),
          identifiers: c.identifiers,
          _raw: c,
        }))
      }
      if (oR) {
        const d = await oR.json().catch(() => null)
        results.officerships = (d?.results?.officers || []).map(({ officer: o }) => ({
          name: o.name,
          position: o.position,
          uid: o.uid,
          start_date: o.start_date,
          end_date: o.end_date,
          nationality: o.nationality,
          occupation: o.occupation,
          date_of_birth: o.date_of_birth,
          address: o.address,
          company_name: o.company?.name,
          company_number: o.company?.company_number,
          company_jurisdiction: o.company?.jurisdiction_code,
          company_status: o.company?.current_status,
          company_url: o.company?.opencorporates_url,
          url: o.opencorporates_url,
          _raw: o,
        }))
      }
    })(),

    // ── UK COMPANIES HOUSE ──────────────────────────────────────────────────
    (async () => {
      const chKey = process.env.CH_KEY || 'b0f7d629-b392-4e9b-9a4f-89fa05732829'
      const r = await get(`https://api.company-information.service.gov.uk/search/officers?q=${encodeURIComponent(query)}&items_per_page=40`, 6000, { 'Authorization': 'Basic ' + btoa(chKey + ':') })
      if (!r) return
      const d = await r.json().catch(() => null)
      results.ukOfficers = (d?.items || []).slice(0, 40).map(o => ({ name: o.title, kind: o.kind, dateOfBirth: o.date_of_birth ? `${o.date_of_birth.year}-${o.date_of_birth.month}` : null, address: o.address?.locality, url: 'https://find-and-update.company-information.service.gov.uk' + (o.links?.self || '') }))
    })(),

    // ── COURTLISTENER ───────────────────────────────────────────────────────
    (async () => {
      const [oR, dR, pR, fR] = await Promise.all([
        get(`https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(query)}&type=o&page_size=50&format=json`, 10000),
        get(`https://www.courtlistener.com/api/rest/v4/dockets/?q=${encodeURIComponent(query)}&format=json&page_size=50`, 10000),
        get(`https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(query)}&type=p&page_size=20&format=json`, 8000),
        get(`https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(query)}&type=fd&page_size=20&format=json`, 8000),
      ])
      if (oR) { const d = await oR.json().catch(() => null); results.courts = (d?.results || []).map(c => ({
            caseName: c.caseName || c.case_name || 'Unnamed Case',
            court:    c.court || '',
            date:     c.dateFiled || c.date_filed || '',
            status:   c.status || '',
            snippet:  c.snippet?.replace(/<[^>]+>/g,'').slice(0,200) || '',
            url:      c.absolute_url ? 'https://www.courtlistener.com' + c.absolute_url : (c.download_url || ''),
          })) }
      if (dR) { const d = await dR.json().catch(() => null); results.dockets = (d?.results || []).map(c => ({
            caseName: c.case_name || c.caseName || 'Unnamed Docket',
            court:    c.court_id || c.court || '',
            date:     c.date_filed || '',
            closed:   c.date_terminated || '',
            status:   c.pacer_case_id ? 'PACER #' + c.pacer_case_id : (c.status || ''),
            url:      c.absolute_url ? 'https://www.courtlistener.com' + c.absolute_url : '',
          })) }
      if (pR) { const d = await pR.json().catch(() => null); results.courtPeople = (d?.results || []).map(p => ({ name: p.name, type: p.types?.[0], url: p.absolute_url ? 'https://www.courtlistener.com' + p.absolute_url : '' })) }
      if (fR) { const d = await fR.json().catch(() => null); results.courtFinancial = (d?.results || []).map(f => ({ caseName: f.caseName || f.name, year: f.year, url: f.absolute_url ? 'https://www.courtlistener.com' + f.absolute_url : '' })) }
    })(),

    // ── FEC CAMPAIGN FINANCE ────────────────────────────────────────────────
    (async () => {
      const fecKey = 'ufw4XZ0AeWXuLxW4VRONGLDrnUATTlunIi308iZj'
      const [cR, cmR, sR] = await Promise.all([
        get(`https://api.open.fec.gov/v1/candidates/search/?q=${encodeURIComponent(query)}&api_key=${fecKey}&per_page=100&sort=-receipts`, 8000),
        get(`https://api.open.fec.gov/v1/committees/?q=${encodeURIComponent(query)}&api_key=${fecKey}&per_page=100`, 8000),
        get(`https://api.open.fec.gov/v1/schedules/schedule_a/?contributor_name=${encodeURIComponent(query)}&api_key=${fecKey}&per_page=50&sort=-contribution_receipt_date`, 8000),
      ])
      results.fec = {}
      if (cR) { const d = await cR.json().catch(() => null); results.fec.candidates = (d?.results || []).map(c => ({ name: c.name, party: c.party, state: c.state, office: c.office, cycles: c.election_years })) }
      if (cmR) { const d = await cmR.json().catch(() => null); results.fec.committees = (d?.results || []).map(c => ({ name: c.name, type: c.committee_type_full, party: c.party, state: c.state })) }
      if (sR) { const d = await sR.json().catch(() => null); results.fec.contributions = (d?.results || []).map(c => ({ amount: c.contribution_receipt_amount, date: c.contribution_receipt_date, recipient: c.committee?.name, employer: c.contributor_employer })) }
    })(),

    // ── DOCUMENTCLOUD ───────────────────────────────────────────────────────
    (async () => {
      const PER_PAGE = 100, MAX_PAGES = 5
      const allDocs = [], seen = new Set()
      const mapDoc = doc => ({ title: doc.title, source: doc.source || doc.organization?.name || '', created: doc.created_at?.slice(0, 10), description: doc.description?.slice(0, 300), url: doc.canonical_url || `https://www.documentcloud.org/documents/${doc.id}`, pages: doc.page_count, id: doc.id })
      const firstR = await get(`https://api.www.documentcloud.org/api/documents/search/?q=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=1`, 10000)
      if (!firstR) return
      const firstD = await firstR.json().catch(() => null)
      if (!firstD) return
      const total = firstD.count || 0
      ;(firstD.results || []).forEach(doc => { if (!doc.title || seen.has(doc.id)) return; seen.add(doc.id); allDocs.push(mapDoc(doc)) })
      if (total > PER_PAGE) {
        const pages = Math.min(Math.ceil(total / PER_PAGE), MAX_PAGES)
        await Promise.allSettled(Array.from({ length: pages - 1 }, (_, i) => i + 2).map(async page => {
          const r = await get(`https://api.www.documentcloud.org/api/documents/search/?q=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}`, 10000)
          if (!r) return
          const d = await r.json().catch(() => null)
          ;(d?.results || []).forEach(doc => { if (!doc.title || seen.has(doc.id)) return; seen.add(doc.id); allDocs.push(mapDoc(doc)) })
        }))
      }
      results.documents = allDocs.filter(d => d.title).sort((a, b) => (b.created || '').localeCompare(a.created || ''))
    })(),

    // ── WORLD BANK DEBARRED ─────────────────────────────────────────────────
    (async () => {
      const r = await get(`https://apigwext.worldbank.org/dvsvc/v1.0/json/APPLICATION/ADOBE_EXPRNC_MGR/FIRM/SANCTIONED_FIRM?srchTerm=${encodeURIComponent(query)}`, 7000)
      if (!r) return
      const d = await r.json().catch(() => null)
      results.worldbank = (d?.response?.ZPROCSUPP || []).slice(0, 20).map(f => ({ name: f.SUPPLIERNAME, country: f.COUNTRY, from: f.INELIGIBILITY_FROM_DT, to: f.INELIGIBILITY_TO_DT, grounds: f.GROUNDS }))
    })(),

    // ── OCCRP ALEPH ─────────────────────────────────────────────────────────
    (async () => {
      const r = await get(`https://aleph.occrp.org/api/2/search?q=${encodeURIComponent(query)}&limit=20`, 8000, { 'Accept': 'application/json' })
      if (!r) return
      const d = await r.json().catch(() => null)
      results.occrp = (d?.results || []).map(e => ({ id: e.id, caption: e.caption, schema: e.schema, dataset: e.collection?.label || '', country: (e.countries || [])[0] || '', url: 'https://aleph.occrp.org/entities/' + e.id }))
    })(),

    // ── LOCATIONS (OpenStreetMap) ────────────────────────────────────────────
    (async () => {
      const r = await get(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`, 5000)
      if (!r) return
      const d = await r.json().catch(() => null)
      results.locations = (d || []).map(p => ({ name: p.display_name, lat: p.lat, lng: p.lon, type: p.type, cls: p.class, country: p.address?.country }))
    })(),

    // ── SEC EDGAR — full-text search for filings mentioning this entity ──────
    (async () => {
      const seen = new Set(), hits = []
      // Full-text search across all filings
      const r1 = await get('https://efts.sec.gov/LATEST/search-index?q=%22' + encodeURIComponent(query) + '%22&dateRange=custom&startdt=2010-01-01&forms=10-K,8-K,DEF+14A,SC+13G,SC+13D,4,3&_source=period_of_report,file_date,form_type,display_names,file_num,period_of_report&hits.hits.total.value=true', 8000)
      if (r1) {
        const d1 = await r1.json().catch(() => null)
        ;(d1?.hits?.hits || []).forEach(h => {
          const src = h._source || {}
          const key = (src.file_num || '') + src.file_date
          if (seen.has(key)) return; seen.add(key)
          hits.push({
            entity:  (src.display_names || []).join(', ') || query,
            form:    src.form_type || '',
            date:    src.file_date || src.period_of_report || '',
            period:  src.period_of_report || '',
            url:     h._id ? 'https://www.sec.gov/Archives/edgar/data/' + h._id.split(':')[0] + '/' + h._id.split(':')[1] + '.txt' : 'https://efts.sec.gov/LATEST/search-index?q=%22' + encodeURIComponent(query) + '%22',
          })
        })
      }
      // Also search company filings directly
      const r2 = await get('https://efts.sec.gov/LATEST/search-index?q=%22' + encodeURIComponent(query) + '%22&dateRange=custom&startdt=2010-01-01&category=form-type', 8000)
      if (r2) {
        const d2 = await r2.json().catch(() => null)
        ;(d2?.hits?.hits || []).forEach(h => {
          const src = h._source || {}
          const key = (src.file_num || '') + src.file_date
          if (seen.has(key)) return; seen.add(key)
          hits.push({
            entity:  (src.display_names || []).join(', ') || query,
            form:    src.form_type || '',
            date:    src.file_date || '',
            period:  src.period_of_report || '',
            url:     'https://efts.sec.gov/LATEST/search-index?q=%22' + encodeURIComponent(query) + '%22',
          })
        })
      }
      results.sec = hits.slice(0, 30)
    })(),

    // ── DUCKDUCKGO SIGNALS (7 angles) ────────────────────────────────────────
    (async () => {
      const angles = [
        { key: 'ddgLeaks',     q: `"${query}" leak OR breach OR hack OR exposed` },
        { key: 'ddgDarkweb',   q: `"${query}" darkweb OR dark-web OR onion OR tor` },
        { key: 'ddgCriminal',  q: `"${query}" arrested OR convicted OR indicted OR charges OR sentenced` },
        { key: 'ddgFinancial', q: `"${query}" money laundering OR fraud OR embezzle OR ponzi OR SEC OR CFTC` },
        { key: 'ddgSocial',    q: `"${query}" twitter OR instagram OR linkedin OR facebook OR social media` },
        { key: 'ddgAddress',   q: `"${query}" address OR residence OR property OR estate` },
        { key: 'ddgCrypto',    q: `"${query}" bitcoin OR crypto OR blockchain OR wallet OR exchange` },
      ]
      await Promise.allSettled(angles.map(async ({ key, q: aq }) => {
        const r = await get(`https://api.duckduckgo.com/?q=${encodeURIComponent(aq)}&format=json&no_redirect=1&no_html=1`, 5000)
        if (!r) return
        const d = await r.json().catch(() => null)
        results[key] = d?.RelatedTopics?.length ? d : null
      }))
    })(),

    // ── SOCIAL PROFILES (full-name handles only) ───────────────────────────
    (async () => {
      // Only generate handles from the FULL NAME, never individual words
      const fullName = query.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '')
      const handles = [
        fullName.replace(/\s+/g, ''),        // vladimirputin
        fullName.replace(/\s+/g, '_'),        // vladimir_putin
        fullName.replace(/\s+/g, '-'),        // vladimir-putin
        fullName.replace(/\s+/g, '.'),        // vladimir.putin
        (words[0]?.[0] || '') + (words[words.length-1] || '').toLowerCase(),  // vputin
      ].filter((v, i, a) => v.length > 3 && a.indexOf(v) === i)

      const platforms = [
        { name: 'Twitter/X', url: 'https://twitter.com/' },
        { name: 'LinkedIn',  url: 'https://www.linkedin.com/in/' },
        { name: 'GitHub',    url: 'https://github.com/' },
        { name: 'Instagram', url: 'https://www.instagram.com/' },
        { name: 'Telegram',  url: 'https://t.me/' },
        { name: 'Reddit',    url: 'https://www.reddit.com/user/' },
        { name: 'YouTube',   url: 'https://www.youtube.com/@' },
      ]
      results.socialProfiles = handles.flatMap(h => platforms.map(p => ({ platform: p.name, handle: h, url: p.url + h })))
      results.usernameProfiles = results.socialProfiles  // alias used by some UI tabs
    })(),

    // ── USERNAME SEARCH (Sherlock-style DDG) ─────────────────────────────────
    (async () => {
      const handle = words.join('').toLowerCase().replace(/[^a-z0-9_]/g, '')
      if (handle.length < 3) return
      const r = await get(`https://api.duckduckgo.com/?q=${encodeURIComponent(handle + ' site:twitter.com OR site:instagram.com OR site:github.com OR site:reddit.com')}&format=json&no_redirect=1&no_html=1`, 5000)
      if (!r) return
      const d = await r.json().catch(() => null)
      results.usernameSearch = d?.RelatedTopics?.length ? d : null
    })(),

    // ── PASTE / LEAK SEARCH (DDG) ────────────────────────────────────────────
    (async () => {
      const r = await get(`https://api.duckduckgo.com/?q=${encodeURIComponent('"' + query + '" site:pastebin.com OR site:ghostbin.co OR site:hastebin.com OR site:controlc.com')}&format=json&no_redirect=1&no_html=1`, 5000)
      if (!r) return
      const d = await r.json().catch(() => null)
      results.pastes = (d?.RelatedTopics || []).slice(0, 15).map(t => ({ text: (t.Text || '').slice(0, 200), url: t.FirstURL || '' })).filter(t => t.text)
    })(),

    // ── WAYBACK MACHINE ──────────────────────────────────────────────────────
    (async () => {
      const r = await get(`https://web.archive.org/cdx/search/cdx?url=*${encodeURIComponent(words[0] || query)}*&output=json&limit=8&fl=original,timestamp,statuscode&collapse=urlkey&filter=statuscode:200`, 5000)
      if (!r) return
      const d = await r.json().catch(() => null)
      results.wayback = Array.isArray(d) ? d.slice(1, 9).map(([url, ts]) => ({ url, date: ts?.slice(0, 8), archiveUrl: `https://web.archive.org/web/${ts}/${url}` })) : []
    })(),

    // ── AHMIA (Tor search) ───────────────────────────────────────────────────
    (async () => {
      const r = await get(`https://ahmia.fi/search/?q=${encodeURIComponent(query)}`, 7000)
      if (!r) return
      const html = await r.text()
      const matches = [...html.matchAll(/<li class="result"[^>]*>([\s\S]*?)<\/li>/gi)]
      results.ahmia = matches.slice(0, 10).map(m => {
        const title = m[1].match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || ''
        const url = m[1].match(/href="([^"]+)"/)?.[1] || ''
        return { title, url }
      }).filter(t => t.title)
    })(),

    // ── INDIAN COURTS ────────────────────────────────────────────────────────
    (async () => {
      const r = await get(`https://api.duckduckgo.com/?q=${encodeURIComponent('"' + query + '" site:ecourts.gov.in OR site:indiankanoon.org')}&format=json&no_redirect=1&no_html=1`, 5000)
      if (!r) return
      const d = await r.json().catch(() => null)
      results.indianCourts = (d?.RelatedTopics || []).slice(0, 6).map(t => ({ text: (t.Text || '').slice(0, 200), url: t.FirstURL || '' })).filter(t => t.text)
    })(),

    // ── TECHNICAL OSINT (only for IPs/domains) ────────────────────────────────
    ...(isTechnical ? [
      (async () => {
        const r = await get(`https://internetdb.shodan.io/${encodeURIComponent(query)}`, 5000)
        if (!r) return
        const d = await r.json().catch(() => null)
        results.shodan = d
      })(),
      (async () => {
        const r = await get(`https://ipinfo.io/${encodeURIComponent(query)}/json`, 5000)
        if (!r) return
        const d = await r.json().catch(() => null)
        results.ipinfo = d
      })(),
      (async () => {
        const isASN = /^as\d+$/i.test(query)
        const isIP  = /^\d{1,3}\.\d{1,3}/.test(query)
        const url = isASN ? `https://api.bgpview.io/asn/${query.replace(/^as/i,'')}` : isIP ? `https://api.bgpview.io/ip/${query}` : `https://api.bgpview.io/search?query_term=${encodeURIComponent(query)}`
        const r = await get(url, 8000)
        if (!r) return
        const d = await r.json().catch(() => null)
        results.bgpview = d?.data
      })(),
    ] : []),

    // ── INTELX (dark web / breach) ────────────────────────────────────────────
    (async () => {
      try {
        const ixResp = await fetch('https://free.intelx.io/intelligent/search', {
          method: 'POST',
          headers: { 'x-key': KEYS.intelx, 'Content-Type': 'application/json' },
          body: JSON.stringify({ term: query, maxresults: 20, media: 0, target: 0, timeout: 20, sort: 4, terminate: [] }),
          signal: AbortSignal.timeout(15000)
        })
        if (!ixResp.ok) return
        const sd = await ixResp.json()
        if (!sd?.id) return
        await new Promise(r => setTimeout(r, 2000))
        const rr = await fetch(`https://free.intelx.io/intelligent/search/result?k=${KEYS.intelx}&id=${sd.id}&limit=20`, { signal: AbortSignal.timeout(10000) })
        if (!rr.ok) return
        const rd = await rr.json()
        results.intelx = (rd?.records || []).map(r => ({ name: r.name || r.systemid, type: r.type, date: r.date?.slice(0, 10), bucket: r.bucket, url: 'https://intelx.io/?did=' + r.systemid }))
      } catch {}
    })(),

    // ── VIRUSTOTAL ───────────────────────────────────────────────────────────
    ...(KEYS.virustotal && isTechnical ? [
      (async () => {
        const isIP = /^\d{1,3}\.\d{1,3}/.test(query)
        const isDomain = query.includes('.') && !query.includes(' ')
        const endpoint = isIP ? `https://www.virustotal.com/api/v3/ip_addresses/${query}` : isDomain ? `https://www.virustotal.com/api/v3/domains/${query}` : `https://www.virustotal.com/api/v3/search?query=${encodeURIComponent(query)}&limit=10`
        const r = await get(endpoint, 8000, { 'x-apikey': KEYS.virustotal })
        if (!r) return
        const d = await r.json().catch(() => null)
        const attr = d?.data?.attributes || d?.data?.[0]?.attributes
        if (!attr) return
        results.virustotal = { malicious: attr.last_analysis_stats?.malicious || 0, suspicious: attr.last_analysis_stats?.suspicious || 0, harmless: attr.last_analysis_stats?.harmless || 0, reputation: attr.reputation, tags: attr.tags?.slice(0, 8), country: attr.country, lastAnalysis: attr.last_analysis_date }
      })()
    ] : []),

    // ── HIBP ─────────────────────────────────────────────────────────────────
    ...(KEYS.hibp && (query.includes('@') || isTechnical) ? [
      (async () => {
        const endpoint = query.includes('@')
          ? `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(query)}?includeUnverified=true`
          : `https://haveibeenpwned.com/api/v3/breacheddomain/${encodeURIComponent(query)}`
        const r = await get(endpoint, 8000, { 'hibp-api-key': KEYS.hibp, 'User-Agent': 'NEXUS-Intel' })
        if (!r) return
        const d = await r.json().catch(() => null)
        results.hibpBreaches = Array.isArray(d) ? d.map(b => ({ name: b.Name, domain: b.Domain, date: b.BreachDate, count: b.PwnCount, types: b.DataClasses?.slice(0, 5) })) : []
      })()
    ] : []),

    // ── HUNTER.IO ────────────────────────────────────────────────────────────
    ...(KEYS.hunter && isTechnical ? [
      (async () => {
        const r = await get(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(query)}&api_key=${KEYS.hunter}&limit=20`, 8000)
        if (!r) return
        const d = await r.json().catch(() => null)
        results.hunterEmails = (d?.data?.emails || []).map(e => ({ email: e.value, firstName: e.first_name, lastName: e.last_name, position: e.position, confidence: e.confidence }))
        results.hunterOrg = d?.data ? { domain: d.data.domain, organization: d.data.organization, country: d.data.country } : null
      })()
    ] : []),

    // ── URLSCAN ──────────────────────────────────────────────────────────────
    ...(KEYS.urlscan && isTechnical ? [
      (async () => {
        const r = await get(`https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(query)}&size=10`, 8000, { 'API-Key': KEYS.urlscan })
        if (!r) return
        const d = await r.json().catch(() => null)
        results.urlscan = (d?.results || []).map(r => ({ url: r.page?.url, domain: r.page?.domain, ip: r.page?.ip, country: r.page?.country, malicious: r.verdicts?.overall?.malicious, score: r.verdicts?.overall?.score, date: r.task?.time?.slice(0, 10), reportUrl: `https://urlscan.io/result/${r.task?.uuid}/` }))
      })()
    ] : []),


    // ── LEAKIX (exposed services - no key needed) ────────────────────────────
    ...(isTechnical ? [
      (async () => {
        const r = await get(`https://leakix.net/api/host/${encodeURIComponent(query)}`, 8000, { 'Accept': 'application/json' })
        if (!r) return
        const d = await r.json().catch(() => null)
        results.leakix = Array.isArray(d) ? d.slice(0, 10).map(e => ({ ip: e.ip, port: e.port, protocol: e.protocol, summary: e.summary?.slice(0, 200), leak: e.leak?.dataset })) : []
      })(),

      // ── GreyNoise Community API — free, IP context ─────────────────────
      (async () => {
        if (!isIP) return
        try {
          const r = await fetch(`https://api.greynoise.io/v3/community/${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(6000) })
          if (!r.ok) return
          const d = await r.json().catch(()=>null)
          if (d && !d.message?.includes('not found'))
            results.greynoise = { noise: d.noise, riot: d.riot, classification: d.classification, name: d.name, link: d.link, lastSeen: d.last_seen, message: d.message }
        } catch {}
      })(),

      // ── ThreatFox (abuse.ch) — IOC database, no key needed ─────────────
      (async () => {
        if (!isTechnical) return
        try {
          const payload = JSON.stringify({ query: 'search_ioc', search_term: query, exact_match: false })
          const r = await fetch('https://threatfox-api.abuse.ch/api/v1/', { method:'POST', headers:{'Content-Type':'application/json'}, body:payload, signal:AbortSignal.timeout(8000) })
          if (!r.ok) return
          const d = await r.json().catch(()=>null)
          if (d?.data?.length) results.threatfox = d.data.slice(0,10).map(i=>({ ioc:i.ioc, type:i.ioc_type, malware:i.malware, confidence:i.confidence_level, firstSeen:i.first_seen, tags:i.tags }))
        } catch {}
      })(),

      // ── WHOIS via RDAP (IANA standard, free, no key) ────────────────────
      (async () => {
        if (!isDomain && !isIP) return
        try {
          const rdapUrl = isIP
            ? `https://rdap.arin.net/registry/ip/${encodeURIComponent(query)}`
            : `https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(query)}`
          const r = await get(rdapUrl, 8000)
          if (!r) return
          const d = await r.json().catch(()=>null)
          if (!d) return
          results.whois = {
            name: d.name || d.handle,
            registrar: d.entities?.find(e=>e.roles?.includes('registrar'))?.vcardArray?.[1]?.find(v=>v[0]==='fn')?.[3],
            registrant: d.entities?.find(e=>e.roles?.includes('registrant'))?.vcardArray?.[1]?.find(v=>v[0]==='org')?.[3],
            created: d.events?.find(e=>e.eventAction==='registration')?.eventDate?.slice(0,10),
            updated: d.events?.find(e=>e.eventAction==='last changed')?.eventDate?.slice(0,10),
            expires: d.events?.find(e=>e.eventAction==='expiration')?.eventDate?.slice(0,10),
            nameservers: (d.nameservers||[]).map(n=>n.ldhName).slice(0,6),
            status: d.status, country: d.country,
          }
        } catch {}
      })(),

      // ── OpenSanctions — free entity screening API ───────────────────────
      (async () => {
        if (isIP || isDomain) return
        try {
          const fr = await fetch('https://api.opensanctions.org/match/default', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queries: { q1: { schema: 'Thing', properties: { name: [query] } } } }),
            signal: AbortSignal.timeout(8000)
          })
          if (!fr.ok) return
          const d = await fr.json().catch(()=>null)
          const hits = d?.responses?.q1?.results || []
          if (hits.length) results.opensanctions = hits.slice(0,5).map(h=>({ id:h.id, caption:h.caption, score:h.score, datasets:h.datasets, sanctioned:(h.properties?.sanction?.length||0)>0, country:h.properties?.country }))
        } catch {}
      })(),

    ] : []),

    // ── EMAIL REPUTATION ────────────────────────────────────────────────────
    ...(query.includes('@') ? [
      (async () => {
        const r = await get(`https://emailrep.io/${encodeURIComponent(query)}`, 6000, { 'User-Agent': 'NEXUS-Intel/5.0' })
        if (!r) return
        const d = await r.json().catch(() => null)
        results.emailrep = d
        results.emailRep = d  // capitalisation alias
      })(),
    ] : []),

    // ── ABUSEIPDB ────────────────────────────────────────────────────────────
    ...(KEYS.abuseipdb && isTechnical ? [
      (async () => {
        const r = await get(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(query)}&maxAgeInDays=90&verbose`, 8000, { 'Key': KEYS.abuseipdb, 'Accept': 'application/json' })
        if (!r) return
        const d = await r.json().catch(() => null)
        if (d?.data) results.abuseipdb = { score: d.data.abuseConfidenceScore, totalReports: d.data.totalReports, isp: d.data.isp, country: d.data.countryCode, domain: d.data.domain, lastReported: d.data.lastReportedAt }
      })(),
    ] : []),

    // ── SECURITYTRAILS ────────────────────────────────────────────────────────
    ...(KEYS.sectrails && isTechnical ? [
      (async () => {
        const r = await get(`https://api.securitytrails.com/v1/domain/${encodeURIComponent(query)}/subdomains?children_only=false&include_inactive=false`, 8000, { 'APIKEY': KEYS.sectrails })
        if (!r) return
        const d = await r.json().catch(() => null)
        results.sectrailsSubs = (d?.subdomains || []).map(s => s + '.' + query).slice(0, 200)
        results.sectrailsDns = d?.subdomain_count || 0
        results.sectrailsDNS = results.sectrailsDns  // capitalisation alias
      })(),
    ] : []),

    // ── DEHASHED ─────────────────────────────────────────────────────────────
    ...(KEYS.dehashed ? [
      (async () => {
        const auth = 'Basic ' + btoa('nexus:' + KEYS.dehashed)
        const r = await get(`https://api.dehashed.com/search?query=${encodeURIComponent('"' + query + '"')}&size=20`, 8000, { 'Authorization': auth, 'Accept': 'application/json' })
        if (!r) return
        const d = await r.json().catch(() => null)
        results.dehashed = (d?.entries || []).slice(0, 20).map(e => ({ id: e.id, email: e.email, username: e.username, password: e.hashed_password ? '[FOUND]' : null, name: e.name, database: e.database_name }))
      })(),
    ] : []),


    // ── WIGLE WiFi OSINT ─────────────────────────────────────────────────────
    ...(KEYS.wigle && !isTechnical ? [
      (async () => {
        const r = await get(`https://api.wigle.net/api/v2/network/search?ssid=${encodeURIComponent(query)}&resultsPerPage=10`, 8000, { 'Authorization': 'Basic ' + KEYS.wigle })
        if (!r) return
        const d = await r.json().catch(() => null)
        results.wigleNetworks = (d?.results || []).map(n => ({ ssid: n.ssid, bssid: n.netid, lat: n.trilat, lng: n.trilong, lastSeen: n.lasttime, city: n.city, country: n.country }))
      })(),
    ] : []),

  ])

  results._summary = {
    query,
    articles:      results.articles?.length || 0,
    gnews:         results.gnews?.length || 0,
    bing:          results.bing?.length || 0,
    wiki:          results.wiki ? 1 : 0,
    wikidata:      results.wikidata ? 1 : 0,
    sanctions:     results.sanctions?.length || 0,
    ofac:          results.ofac?.length || 0,
    interpol:      results.interpol?.length || 0,
    courts:        results.courts?.length || 0,
    dockets:       results.dockets?.length || 0,
    companies:     results.companies?.length || 0,
    officerships:  results.officerships?.length || 0,
    icij:          results.icij?.length || 0,
    sec:           results.sec?.length || 0,
    ukOfficers:    results.ukOfficers?.length || 0,
    fec:           (results.fec?.candidates?.length || 0) + (results.fec?.committees?.length || 0),
    worldbank:     results.worldbank?.length || 0,
    documents:     results.documents?.length || 0,
    pastes:        results.pastes?.length || 0,
    wayback:       results.wayback?.length || 0,
    socialProfiles:results.socialProfiles?.length || 0,
    locations:     results.locations?.length || 0,
    indianCourts:  results.indianCourts?.length || 0,
    occrp:         results.occrp?.length || 0,
    intelx:        results.intelx?.length || 0,
    fetchedAt:     new Date().toISOString(),
  }

  res.status(200).json(results)
}
