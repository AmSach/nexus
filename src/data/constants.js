export { RSS_FEEDS } from './rss_feeds'
export const CATEGORIES = [
  { id: 'all',          label: 'All',         color: 'var(--accent)' },
  { id: 'conflict',     label: 'Conflict',    color: 'var(--red)'    },
  { id: 'military',     label: 'Military',    color: '#ef4444'       },
  { id: 'osint',        label: 'OSINT',       color: '#a78bfa'       },
  { id: 'politics',     label: 'Politics',    color: 'var(--purple)' },
  { id: 'humanitarian', label: 'Humanitarian',color: '#fb923c'       },
  { id: 'finance',      label: 'Finance',     color: 'var(--yellow)' },
  { id: 'intelligence', label: 'Intel/Cyber', color: 'var(--accent)' },
  { id: 'crime',        label: 'Crime',       color: 'var(--orange)' },
  { id: 'technology',   label: 'Tech',        color: 'var(--accent2)'},
  { id: 'environment',  label: 'Climate',     color: 'var(--green)'  },
  { id: 'health',       label: 'Health',      color: '#ec4899'       },
]

export const REGIONS = [
  'all', 'Global', 'North America', 'Europe', 'Middle East',
  'East Asia', 'South Asia', 'Southeast Asia', 'Africa', 'Latin America', 'Arctic',
]

export const NODE_TYPES = [
  { type: 'person',    label: 'Person',       color: '#38bdf8', icon: '◯' },
  { type: 'org',       label: 'Organization', color: '#fbbf24', icon: '⬡' },
  { type: 'location',  label: 'Location',     color: '#4ade80', icon: '◉' },
  { type: 'event',     label: 'Event',        color: '#fb923c', icon: '◈' },
  { type: 'financial', label: 'Financial',    color: '#a78bfa', icon: '◎' },
  { type: 'military',  label: 'Military',     color: '#f87171', icon: '◬' },
  { type: 'treaty',    label: 'Treaty',       color: '#60a5fa', icon: '▣' },
  { type: 'intel',     label: 'Intel/Cyber',  color: '#2dd4bf', icon: '⊠' },
]

export const EDGE_TYPES = [
  { type: 'linked',        label: 'Linked to',     color: '#334155' },
  { type: 'controls',      label: 'Controls',      color: '#ef4444' },
  { type: 'funded',        label: 'Funded by',     color: '#fbbf24' },
  { type: 'allied',        label: 'Allied with',   color: '#4ade80' },
  { type: 'opposes',       label: 'Opposes',       color: '#f97316', dash: true },
  { type: 'caused',        label: 'Caused',        color: '#a78bfa' },
  { type: 'sameActor',     label: 'Same actor',    color: '#38bdf8', dash: true },
  { type: 'transaction',   label: 'Transaction',   color: '#fbbf24' },
  { type: 'investigating', label: 'Investigating', color: '#60a5fa' },
]

// SOURCE RELIABILITY TIERS — used for credibility scoring
export const SOURCE_TIERS = {
  // Tier 1: Highly reliable, institutional, fact-checked
  'Reuters World': 1, 'Reuters': 1, 'BBC World': 1, 'BBC Business': 1,
  'AP': 1, 'AFP': 1, 'ISW': 1, 'IAEA': 1,
  'Al Jazeera': 1, 'France 24': 1, 'DW World': 1, 'NHK World': 1,
  'RFI': 1, 'NPR World': 1,
  // Tier 2: Generally reliable, occasional bias
  'Guardian World': 2, 'Guardian Env': 2, 'Sky News': 2,
  'Foreign Policy': 2, 'Defense One': 2, 'Breaking Defense': 2, 'Defense Post': 2,
  'Kyiv Independent': 2, 'Bellingcat': 2, 'Crisis Group': 2,
  'Al Arabiya': 2, 'SCMP': 2, 'Hindustan Times': 2, 'Times of India': 2,
  'Dawn': 2, 'Anadolu Agency': 2, 'VOA': 2, 'RFERL': 2, 'Haaretz': 2,
  'Jane\'s': 2, 'Defense News': 2,
  'Krebs Security': 2, 'Security Affairs': 2, 'Hacker News': 2, 'BleepingComputer': 2,
  'TechCrunch': 2, 'Wired': 2, 'Ars Technica': 2,
  'Chatham House': 2, 'Carnegie Endowment': 2,
  'UN News': 2, 'Amnesty International': 2, 'Human Rights Watch': 2,
  'Al-Monitor': 2, 'Middle East Eye': 2, 'Arab News': 2,
  'Kyodo News': 2, 'The Hindu': 2, 'Express Tribune': 2,
  'The Diplomat': 2, 'Asia Times': 2,
  // Tier 3: Use with caution — opinion/ideological lean
  'MarketWatch': 3, 'The Intercept': 3,
  'GNews': 3, 'NewsAPI': 3, 'Alpha Vantage': 3,
}

// ── COMPREHENSIVE RSS FEED LIST ─────────────────────────────────────────────
// Organized by category priority — geopolitics/conflict FIRST, finance small slice
export const SEV_COLOR = { critical: 'var(--red)', high: 'var(--orange)', medium: 'var(--yellow)', low: 'var(--accent)' }
export const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

export const MAP_ZONES = [
  { id: 1,  name: 'Taiwan Strait',     lat: 24.0,  lng: 121.5,  sev: 'high',   cat: 'conflict', desc: 'PRC-Taiwan tension. PLA activity monitoring zone.' },
  { id: 2,  name: 'Iran — Fordow',     lat: 34.9,  lng: 50.5,   sev: 'high',   cat: 'conflict', desc: 'IAEA nuclear monitoring site.' },
  { id: 3,  name: 'Gaza Strip',        lat: 31.4,  lng: 34.3,   sev: 'high',   cat: 'conflict', desc: 'Active conflict zone.' },
  { id: 4,  name: 'Ukraine Frontline', lat: 48.5,  lng: 35.0,   sev: 'high',   cat: 'conflict', desc: 'Russia-Ukraine war. Active frontline.' },
  { id: 5,  name: 'South China Sea',   lat: 12.0,  lng: 114.0,  sev: 'medium', cat: 'conflict', desc: 'Disputed maritime zone.' },
  { id: 6,  name: 'Sahel Region',      lat: 15.0,  lng: 2.0,    sev: 'medium', cat: 'conflict', desc: 'Instability across Mali, Niger, Burkina Faso.' },
  { id: 7,  name: 'Kashmir LoC',       lat: 33.7,  lng: 74.8,   sev: 'medium', cat: 'conflict', desc: 'India-Pakistan Line of Control.' },
  { id: 8,  name: 'Sudan — Darfur',    lat: 13.6,  lng: 25.4,   sev: 'high',   cat: 'conflict', desc: 'RSF-SAF civil war, humanitarian crisis.' },
  { id: 9,  name: 'Murmansk',          lat: 68.9,  lng: 33.1,   sev: 'medium', cat: 'politics', desc: 'Arctic geopolitical competition.' },
  { id: 10, name: 'Baltic Sea',        lat: 57.5,  lng: 19.5,   sev: 'medium', cat: 'conflict', desc: 'NATO-Russia tension corridor.' },
  { id: 11, name: 'Horn of Africa',    lat: 11.5,  lng: 43.1,   sev: 'medium', cat: 'conflict', desc: 'Piracy risk, Al-Shabaab activity.' },
  { id: 12, name: 'Red Sea',           lat: 18.0,  lng: 39.0,   sev: 'high',   cat: 'conflict', desc: 'Houthi shipping attacks. US/UK naval operations.' },
  { id: 13, name: 'Korean DMZ',        lat: 38.0,  lng: 127.0,  sev: 'medium', cat: 'conflict', desc: 'DPRK military activity.' },
  { id: 14, name: 'Strait of Hormuz',  lat: 26.6,  lng: 56.3,   sev: 'high',   cat: 'conflict', desc: 'Critical oil transit choke point.' },
  { id: 15, name: 'Myanmar Civil War', lat: 19.7,  lng: 96.1,   sev: 'high',   cat: 'conflict', desc: 'Junta vs. resistance forces ongoing.' },
  { id: 16, name: 'DRC Conflict',      lat: -1.5,  lng: 29.5,   sev: 'high',   cat: 'conflict', desc: 'M23/Rwanda conflict in eastern Congo.' },
  { id: 17, name: 'Sinaloa Corridor',  lat: 25.1,  lng: -107.5, sev: 'medium', cat: 'crime',    desc: 'Cartel activity. US-Mexico security operations.' },
]

// Preset situations for quick-add in IntelCenter
export const PRESETS = [
  // Conflict
  { name: 'Ukraine War',        group: 'Conflict', icon: '⚔️'  },
  { name: 'Gaza Conflict',      group: 'Conflict', icon: '💥'  },
  { name: 'Taiwan Strait',      group: 'Conflict', icon: '🚢'  },
  { name: 'Red Sea / Houthi',   group: 'Conflict', icon: '🌊'  },
  { name: 'Sudan Crisis',       group: 'Conflict', icon: '🔥'  },
  { name: 'Myanmar Civil War',  group: 'Conflict', icon: '🪖'  },
  { name: 'DRC Conflict',       group: 'Conflict', icon: '🌍'  },
  { name: 'Sahel Instability',  group: 'Conflict', icon: '🏜️'  },
  // WMD / Nuclear
  { name: 'Iran Nuclear',       group: 'WMD',      icon: '☢️'  },
  { name: 'North Korea ICBM',   group: 'WMD',      icon: '🚀'  },
  // Geopolitics
  { name: 'Russia Sanctions',   group: 'Geopolitics', icon: '🏛️' },
  { name: 'China-US Tensions',  group: 'Geopolitics', icon: '🌐' },
  { name: 'NATO Expansion',     group: 'Geopolitics', icon: '🛡️' },
  // Finance
  { name: 'Fed Rate Decision',  group: 'Finance',  icon: '📈'  },
  { name: 'Oil Markets',        group: 'Finance',  icon: '🛢️'  },
  { name: 'Crypto Volatility',  group: 'Finance',  icon: '₿'   },
  // Cyber
  { name: 'Critical Infra Cyber', group: 'Cyber',  icon: '💻'  },
  { name: 'Nation-State Hack',  group: 'Cyber',    icon: '🔓'  },
]

// Semantic keyword expansions for situation matching
export const SITUATION_EXPANSIONS = {
  taiwan: ['taiwan','taipei','pla exercises','strait','lai ching-te','taiwan strait','tsmc'],
  iran: ['iran','tehran','irgc','khamenei','nuclear deal','enrichment','fordow','natanz','rouhani','raisi'],
  israel: ['israel','idf','netanyahu','tel aviv','jerusalem','mossad','shin bet'],
  gaza: ['gaza','hamas','rafah','west bank','idf airstrike','ceasefire','humanitarian corridor','unrwa'],
  nato: ['nato','alliance','article 5','brussels','stoltenberg','rutte','transatlantic','esten'],
  northkorea: ['north korea','dprk','kim jong','pyongyang','missile test','icbm','hwasong'],
  pakistan: [
    'pakistan','pakistani','islamabad','isi','imran khan','shehbaz','rawalpindi',
    'army chief','asim munir','pakistan army','pti','pmln','pppp',
    'karachi','lahore','peshawar','quetta','balochistan','khyber',
    'pakistan-india','pakistan-afghanistan','talibaan pakistan','ttp',
    'pakistan flood','pakistan economy','pakistan imf','pkr',
  ],
  india: [
    'india','indian','new delhi','modi','bjp','congress party','lok sabha','rajya sabha',
    'jaishankar','amit shah','rajnath','doval','indian army','indian navy','indian air force',
    'hindustan','bharat','delhi','mumbai','bangalore','chennai','kolkata','hyderabad',
    'kashmir','ladakh','arunachal','india-china','india-pakistan',
    'quad india','brics india','g20 india','rbi','rupee','surgical strike',
    'lac standoff','galwan','doklam','line of actual control',
  ],
  houthi: ['houthi','yemen','red sea','ansarallah','shipping attack','hodeidah'],
  sanctions: ['sanction','ofac','blacklist','asset freeze','export control','embargo','derisking'],
  fed: ['federal reserve','fed rate','fomc','jerome powell','interest rate','rate cut','rate hike','monetary policy','basis points'],
  oil: ['opec','crude oil','brent','wti','petroleum','energy price','oil output','barrel'],
  cyber: ['cyberattack','hack','ransomware','breach','apt','malware','espionage','zero-day','intrusion','threat actor'],
  arctic: ['arctic','greenland','svalbard','northern sea route','polar','murmansk'],
  sahel: ['sahel','mali','niger','burkina faso','wagner africa','coup','junta','ecowas'],
  myanmar: ['myanmar','burma','junta','shan','tatmadaw','naypyidaw','resistance'],
  sudan: ['sudan','rsf','dagalo','khartoum','darfur','saf','civil war'],
  drc: ['congo','drc','m23','kinshasa','goma','rwanda','kivu'],
  china: [
    'china','chinese','beijing','xi jinping','ccp','prc','pla','politburo',
    'zhongnanhai','blinken china','china economy','yuan','renminbi',
    'south china sea','china taiwan','china india','china us',
    'great firewall','hong kong','xinjiang','tibet','uyghur',
    'belt and road','made in china 2025','china gdp',
  ],
  russia: [
    'russia','russian','kremlin','putin','moscow','russian army','fsb','svr','gru',
    'wagner','russian military','russian strike','russian offensive','russian forces',
    'nato russia','russia ukraine','russia sanctions','ruble','gazprom',
    'lavrov','shoigu','gerasimov','medvedev','patrushev','kadyrov',
  ],
  ukraine: [
    'ukraine','ukrainian','zelensky','kyiv','kharkiv','zaporizhzhia','dnipro',
    'kherson','frontline','russian offensive','ukrainian forces','sumy','odesa',
    'donetsk','luhansk','bakhmut','avdiivka','ukraine war','ukraine aid',
    'ukrainian drone','ukrainian counteroffensive','himars','f-16 ukraine',
  ],
  crime: ['cartel','trafficking','money laundering','organized crime','drug war','interpol','arrest'],
  afghanistan: ['afghanistan','afghan','kabul','taliban','kandahar','helmand','panjshir','isis-k','doha deal'],
  us:   ['united states','america','washington','pentagon','white house','congress','biden','trump','american'],
  usa:  ['united states','america','washington','pentagon','white house','congress','biden','trump','american'],
  eu:   ['european union','europe','brussels','european commission','von der leyen','european parliament'],
  uk:   ['united kingdom','britain','british','london','downing street','westminster'],
  venezuela: ['venezuela','caracas','maduro','pdvsa','guaido','bolivarian'],
  ethiopia:  ['ethiopia','addis ababa','tigray','amhara','abiy ahmed','tplf','olf'],
  somalia:   ['somalia','mogadishu','al-shabaab','amisom','puntland','somaliland'],
  turkey:    ['turkey','ankara','erdogan','turkish','istanbul'],
  brazil:    ['brazil','brasilia','lula','bolsonaro','amazon'],
}
