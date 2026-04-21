// src/data/sdn_db.js — Full OFAC SDN Enhanced Database
// 18,712 sanctioned entities: individuals, organizations, vessels, aircraft
// Includes: crypto addresses, SWIFT codes, vessel flags, passport numbers,
// DOB, addresses, aliases, legal authorities, sanctions programs
// Source: /public/data/sdn_full.json (parsed from SDN_ENHANCED.XML)

let _db = null
let _loading = false
let _callbacks = []

export async function loadSDN() {
  if (_db) return _db
  if (_loading) return new Promise(resolve => _callbacks.push(resolve))
  _loading = true
  try {
    const r = await fetch('/data/sdn_full.json')
    if (!r.ok) throw new Error('SDN DB not found')
    _db = await r.json()
    _callbacks.forEach(cb => cb(_db))
    _callbacks = []
    console.log(`[SDN] Loaded ${_db.length} sanctioned entities`)
    return _db
  } catch (e) {
    console.error('[SDN] Failed to load:', e)
    _loading = false
    return []
  }
}

// ── Token normalization ──────────────────────────────────────────────────────
function normalizeForSearch(str) {
  return str
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|prof|gen|col|lt|cdr|sir|lord|sgt|pvt|rev|hon|jr|sr|ii|iii)\b\.?/gi, '')
    .replace(/[\u2018\u2019`]/g, "'")
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Extract distinctive tokens ────────────────────────────────────────────
function getNameTokens(str) {
  if (!str) return []
  const stopWords = new Set(['the','and','of','for','al','el','abu','bin','bint','ibn','van','de','le','la','los','las','von','zu','di','da'])
  return normalizeForSearch(str).split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w))
}

// ── Similarity score between two names (0–1) ─────────────────────────────
function nameSimilarity(a, b) {
  if (!a || !b) return 0
  const na = normalizeForSearch(a), nb = normalizeForSearch(b)
  if (na === nb) return 1.0
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const ta = getNameTokens(a), tb = getNameTokens(b)
  if (!ta.length || !tb.length) return 0
  const setA = new Set(ta)
  const shared = tb.filter(t => setA.has(t)).length
  const jaccard = shared / new Set([...ta, ...tb]).size
  // Shared last-name small bonus (not primary signal — confirmed by Groq)
  const lastMatch = ta[ta.length-1] === tb[tb.length-1] ? 0.1 : 0
  return Math.min(1, jaccard + lastMatch)
}

export function searchSDN(query, db = _db, opts = {}) {
  if (!db || !query) return []
  const q = query.toLowerCase().trim()
  if (q.length < 2) return []
  const { threshold = 0.2, maxResults = 50 } = opts

  const queryNorm = normalizeForSearch(query)
  const queryTokens = getNameTokens(query)

  const results = []

  for (const entry of db) {
    let score = 0
    let matchType = ''

    const allNames = [entry.name, ...(entry.aliases || [])]
    const nameNorm = normalizeForSearch(entry.name)

    // ── Exact / near-exact ─────────────────────────────────────────────
    if (nameNorm === queryNorm)                                         { score = 100; matchType = 'exact' }
    else if (allNames.some(n => normalizeForSearch(n) === queryNorm))  { score = 95;  matchType = 'alias_exact' }
    else if (nameNorm.includes(queryNorm))                             { score = 85;  matchType = 'contains' }
    else if (allNames.some(n => normalizeForSearch(n).includes(queryNorm))) { score = 80; matchType = 'alias_contains' }
    else if (queryNorm.includes(nameNorm) && nameNorm.length > 5)     { score = 75;  matchType = 'name_in_query' }

    // ── Fuzzy token similarity ─────────────────────────────────────────
    else {
      let bestSim = 0
      for (const name of allNames) {
        const sim = nameSimilarity(query, name)
        if (sim > bestSim) bestSim = sim
      }
      if (bestSim >= 0.8)          { score = 65 + Math.round(bestSim * 20); matchType = 'fuzzy_strong' }
      else if (bestSim >= 0.5)     { score = 40 + Math.round(bestSim * 20); matchType = 'fuzzy_medium' }
      else if (bestSim >= threshold) { score = 15 + Math.round(bestSim * 20); matchType = 'fuzzy_weak' }

      // ── Shared last name — ALWAYS flagged for Groq resolution ─────────
      // "Nirav Modi" and "Narendra Modi" → last_name_shared → Groq resolves
      if (score === 0 && queryTokens.length >= 1) {
        const entryLast = getNameTokens(entry.name).slice(-1)[0]
        const queryLast = queryTokens.slice(-1)[0]
        if (queryLast && entryLast === queryLast && queryLast.length >= 4) {
          score = 18; matchType = 'last_name_shared'
        }
        else if (queryTokens.length >= 2) {
          const entryTokenSet = new Set(getNameTokens(entry.name))
          const sharedTokens = queryTokens.filter(t => entryTokenSet.has(t) && t.length >= 4)
          if (sharedTokens.length >= 1) { score = 14; matchType = 'token_shared' }
        }
      }

      // ── Special identifiers (SWIFT, crypto, vessel, passport) ─────────
      if (score === 0) {
        const special = [
          entry.swift, entry.email, entry.phone, entry.vesselCallSign,
          ...Object.values(entry.cryptoAddresses || {}).flat(),
          ...(entry.identityDocs || []).map(d => d.number),
        ].filter(Boolean).map(s => s.toLowerCase())
        if (special.some(s => s === q || (q.length > 5 && s.includes(q)))) { score = 70; matchType = 'identifier' }
      }
    }

    if (score <= 0) continue

    // Boost for data richness
    if (entry.identityDocs?.length > 0) score += 2
    if (Object.keys(entry.cryptoAddresses || {}).length > 0) score += 5
    if (entry.vesselFlag) score += 2

    results.push({
      ...entry,
      _score: score,
      _matchType: matchType,
      // Flag weak matches that need Groq entity resolution
      _needsResolution: ['last_name_shared','token_shared','fuzzy_weak'].includes(matchType),
    })
  }

  return results
    .sort((a, b) => b._score - a._score)
    .slice(0, maxResults)
    .map(({ _score, ...e }) => e)
}

// Search by crypto wallet address
export function searchSDNByCrypto(address, db = _db) {
  if (!db || !address) return []
  const addr = address.toLowerCase()
  return db.filter(entry => {
    for (const addrs of Object.values(entry.cryptoAddresses || {})) {
      if (addrs.some(a => a.toLowerCase() === addr || a.toLowerCase().includes(addr))) return true
    }
    return false
  })
}

// Search by SWIFT BIC
export function searchSDNBySwift(bic, db = _db) {
  if (!db || !bic) return []
  const b = bic.toUpperCase().trim()
  return db.filter(e => e.swift?.toUpperCase().includes(b))
}

// Search by vessel MMSI or call sign
export function searchSDNByVessel(identifier, db = _db) {
  if (!db || !identifier) return []
  const id = identifier.toUpperCase().trim()
  return db.filter(e =>
    e.vesselCallSign?.toUpperCase().includes(id) ||
    e.name.toUpperCase().includes(id) ||
    (e.aliases || []).some(a => a.toUpperCase().includes(id))
  )
}

// Get stats
export function getSDNStats(db = _db) {
  if (!db) return null
  return {
    total: db.length,
    individuals: db.filter(e => e.type === 'Individual').length,
    entities: db.filter(e => e.type === 'Entity').length,
    withCrypto: db.filter(e => Object.keys(e.cryptoAddresses || {}).length > 0).length,
    withSwift: db.filter(e => e.swift).length,
    withVessels: db.filter(e => e.vesselFlag || e.vesselType).length,
    withAircraft: db.filter(e => e.tailNumber || e.aircraftModel).length,
    programs: [...new Set(db.flatMap(e => e.programs || []))].length,
  }
}

// ── Groq entity resolution — confirm if fuzzy matches are same/related ───────
// Runs in background after initial results render. Never blocks the UI.
// Returns array of { id, verdict: 'SAME'|'RELATED'|'DIFFERENT', confidence: 'HIGH'|'MEDIUM'|'LOW', reason }
export async function resolveEntitiesWithGroq(searchQuery, candidates, groqKey) {
  if (!groqKey || !candidates?.length) return []

  // Only resolve candidates that are flagged as needing resolution
  const toResolve = candidates.filter(c => c._needsResolution || c._matchType === 'fuzzy_weak')
  if (!toResolve.length) return []

  // Batch all candidates into one Groq call — much faster than individual calls
  const candidateList = toResolve.map((c, i) =>
    `[${i+1}] "${c.name}"${c.aliases?.length ? ` (AKA: ${c.aliases.slice(0,3).join(', ')})` : ''}${c.nationality ? ` · Nationality: ${c.nationality}` : ''}${c.dob ? ` · DOB: ${c.dob}` : ''}${c.programs?.length ? ` · Sanctioned for: ${c.programs.slice(0,2).join(', ')}` : ''}`
  ).join('\n')

  const prompt = `You are an OSINT entity resolution expert. Determine if each candidate is the same person/organization as the search target, or related to them.

SEARCH TARGET: "${searchQuery}"

CANDIDATES FROM OFAC SANCTIONS DATABASE:
${candidateList}

For each candidate, respond with ONLY a JSON array:
[
  {"index": 1, "verdict": "SAME|RELATED|DIFFERENT", "confidence": "HIGH|MEDIUM|LOW", "reason": "one sentence max"},
  ...
]

Verdicts:
- SAME: this IS the search target (same person/org, possibly different name spelling/transliteration)  
- RELATED: different person/org but meaningfully connected (family member, associate, owned company, same network)
- DIFFERENT: no meaningful connection despite shared name tokens

Rules:
- "Narendra Modi" vs "Nirav Modi" → DIFFERENT (same surname, unrelated people)
- "Narendra Modi" vs "Narendra Damodardas Modi" → SAME (same person, full name)
- "Putin" vs "Vladimir Putin" → SAME
- "Putin" vs "Ludmila Putina" → RELATED (ex-wife)  
- "Trump" vs "Ivanka Trump" → RELATED (family)
- "Gazprom" vs "Gazprombank" → RELATED (subsidiary)
- Be conservative: DIFFERENT unless there's clear evidence of connection.
ONLY output the JSON array, nothing else.`

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!r.ok) return []
    const d = await r.json()
    const text = d.choices?.[0]?.message?.content || ''
    const clean = text.replace(/```json|```/g, '').trim()
    const s = clean.indexOf('['), e = clean.lastIndexOf(']')
    if (s === -1 || e === -1) return []
    const parsed = JSON.parse(clean.slice(s, e + 1))

    // Map back to candidate IDs
    return parsed.map(p => ({
      id: toResolve[p.index - 1]?.id,
      name: toResolve[p.index - 1]?.name,
      verdict: p.verdict,
      confidence: p.confidence,
      reason: p.reason,
    })).filter(r => r.id)
  } catch {
    return []
  }
}
