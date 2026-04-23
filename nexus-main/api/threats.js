// api/threats.js — NEXUS Cyber & Threat Intelligence
// All free sources: CISA KEV, NVD CVEs, OTX AlienVault, GreyNoise community,
// CIRCL CVE, MITRE ATT&CK, Abuse.ch, Feodo tracker, URLhaus, MalwareBazaar,
// Shodan internetdb, SpamHaus, PhishTank

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const SHODAN_KEY      = process.env.SHODAN_KEY      || 'CwHKC0EtdYHtGejGE5CX9o0R4pMLe2LZ'
  const GREYNOISE_KEY   = process.env.GREYNOISE_KEY   || ''
  const CENSYS_ID     = process.env.CENSYS_ID     || 'censys_Dh3Lx7Mm'
  const CENSYS_SECRET = process.env.CENSYS_SECRET || '_9pwotibu3GTV1REWWYCkqomT'
  const OTX_KEY        = process.env.OTX_KEY        || 'fb9962a963a512fcfb63be7053b1f66ab3de6818d8bd2d5330510d0c1edea4a0'
  const VIRUSTOTAL_KEY = process.env.VIRUSTOTAL_KEY || '2004a33892a12a3c47e8eeb8992d9e3619c69ed36bc855aec11004aca3aba397'

  const get = async (url, ms = 15000, headers = {}) => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), ms)
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'NEXUS-Threats/1.0', ...headers }
      })
      clearTimeout(t)
      return r.ok ? r : null
    } catch { return null }
  }

  const results = {}

  await Promise.allSettled([

    // ── CISA Known Exploited Vulnerabilities (KEV) ────────────────────────
    (async () => {
      const r = await get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 20000)
      if (!r) return
      const d = await r.json().catch(() => null)
      results.kev = (d?.vulnerabilities || []).slice(0, 200).map(v => ({
        cveID: v.cveID,
        vendorProject: v.vendorProject,
        product: v.product,
        vulnerabilityName: v.vulnerabilityName,
        dateAdded: v.dateAdded,
        shortDescription: v.shortDescription?.slice(0, 300),
        requiredAction: v.requiredAction,
        dueDate: v.dueDate,
        severity: 'critical',
        url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
      }))
    })(),

    // ── NVD Recent CVEs — 90 days, CRITICAL + HIGH + MEDIUM, max coverage ──
    (async () => {
      const now = new Date()
      const start90 = new Date(now - 90 * 86400000).toISOString().slice(0, 19) + '.000'
      const start30 = new Date(now - 30 * 86400000).toISOString().slice(0, 19) + '.000'
      const end = now.toISOString().slice(0, 19) + '.000'
      const allCVEs = []
      const seenIds = new Set()
      const parseCVEs = (vulnerabilities) => {
        if (!Array.isArray(vulnerabilities)) return
        vulnerabilities.forEach(item => {
          const cve = item.cve
          if (!cve?.id || seenIds.has(cve.id)) return
          seenIds.add(cve.id)
          const metrics = cve.metrics?.cvssMetricV31?.[0] || cve.metrics?.cvssMetricV30?.[0] || cve.metrics?.cvssMetricV2?.[0]
          allCVEs.push({
            id: cve.id,
            description: cve.descriptions?.find(d => d.lang === 'en')?.value?.slice(0, 300),
            cvss: metrics?.cvssData?.baseScore,
            severity: (metrics?.cvssData?.baseSeverity || 'HIGH').toLowerCase(),
            published: cve.published?.slice(0, 10),
            url: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
            weaknesses: (cve.weaknesses||[]).flatMap(w=>w.description?.map(d=>d.value)||[]).slice(0,3),
          })
        })
      }
      // Fetch CRITICAL (90 days) + HIGH (30 days) in parallel for max coverage
      await Promise.allSettled([
        get(`https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${start90}&pubEndDate=${end}&cvssV3Severity=CRITICAL&resultsPerPage=200`, 25000)
          .then(r=>r?.json()).then(d=>parseCVEs(d?.vulnerabilities)).catch(()=>{}),
        get(`https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${start30}&pubEndDate=${end}&cvssV3Severity=HIGH&resultsPerPage=200`, 25000)
          .then(r=>r?.json()).then(d=>parseCVEs(d?.vulnerabilities)).catch(()=>{}),
        // CISA KEV cross-reference: mark which are actively exploited
        get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 12000)
          .then(r=>r?.json()).then(d=>{
            const kevIds = new Set((d?.vulnerabilities||[]).map(v=>v.cveID))
            allCVEs.forEach(c=>{ if(kevIds.has(c.id)) { c.activelyExploited=true; c.severity='critical' } })
          }).catch(()=>{}),
        // Exploit-DB RSS: published exploits (always has fresh data)
        get('https://www.exploit-db.com/rss.xml', 8000).then(r=>r?.text()).then(xml=>{
          if (!xml) return
          const getTag = (str, tag) => str?.match(new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i'))?.[1]?.replace(/<[^>]+>/g,'')?.trim() || ''
          ;[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,100).forEach(m => {
            const title = getTag(m[1],'title'), link = getTag(m[1],'link'), desc = getTag(m[1],'description')
            const cveMatch = (title+desc).match(/CVE-\d{4}-\d+/)
            if (!cveMatch || seenIds.has(cveMatch[0])) {
              // Still add as vuln if no CVE match
              if (!seenIds.has(link)) {
                seenIds.add(link)
                allCVEs.push({ id: title.slice(0,30), description: (desc||title).slice(0,300), cvss: null, severity: 'high', published: getTag(m[1],'pubDate')?.slice(0,10), url: link, _exploitdb: true })
              }
              return
            }
            seenIds.add(cveMatch[0])
            allCVEs.push({ id: cveMatch[0], description: (desc||title).slice(0,300), cvss: null, severity: 'high', published: getTag(m[1],'pubDate')?.slice(0,10), url: link, _exploitdb: true })
          })
        }).catch(()=>{}),
        // OSV.dev — open source vulnerabilities (POST endpoint, use fetch directly)
        fetch('https://api.osv.dev/v1/query', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ query: { package: { ecosystem: 'npm' } }, page_size: 100 }),
          signal: AbortSignal.timeout(10000)
        }).then(r=>r.ok?r.json():null).then(d=>{
          ;(d?.vulns||[]).forEach(v => {
            const cveId = v.aliases?.find(a=>a.startsWith('CVE-')) || v.id
            if (seenIds.has(cveId)) return
            seenIds.add(cveId)
            allCVEs.push({ id: cveId, description: v.summary?.slice(0,300)||v.details?.slice(0,300), cvss: v.severity?.[0]?.score, severity: v.severity?.[0]?.type?.toLowerCase()||'medium', published: v.published?.slice(0,10), url: `https://osv.dev/vulnerability/${v.id}` })
          })
        }).catch(()=>{}),
        // Vulhub RSS — Chinese vuln feed, good Asia coverage
        get('https://vulhub.org/rss.xml', 8000).then(r=>r?.text()).then(xml=>{
          if (!xml) return
          const getTag = (str, tag) => str?.match(new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i'))?.[1]?.replace(/<[^>]+>/g,'')?.trim() || ''
          ;[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,50).forEach(m => {
            const title = getTag(m[1],'title'), link = getTag(m[1],'link'), desc = getTag(m[1],'description')
            const cveMatch = (title+desc).match(/CVE-\d{4}-\d+/)
            const id = cveMatch?.[0] || title.slice(0,30)
            if (seenIds.has(id)) return
            seenIds.add(id)
            allCVEs.push({ id, description:(desc||title).slice(0,300), cvss:null, severity:'high', published:getTag(m[1],'pubDate')?.slice(0,10), url:link })
          })
        }).catch(()=>{}),
      ])
      if (allCVEs.length) {
        results.recentCVEs = allCVEs.sort((a,b) => {
          // Sort: actively exploited first, then by CVSS score, then by date
          if (a.activelyExploited && !b.activelyExploited) return -1
          if (!a.activelyExploited && b.activelyExploited) return 1
          return (b.cvss||0) - (a.cvss||0)
        })
        console.log('[CVE] Total unique:', results.recentCVEs.length, '— CRITICAL:', results.recentCVEs.filter(c=>c.severity==='critical').length)
      }
    })(),

    // ── CISA Alerts RSS ────────────────────────────────────────────────────
    (async () => {
      const r = await get('https://www.cisa.gov/uscert/ncas/alerts.xml', 15000)
      if (!r) return
      const xml = await r.text()
      const getTag = (str, tag) => str?.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))?.[1]?.trim() || ''
      results.cisaAlerts = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m => ({
        title: getTag(m[1], 'title'),
        url: getTag(m[1], 'link'),
        date: getTag(m[1], 'pubDate'),
        description: getTag(m[1], 'description').replace(/<[^>]+>/g, '').slice(0, 400),
        severity: getTag(m[1], 'title').toLowerCase().includes('critical') ? 'critical' : 'high',
      })).filter(a => a.title)
    })(),

    // ── Abuse.ch Feodo Tracker (botnet C2 servers) ────────────────────────
    (async () => {
      const r = await get('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json', 15000)
      if (!r) return
      const d = await r.json().catch(() => null)
      results.botnetC2 = (d || []).slice(0, 500).map(host => ({
        ip: host.ip_address || host,
        port: host.port,
        malware: host.malware,
        country: host.country,
        firstSeen: host.first_seen,
        lastSeen: host.last_seen,
        severity: 'high',
        url: `https://feodotracker.abuse.ch/browse/host/${host.ip_address || host}/`,
      })).filter(h => h.ip)
    })(),

    // ── Abuse.ch URLhaus (malicious URLs) ────────────────────────────────
    (async () => {
      const r = await get('https://urlhaus-api.abuse.ch/v1/urls/recent/limit/200/', 15000, {
        'Content-Type': 'application/json'
      })
      if (!r) return
      const d = await r.json().catch(() => null)
      results.maliciousURLs = (d?.urls || []).slice(0, 200).map(u => ({
        url: u.url,
        host: u.host,
        dateAdded: u.date_added,
        status: u.url_status,
        threat: u.threat,
        tags: u.tags,
        urlhausLink: u.urlhaus_link,
        severity: u.threat?.includes('malware_download') ? 'critical' : 'high',
      }))
    })(),

    // ── Abuse.ch MalwareBazaar (recent malware samples) ──────────────────
    (async () => {
      const r = await get('https://mb-api.abuse.ch/api/v1/', 15000, { 'Content-Type': 'application/x-www-form-urlencoded' })
      // GET not supported — use static recent feed instead
      const r2 = await get('https://bazaar.abuse.ch/export/csv/recent/', 12000)
      if (!r2) return
      const csv = await r2.text()
      const lines = csv.split('\n').filter(l => l && !l.startsWith('#'))
      results.malwareSamples = lines.slice(0, 100).map(line => {
        const [firstSeen, sha256, md5, sha1, reporter, fileName, fileType, mimeType, signature, clamavSig, vtPercent, imphash, tlsh, telfhash] = line.split(',').map(s => s.replace(/"/g, '').trim())
        if (!sha256 || sha256.length < 10) return null
        return {
          firstSeen, sha256, fileName, fileType, signature,
          vtPercent: parseFloat(vtPercent) || 0,
          severity: parseFloat(vtPercent) > 50 ? 'critical' : 'high',
          url: `https://bazaar.abuse.ch/sample/${sha256}/`,
        }
      }).filter(Boolean)
    })(),

    // ── OTX AlienVault — public pulses (no key needed for recent) ─────────
    (async () => {
      const headers = OTX_KEY ? { 'X-OTX-API-KEY': OTX_KEY } : {}
      const r = await get('https://otx.alienvault.com/api/v1/pulses/subscribed?limit=50&modified_since=' +
        new Date(Date.now() - 7 * 86400000).toISOString(), 15000, headers)
      // Fallback to public feed
      const r2 = await get('https://otx.alienvault.com/api/v1/pulses/activity?limit=50', 12000, headers)
      const src = r || r2
      if (!src) return
      const d = await src.json().catch(() => null)
      results.otxPulses = (d?.results || d?.data || []).slice(0, 50).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description?.slice(0, 300),
        author: p.author_name,
        created: p.created?.slice(0, 10),
        tags: p.tags?.slice(0, 8),
        indicatorCount: p.indicator_count,
        malwareFamilies: p.malware_families?.map(m => m.display_name).slice(0, 5),
        targetedCountries: p.targeted_countries?.slice(0, 5),
        tlp: p.tlp,
        severity: (p.indicator_count || 0) > 100 ? 'critical' : 'high',
        url: `https://otx.alienvault.com/pulse/${p.id}`,
      }))
    })(),

    // ── GreyNoise Community (no key = limited but works) ──────────────────
    (async () => {
      const headers = GREYNOISE_KEY ? { 'key': GREYNOISE_KEY } : {}
      // Fetch riot (benign) and noise (malicious) stats
      const r = await get('https://api.greynoise.io/v3/community/stats', 12000, headers)
      if (r) {
        const d = await r.json().catch(() => null)
        results.greynoiseStats = d
      }
      // Recent noise actors
      const r2 = await get('https://api.greynoise.io/v3/noise/quick?ips=1.1.1.1', 8000, headers)
      // Tag summary
      const r3 = await get('https://api.greynoise.io/v3/tags', 10000, headers)
      if (r3) {
        const d3 = await r3.json().catch(() => null)
        results.greynoiseTopTags = (d3?.metadata?.tags || []).slice(0, 30)
      }
    })(),

    // ── SpamHaus DROP list (Don't Route Or Peer) ──────────────────────────
    (async () => {
      const r = await get('https://www.spamhaus.org/drop/drop.txt', 10000)
      if (!r) return
      const txt = await r.text()
      results.spamhausDROP = txt.split('\n')
        .filter(l => l && !l.startsWith(';'))
        .map(l => {
          const [cidr, ...rest] = l.trim().split(/\s+/)
          return { cidr, comment: rest.join(' ').replace(/^;\s*/, '') }
        })
        .filter(e => e.cidr?.includes('/'))
        .slice(0, 300)
    })(),

    // ── PhishTank recent phishing URLs ────────────────────────────────────
    (async () => {
      const r = await get('https://data.phishtank.com/data/online-valid.json', 20000)
      if (!r) return
      const d = await r.json().catch(() => null)
      results.phishing = (Array.isArray(d) ? d : []).slice(0, 200).map(p => ({
        url: p.url,
        phishId: p.phish_id,
        submissionTime: p.submission_time,
        verifiedAt: p.verification_time,
        online: p.online,
        target: p.target,
        severity: 'high',
        urlhausLink: `https://www.phishtank.com/phish_detail.php?phish_id=${p.phish_id}`,
      })).filter(p => p.url)
    })(),

    // ── Exposed Infrastructure — Shodan InternetDB bulk + GreyNoise + more ──
    (async () => {
      const exposedHosts = []
      const seenIPs = new Set()

      // 1. Shodan InternetDB — free, no key, lookup known C2 + malicious IPs
      // First collect IPs from multiple threat sources
      const maliciousIPs = [
        ...(results.botnetC2||[]).map(c=>c.ip).filter(Boolean).slice(0,30),
        ...(results.maliciousURLs||[]).map(u=>{ try{return new URL(u.url).hostname}catch{return null} }).filter(ip=>ip&&/^\d+\.\d+/.test(ip)).slice(0,20),
        ...(results.spamhausDROP||[]).map(e=>e.ip||e.network).filter(Boolean).slice(0,20),
      ].filter((ip,i,a) => ip && !seenIPs.has(ip) && seenIPs.add(ip) && a.indexOf(ip)===i).slice(0,60)

      if (maliciousIPs.length) {
        const lookups = await Promise.allSettled(maliciousIPs.map(ip =>
          get(`https://internetdb.shodan.io/${ip}`, 5000).then(r => r?.json().catch(()=>null))
        ))
        lookups.forEach((r, i) => {
          if (r.status !== 'fulfilled' || !r.value?.ports?.length) return
          const d = r.value
          exposedHosts.push({
            ip: maliciousIPs[i],
            ports: d.ports?.slice(0,8) || [],
            port: d.ports?.[0],
            hostnames: d.hostnames?.slice(0,3) || [],
            org: d.hostnames?.[0] || '',
            tags: d.tags?.slice(0,6) || [],
            vulns: d.vulns?.slice(0,6) || [],
            cpes: d.cpes?.slice(0,4) || [],
            severity: d.vulns?.length ? 'critical' : d.tags?.includes('malicious') ? 'critical' : 'high',
            _source: 'Shodan InternetDB',
          })
        })
      }

      // 2. Shodan InternetDB on CISA KEV affected vendors (infer IPs from resolved domains)
      const criticalVendors = ['fortinet.com','cisco.com','microsoft.com','vmware.com','ivanti.com','paloaltonetworks.com','f5.com','sonicwall.com']
      await Promise.allSettled(criticalVendors.slice(0,8).map(async vendor => {
        try {
          // Use DNS lookup to get IPs, then check Shodan
          const dnsR = await fetch(`https://dns.google/resolve?name=${vendor}&type=A`, { signal: AbortSignal.timeout(4000) }).catch(()=>null)
          if (!dnsR?.ok) return
          const dns = await dnsR.json().catch(()=>null)
          const ips = (dns?.Answer||[]).map(a=>a.data).filter(ip=>/^\d+/.test(ip)).slice(0,2)
          await Promise.allSettled(ips.map(async ip => {
            if (seenIPs.has(ip)) return; seenIPs.add(ip)
            const sd = await get(`https://internetdb.shodan.io/${ip}`, 4000).then(r=>r?.json()).catch(()=>null)
            if (!sd?.ports?.length) return
            exposedHosts.push({ ip, ports: sd.ports?.slice(0,8)||[], vulns: sd.vulns?.slice(0,6)||[], tags: sd.tags?.slice(0,4)||[], org: vendor, severity: sd.vulns?.length?'critical':'medium', _source: 'Shodan/DNS', _vendor: vendor })
          }))
        } catch {}
      }))

      // 3. GreyNoise community — individual IP lookups on known scanners
      // Use the per-IP endpoint (the /community/noise bulk doesn't exist)
      const scannerSamples = ['1.1.1.1','8.8.8.8','185.220.101.1','45.141.152.1','194.165.16.1']
      await Promise.allSettled(scannerSamples.map(async ip => {
        try {
          const r = await fetch(`https://api.greynoise.io/v3/community/${ip}`, { signal: AbortSignal.timeout(5000) }).catch(()=>null)
          if (!r?.ok) return
          const d = await r.json().catch(()=>null)
          if (!d || d.message?.includes('not found')) return
          if (!seenIPs.has(ip)) {
            seenIPs.add(ip)
            exposedHosts.push({ ip, org: d.name||'', country: d.country||'', classification: d.classification, noise: d.noise, riot: d.riot, severity: d.classification==='malicious'?'critical':'medium', _source: 'GreyNoise Community' })
          }
        } catch {}
      }))

      // 4. BinaryEdge free endpoint — exposed services (public data)
      try {
        const beR = await get('https://api.binaryedge.io/v1/query/search?query=port:22+country:RU+product:OpenSSH&page=1', 8000, { 'X-Key': 'free' })
        if (beR) {
          const d = await beR.json().catch(()=>null)
          ;(d?.results||[]).slice(0,20).forEach(h => {
            if (seenIPs.has(h.ip||h.origin?.ip)) return
            seenIPs.add(h.ip||h.origin?.ip)
            exposedHosts.push({ ip: h.ip||h.origin?.ip, port: h.port||22, org: h.origin?.country||'', country: h.origin?.country||'RU', product: h.product||'OpenSSH', severity: 'medium', _source: 'BinaryEdge' })
          })
        }
      } catch {}

      // 5. Censys exposed services (if key available)
      if (CENSYS_ID && CENSYS_SECRET) {
        try {
          const auth = Buffer.from(`${CENSYS_ID}:${CENSYS_SECRET}`).toString('base64')
          await Promise.allSettled([
            get('https://search.censys.io/api/v2/hosts/search?q=services.port:445+AND+labels:compromised&per_page=50', 12000, { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }),
            get('https://search.censys.io/api/v2/hosts/search?q=services.port:3389+AND+labels:scanner&per_page=50', 10000, { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }),
            get('https://search.censys.io/api/v2/hosts/search?q=services.port:8080+AND+services.http.response.status_code:200+AND+labels:anomalous&per_page=50', 10000, { Authorization: `Basic ${auth}` }),
          ].map(p => p.then(r=>r?.json()).then(d => {
            ;(d?.result?.hits||[]).forEach(h => {
              if (seenIPs.has(h.ip)) return; seenIPs.add(h.ip)
              exposedHosts.push({ ip: h.ip, services: (h.services||[]).map(s=>`${s.port}/${s.transport_protocol}`).slice(0,4), country: h.location?.country, org: h.autonomous_system?.name, labels: h.labels, severity: h.labels?.includes('compromised')?'critical':'high', url: `https://search.censys.io/hosts/${h.ip}`, _source: 'Censys' })
            })
          }).catch(()=>{})))
        } catch {}
      }

      if (exposedHosts.length) {
        results.shodanLatest = exposedHosts
        results.censysAnomalous = exposedHosts.filter(h=>h._source==='Censys')
        console.log('[ExposedInfra] Total hosts:', exposedHosts.length)
      }
    })(),

    // ── MITRE ATT&CK recent techniques ────────────────────────────────────
    (async () => {
      const r = await get('https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json', 20000)
      if (!r) return
      const d = await r.json().catch(() => null)
      const techniques = (d?.objects || [])
        .filter(o => o.type === 'attack-pattern' && !o.revoked && !o.x_mitre_deprecated)
        .sort((a, b) => (b.modified || '') > (a.modified || '') ? 1 : -1)
        .slice(0, 100)
      results.mitreAttack = techniques.map(t => ({
        id: t.external_references?.[0]?.external_id,
        name: t.name,
        description: t.description?.slice(0, 300),
        tactic: t.kill_chain_phases?.[0]?.phase_name,
        platforms: t.x_mitre_platforms,
        modified: t.modified?.slice(0, 10),
        url: t.external_references?.[0]?.url,
        severity: 'high',
      }))
    })(),

    // ── OpenPhish (phishing intelligence feed) ────────────────────────────
    (async () => {
      const r = await get('https://openphish.com/feed.txt', 12000)
      if (!r) return
      const txt = await r.text()
      results.openPhish = txt.split('\n')
        .filter(l => l.startsWith('http'))
        .slice(0, 200)
        .map(url => ({ url, severity: 'high' }))
    })(),

    // ── Censys — scan data summary (with key) ─────────────────────────────
    (async () => {
      if (!CENSYS_ID || !CENSYS_SECRET) return
      const auth = Buffer.from(`${CENSYS_ID}:${CENSYS_SECRET}`).toString('base64')
      const r = await get(
        'https://search.censys.io/api/v2/hosts/search?q=services.port:445+AND+labels:anomalous&per_page=50',
        12000,
        { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }
      )
      if (!r) return
      const d = await r.json().catch(() => null)
      results.censysAnomalous = (d?.result?.hits || []).slice(0, 50).map(h => ({
        ip: h.ip,
        services: (h.services || []).map(s => `${s.port}/${s.transport_protocol}`),
        country: h.location?.country,
        org: h.autonomous_system?.name,
        labels: h.labels,
        severity: h.labels?.includes('compromised') ? 'critical' : 'high',
        url: `https://search.censys.io/hosts/${h.ip}`,
      }))
    })(),

  ])

  results.summary = {
    kev: results.kev?.length || 0,
    recentCVEs: results.recentCVEs?.length || 0,
    cisaAlerts: results.cisaAlerts?.length || 0,
    botnetC2: results.botnetC2?.length || 0,
    maliciousURLs: results.maliciousURLs?.length || 0,
    malwareSamples: results.malwareSamples?.length || 0,
    otxPulses: results.otxPulses?.length || 0,
    phishing: results.phishing?.length || 0,
    spamhausDROP: results.spamhausDROP?.length || 0,
    mitreAttack: results.mitreAttack?.length || 0,
    fetchedAt: new Date().toISOString(),
  }

  res.status(200).json(results)
}
