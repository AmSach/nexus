// Classification logic — GEOPOLITICS FIRST, finance last

export function classifyCat(t, fallback = 'politics') {
  // OSINT / Geolocation — verified open-source intelligence
  if (/geoloc|osint|geoconf|open.source intel|satellite image|bellingcat|visual confir|visible confir|geoconfirm/.test(t)) return 'osint'
  // Military / Armed forces — specific military hardware/ops
  if (/\bf-35\b|\bf-16\b|b-52|carrier strike|carrier group|destroyer deploy|armoured column|tank column|troop deploy|battalion|brigade|naval exercise|military exercise|nato exercise|joint exercise|air defense|s-400|patriot|himars|leopard.*tank|abrams|special forces/.test(t)) return 'military'
  // Conflict/military BEFORE everything — war terms must win
  if (/\bwar\b|military strike|missile|drone strike|airstr|bomb|shell|troops|navy|battle|combat|killed in action|casualt|frontline|offensive|ceasefire|artillery|airstrike|warplane|infantry|armored|naval/.test(t)) return 'conflict'
  // Humanitarian — civilian impact
  if (/humanitarian|refugee|displaced|famine|food insecurity|aid worker|relief operation|\bwfp\b|\bunhcr\b|\bicrc\b|\bmsf\b|doctors without|evacuation.*civilian/.test(t)) return 'humanitarian'
  // Intelligence / Cyber
  if (/\bnsa\b|\bcia\b|\bmi6\b|mossad|espionage|\bspy\b|surveillance|\bhack\b|cyber\b|\bapt\b|breach|malware|ransomware|phishing|zero.day|intelligence agency|covert/.test(t)) return 'intelligence'
  // Crime / atrocities
  if (/chemical weapon|war crime|genocide|\bicc\b|atrocit|torture|massacre|ethnic cleansing|war criminal/.test(t)) return 'crime'
  // Health / Bio
  if (/pandemic|virus|vaccine|\bwho\b|outbreak|pathogen|epidemic|disease outbreak|health emergency|mpox|ebola/.test(t)) return 'health'
  // Environment
  if (/climate|carbon|emission|flood|wildfire|drought|glacier|renewable|deforest|cyclone|earthquake|tsunami|disaster/.test(t)) return 'environment'
  // Technology
  if (/\bai\b|artificial intelligence|llm|quantum|semiconductor|chip\b|tech giant|robotics|deepseek|openai|anthropic/.test(t)) return 'technology'
  // Politics / Geopolitics — broad
  if (/election|parliament|congress|president|prime minister|coup|sanction|treaty|diplomacy|\bnato\b|united nations|g20|g7|summit|bilateral|multilateral|foreign minister|state department|kremlin|white house|politburo|dictator|authoritarian/.test(t)) return 'politics'
  // Finance — LAST, only when explicitly financial
  if (/\bstock\b|wall street|gdp|inflation|\bfed\b|\becb\b|rate cut|rate hike|bond yield|crypto|bitcoin|hedge fund|\bipo\b|earnings|forex|currency devaluation|\brbi\b|rupee|treasury yield|market crash|recession|bailout/.test(t)) return 'finance'
  return fallback
}

export function classifySev(t) {
  if (/nuclear|chemical weapon|war crime|genocide|mass casualt|\bpheic\b|pandemic|martial law|annex|warhead|bioweapon|coup d|state of emergency|nuclear strike|wmd|dirty bomb/.test(t)) return 'critical'
  if (/\bkilled\b|\bdead\b|\bbomb\b|\battack\b|explosion|missile strike|deploy|arrest warrant|crisis|default|crash|collapse|troops cross|forces advance|escalat|offensive launched|invasion/.test(t)) return 'high'
  if (/warning|sanction|protest|trial|investigation|election|ceasefire|diplomatic|tension|buildup|military exercise|drills|mobiliz/.test(t)) return 'medium'
  return 'low'
}

export function classifyRegion(t) {
  if (/ukraine|(?:^|\s)russia\b|nato\b|\beu\b|germany|france|britain|\buk\b|poland|baltic|moldova|finland|sweden|norway|belarus|czech|slovakia|hungary/.test(t)) return 'Europe'
  if (/china|taiwan|japan|korea|beijing|tokyo|seoul|hong kong|\bpla\b|\bccp\b/.test(t)) return 'East Asia'
  if (/iran|israel|gaza|saudi|qatar|\buae\b|middle east|lebanon|syria|\biraq\b|yemen|turkey|tehran|houthi|west bank/.test(t)) return 'Middle East'
  if (/india|pakistan|bangladesh|afghanistan|nepal|sri lanka|new delhi|islamabad|mumbai|kashmir/.test(t)) return 'South Asia'
  if (/indonesia|vietnam|philippines|thailand|myanmar|singapore|malaysia|asean/.test(t)) return 'Southeast Asia'
  if (/africa|nigeria|kenya|egypt|ethiopia|congo|sudan|somalia|sahel|ghana|mali|niger|burkina/.test(t)) return 'Africa'
  if (/\bus\b|\busa\b|america|washington dc|congress|white house|pentagon|federal reserve|trump|biden|harris/.test(t)) return 'North America'
  if (/mexico|brazil|colombia|latin america|venezuela|argentina|chile/.test(t)) return 'Latin America'
  if (/arctic|greenland|svalbard|murmansk|northern sea route/.test(t)) return 'Arctic'
  return 'Global'
}

export function extractTags(t) {
  const defs = [
    ['NATO',      /nato/],
    ['Ukraine',   /ukraine/],
    ['Russia',    /russia/],
    ['China',     /china/],
    ['Iran',      /iran/],
    ['Israel',    /israel/],
    ['Gaza',      /gaza/],
    ['Taiwan',    /taiwan/],
    ['India',     /india/],
    ['Pakistan',  /pakistan/],
    ['USA',       /\busa\b|\bus\b.*(?:army|navy|military|pentagon)/],
    ['Fed',       /federal reserve|fomc/],
    ['Crypto',    /bitcoin|ethereum|crypto/],
    ['AI',        /artificial intelligence|chatgpt|\bllm\b/],
    ['Nuclear',   /nuclear/],
    ['Sanctions', /sanction/],
    ['Cyber',     /cyberattack|hack|breach|ransomware/],
    ['Climate',   /climate|carbon|emission/],
    ['Oil',       /opec|crude oil|brent/],
    ['Election',  /election|ballot|vote/],
    ['Coup',      /coup/],
    ['Arctic',    /arctic/],
    ['Houthi',    /houthi/],
    ['DPRK',      /north korea|dprk/],
    ['Myanmar',   /myanmar|burma/],
    ['Sudan',     /sudan/],
    ['Sahel',     /sahel|mali|niger|burkina/],
  ]
  return defs.filter(([, rx]) => rx.test(t)).map(([tag]) => tag).slice(0, 6)
}

// Known generic title phrases that are NOT named entities
const TITLE_PHRASES = new Set([
  'Prime Minister','Defense Minister','Foreign Minister','Secretary General',
  'Secretary State','White House','Defense Department','State Department',
  'United States','United Kingdom','United Nations','European Union',
  'Middle East','North Korea','South Korea','South Asia','North Africa',
  'Red Sea','Black Sea','South China','East China','Persian Gulf',
  'Human Rights','World Health','International Court','Security Council',
  'Armed Forces','General Staff','Joint Chiefs','National Security',
  'Special Forces','Air Force','Navy Seals','Marine Corps',
  'Interior Ministry','Foreign Ministry','Defense Ministry','Justice Department',
  'Israeli Forces','Russian Forces','Ukrainian Forces','American Forces',
  'Israeli Army','Russian Army','Ukrainian Army','French Army',
  'Senior Official','Senior Advisor','Senior Diplomat','Senior Commander',
  'Local Officials','Military Officials','Government Officials',
  'Breaking News','Latest News','Live Updates','More Details',
  'New York','Los Angeles','San Francisco','Washington DC','Tel Aviv',
  'According To','Sources Say','Officials Say','Reuters Reports',
])

export function extractEntities(title, summary = '') {
  const text = title + ' ' + summary
  const result = []

  // Known orgs — exact match only, these are real signals
  const KNOWN_ORGS = [
    'NATO','EU','UN','IMF','IAEA','WHO','FBI','CIA','NSA','SEC','Fed','ECB',
    'OPEC','ICC','OPCW','WTO','G7','G20','BRICS','SCO','ASEAN','AU','APEC',
    'Pentagon','Kremlin','Interpol','Europol','ISW','IRGC','PLA','FSB','SVR',
    'GRU','Mossad','MI6','BND','DGSE','RAW','ISI','Shin Bet','Aman',
    'Wagner','Hamas','Hezbollah','Houthi','ISIS','Al-Qaeda','Taliban',
    'IDF','SAS','Delta Force','SEAL','Spetsnaz',
    'IMF','WTO','OPEC','ASEAN','SCO','CSTO','AUKUS','QUAD',
    'Gazprom','Rosneft','Aramco','TSMC','Huawei','ByteDance',
  ]
  KNOWN_ORGS.forEach(o => {
    if (text.includes(o)) result.push({ name: o, type: 'org' })
  })

  // Known world leaders and key figures — exact name matching only
  // This prevents false connections between "Defense Minister X" and "Defense Minister Y"
  const KNOWN_PERSONS = [
    'Putin','Zelensky','Biden','Trump','Xi Jinping','Netanyahu','Khamenei',
    'Raisi','Modi','Erdogan','Macron','Scholz','Sunak','Starmer','Von der Leyen',
    'Stoltenberg','Guterres','Blinken','Lavrov','Shoigu','Patrushev','Gerasimov',
    'Kim Jong','MBS','MBZ','Sisi','Kagame','Hamdok','Dagalo',
    'Milley','Austin','Sullivan','Yellen','Powell','Lagarde',
    'Prigozhin','Kadyrov','Lukashenko','Orban','Vucic',
    'Sinwar','Haniyeh','Nasrallah','Qassem','Deif',
    'Rutte','Kallas','Duda','Tusk','Fico','Orbán',
    'Kishida','Yoon','Marcos','Prabowo','Anwar',
    'Imran Khan','Shehbaz','Bajwa','Munir',
    'Jaishankar','Doval','Rajnath','Sisodia',
  ]
  KNOWN_PERSONS.forEach(p => {
    // Use word boundary check — "Putin" matches "Putin's", "Putin said" but not random text
    const rx = new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
    if (rx.test(text)) result.push({ name: p, type: 'person' })
  })

  // Deduplicate by name
  const seen = new Set()
  return result.filter(e => {
    if (seen.has(e.name)) return false
    seen.add(e.name); return true
  }).slice(0, 10)
}

export function hashId(str) {
  let h = 5381
  for (let i = 0; i < Math.min(str.length, 100); i++) h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// ── Situation matcher ────────────────────────────────────────────────────────
// Much smarter than the old space-split exact-match approach.
// Strategy:
//  1. Tokenize situation name into search terms
//  2. Expand each term with semantic synonyms from SITUATION_EXPANSIONS
//  3. OR-match: article matches if ANY expanded term appears in its text
//  4. Partial word match: "ukrain" matches "ukraine", "ukrainian"
import { SITUATION_EXPANSIONS } from '../data/constants'

// Build a single word-boundary regex for a token
function tokenPattern(tok) {
  try {
    const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (tok.includes(' ')) return new RegExp(escaped, 'i')
    if (tok.length <= 3) return new RegExp('(?<![a-zA-Z])' + escaped + '(?![a-zA-Z])', 'i')
    return new RegExp('\\b' + escaped + '\\b', 'i')
  } catch { return null }
}

// Expand a single token into its synonyms (if in dictionary)
function synonymsFor(tok) {
  if (SITUATION_EXPANSIONS[tok]) return SITUATION_EXPANSIONS[tok]
  for (const [key, syns] of Object.entries(SITUATION_EXPANSIONS)) {
    if (syns.includes(tok)) return SITUATION_EXPANSIONS[key]
  }
  return [tok]
}

export function matchArticlesToSituation(sitName, articles) {
  if (!articles.length) return []
  const raw = sitName.toLowerCase().trim()

  // Split into meaningful tokens — filter stopwords but keep country/org names
  const STOP = new Set(['the','and','or','for','with','from','in','at','of','a','an','to'])
  const tokens = raw
    .split(/[\s\-_,;/]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOP.has(t))

  if (tokens.length === 0) return []

  // ── MATCHING STRATEGY ──────────────────────────────────────────────────
  //
  // Single token ("ukraine"):
  //   → OR match: article must match token OR any synonym
  //   → expansive — good for monitoring a single topic
  //
  // Multi-token ("pakistan afghanistan"):
  //   → AND match: article must mention ALL tokens (or their synonyms)
  //   → this prevents "pakistan" alone from matching "pakistan afghanistan"
  //   → each token gets its own synonym group, article must hit one from EACH group
  //
  // This is the key fix: OR within a group (synonyms), AND across groups (topics)

  if (tokens.length === 1) {
    // Single word: match token or any synonym
    const syns = synonymsFor(tokens[0])
    const patterns = [...new Set([tokens[0], ...syns])]
      .map(tokenPattern)
      .filter(Boolean)

    return articles.filter(a => {
      const text = [a.title, a.summary || '', (a.tags || []).join(' ')].join(' ')
      return patterns.some(rx => rx.test(text))
    })
  }

  // Multi-token: build one pattern group per token
  // Article must satisfy ALL groups (AND), but each group allows synonyms (OR within group)
  const groups = tokens.map(tok => {
    const syns = synonymsFor(tok)
    const candidates = [...new Set([tok, ...syns])]
    return candidates.map(tokenPattern).filter(Boolean)
  })

  return articles.filter(a => {
    const text = [a.title, a.summary || '', (a.tags || []).join(' ')].join(' ')
    // AND across all groups: every group must have at least one match
    return groups.every(groupPatterns => groupPatterns.some(rx => rx.test(text)))
  })
}
