// src/components/map/countryUtils.js — OSINT Country Extraction, Normalization & Geo-inference Engine
// Provides high-accuracy country identification, ISO 3166-1 alpha-2 codes, and flag emojis across all intelligence feeds.

export const COUNTRY_DATA = {
  US: { name: 'United States', flag: '🇺🇸', aliases: ['usa', 'united states', 'u.s.', 'u.s.a.', 'america', 'alaska', 'hawaii', 'california', 'texas', 'florida', 'nevada', 'washington'] },
  UA: { name: 'Ukraine', flag: '🇺🇦', aliases: ['ukraine', 'kyiv', 'donbas', 'donetsk', 'luhansk', 'crimea', 'kharkiv', 'zaporizhzhia', 'odesa', 'dnipro', 'bakhmut'] },
  RU: { name: 'Russia', flag: '🇷🇺', aliases: ['russia', 'russian federation', 'moscow', 'belgorod', 'kursk', 'rostov', 'voronezh', 'st. petersburg', 'kamchatka', 'sakhalin', 'kuril'] },
  IL: { name: 'Israel', flag: '🇮🇱', aliases: ['israel', 'gaza', 'palestine', 'tel aviv', 'jerusalem', 'haifa', 'west bank', 'rafah', 'khan younis', 'negev', 'idf'] },
  IR: { name: 'Iran', flag: '🇮🇷', aliases: ['iran', 'islamic republic of iran', 'tehran', 'isfahan', 'fordow', 'natanz', 'bushehr', 'shiraz', 'irgc', 'bandar abbas'] },
  TW: { name: 'Taiwan', flag: '🇹🇼', aliases: ['taiwan', 'taipei', 'kaohsiung', 'hsinchu', 'taichung', 'rocf', 'rocn', 'kinmen', 'matsu'] },
  CN: { name: 'China', flag: '🇨🇳', aliases: ['china', 'prc', "people's republic of china", 'beijing', 'shanghai', 'shenzhen', 'pla', 'plan', 'tibet', 'xinjiang', 'hainan'] },
  GB: { name: 'United Kingdom', flag: '🇬🇧', aliases: ['united kingdom', 'uk', 'great britain', 'britain', 'england', 'scotland', 'wales', 'royal navy', 'raf'] },
  DE: { name: 'Germany', flag: '🇩🇪', aliases: ['germany', 'deutschland', 'berlin', 'munich', 'frankfurt', 'hamburg', 'bundeswehr', 'ramstein'] },
  FR: { name: 'France', flag: '🇫🇷', aliases: ['france', 'paris', 'marseille', 'lyon', 'toulon', 'french navy', 'marine nationale', 'brest'] },
  JP: { name: 'Japan', flag: '🇯🇵', aliases: ['japan', 'tokyo', 'osaka', 'honshu', 'hokkaido', 'kyushu', 'okinawa', 'noto', 'jmsdf', 'izu', 'ryukyu', 'fukushima'] },
  KR: { name: 'South Korea', flag: '🇰🇷', aliases: ['south korea', 'korea, republic of', 'seoul', 'incheon', 'busan', 'rokaf', 'rokn', 'jeju'] },
  KP: { name: 'North Korea', flag: '🇰🇵', aliases: ['north korea', 'dprk', "democratic people's republic of korea", 'pyongyang', 'yongbyon', 'kpa'] },
  IN: { name: 'India', flag: '🇮🇳', aliases: ['india', 'new delhi', 'mumbai', 'kashmir', 'ladakh', 'indian air force', 'indian navy', 'bengaluru', 'andaman'] },
  PK: { name: 'Pakistan', flag: '🇵🇰', aliases: ['pakistan', 'islamabad', 'karachi', 'lahore', 'rawalpindi', 'gwadar', 'paf'] },
  PL: { name: 'Poland', flag: '🇵🇱', aliases: ['poland', 'warsaw', 'krakow', 'gdansk', 'rzeszow', 'suwalki'] },
  TR: { name: 'Turkey', flag: '🇹🇷', aliases: ['turkey', 'turkiye', 'türkiye', 'ankara', 'istanbul', 'izmir', 'malatya', 'incirlik', 'bosphorus', 'dardanelles'] },
  GR: { name: 'Greece', flag: '🇬🇷', aliases: ['greece', 'athens', 'thessaloniki', 'crete', 'aegean', 'souda bay'] },
  IT: { name: 'Italy', flag: '🇮🇹', aliases: ['italy', 'rome', 'milan', 'naples', 'sicily', 'etna', 'campi flegrei', 'taranto'] },
  ES: { name: 'Spain', flag: '🇪🇸', aliases: ['spain', 'madrid', 'barcelona', 'gibraltar strait', 'rota', 'cadiz'] },
  CA: { name: 'Canada', flag: '🇨🇦', aliases: ['canada', 'ottawa', 'toronto', 'vancouver', 'quebec', 'rcaf', 'halifax'] },
  AU: { name: 'Australia', flag: '🇦🇺', aliases: ['australia', 'canberra', 'sydney', 'melbourne', 'perth', 'raaf', 'ran', 'darwin', 'brisbane'] },
  PE: { name: 'Peru', flag: '🇵🇪', aliases: ['peru', 'lima', 'arequipa', 'cusco', 'trujillo', 'callao', 'barranca', 'pisco', 'ica', 'chimbote', 'piura'] },
  AR: { name: 'Argentina', flag: '🇦🇷', aliases: ['argentina', 'buenos aires', 'cordoba', 'rosario', 'mendoza', 'salta', 'mosconi', 'general mosconi', 'ushuaia', 'jujuy', 'tucuman'] },
  CL: { name: 'Chile', flag: '🇨🇱', aliases: ['chile', 'santiago', 'antofagasta', 'valparaiso', 'concepcion', 'coquimbo', 'iquique', 'atacama'] },
  CO: { name: 'Colombia', flag: '🇨🇴', aliases: ['colombia', 'bogota', 'medellin', 'cali', 'barranquilla', 'cartagena', 'cucuta'] },
  EC: { name: 'Ecuador', flag: '🇪🇨', aliases: ['ecuador', 'quito', 'guayaquil', 'cuenca', 'galapagos', 'esmeraldas'] },
  BO: { name: 'Bolivia', flag: '🇧🇴', aliases: ['bolivia', 'la paz', 'sucre', 'santa cruz', 'cochabamba', 'oruro', 'potosi'] },
  VE: { name: 'Venezuela', flag: '🇻🇪', aliases: ['venezuela', 'caracas', 'maracaibo', 'valencia', 'maracay'] },
  BR: { name: 'Brazil', flag: '🇧🇷', aliases: ['brazil', 'brasil', 'brasilia', 'sao paulo', 'rio de janeiro', 'itaipu', 'manaus', 'salvador'] },
  MX: { name: 'Mexico', flag: '🇲🇽', aliases: ['mexico', 'mexico city', 'popocatepetl', 'guadalajara', 'monterrey', 'tijuana', 'cancun', 'baja'] },
  ID: { name: 'Indonesia', flag: '🇮🇩', aliases: ['indonesia', 'jakarta', 'java', 'sumatra', 'sulawesi', 'bali', 'merapi', 'semeru', 'halmahera', 'banda sea', 'flores', 'molucca', 'papua'] },
  PH: { name: 'Philippines', flag: '🇵🇭', aliases: ['philippines', 'manila', 'luzon', 'mindanao', 'subic', 'palawan', 'davao', 'cebu'] },
  NZ: { name: 'New Zealand', flag: '🇳🇿', aliases: ['new zealand', 'auckland', 'wellington', 'christchurch', 'kermadec', 'kermadec islands', 'rotorua'] },
  PG: { name: 'Papua New Guinea', flag: '🇵🇬', aliases: ['papua new guinea', 'png', 'port moresby', 'new britain', 'new ireland', 'bougainville', 'kokopo'] },
  FJ: { name: 'Fiji', flag: '🇫🇯', aliases: ['fiji', 'suva', 'nadi', 'lau', 'vanua levu', 'viti levu'] },
  TO: { name: 'Tonga', flag: '🇹🇴', aliases: ['tonga', "nuku'alofa", 'tongatapu', 'haapai', 'vavau'] },
  VU: { name: 'Vanuatu', flag: '🇻🇺', aliases: ['vanuatu', 'port vila', 'espiritu santo', 'tanna'] },
  SB: { name: 'Solomon Islands', flag: '🇸🇧', aliases: ['solomon islands', 'honiara', 'guadalcanal', 'malaita'] },
  PR: { name: 'Puerto Rico', flag: '🇵🇷', aliases: ['puerto rico', 'san juan', 'ponce', 'mayaguez', 'bayamon', 'arecibo'] },
  DO: { name: 'Dominican Republic', flag: '🇩🇴', aliases: ['dominican republic', 'santo domingo', 'santiago de los caballeros', 'punta cana'] },
  CU: { name: 'Cuba', flag: '🇨🇺', aliases: ['cuba', 'havana', 'santiago de cuba', 'guantanamo'] },
  PA: { name: 'Panama', flag: '🇵🇦', aliases: ['panama', 'panama city', 'colon', 'panama canal'] },
  CR: { name: 'Costa Rica', flag: '🇨🇷', aliases: ['costa rica', 'san jose', 'alajuela', 'limon'] },
  GT: { name: 'Guatemala', flag: '🇬🇹', aliases: ['guatemala', 'guatemala city', 'antigua guatemala', 'fuego'] },
  IS: { name: 'Iceland', flag: '🇮🇸', aliases: ['iceland', 'reykjavik', 'reykjanes', 'sundhnukur', 'grindavik', 'askja', 'katla'] },
  YE: { name: 'Yemen', flag: '🇾🇪', aliases: ['yemen', 'sanaa', 'hodeidah', 'aden', 'houthi', 'bab el-mandeb', 'mukalla'] },
  SY: { name: 'Syria', flag: '🇸🇾', aliases: ['syria', 'damascus', 'aleppo', 'idlib', 'homs', 'latakia', 'tartus', 'deir ez-zor'] },
  SD: { name: 'Sudan', flag: '🇸🇩', aliases: ['sudan', 'khartoum', 'darfur', 'el fasher', 'port sudan', 'omdurman'] },
  MM: { name: 'Myanmar', flag: '🇲🇲', aliases: ['myanmar', 'burma', 'naypyidaw', 'yangon', 'mandalay', 'sagaing', 'rakhine'] },
  SA: { name: 'Saudi Arabia', flag: '🇸🇦', aliases: ['saudi arabia', 'riyadh', 'jeddah', 'aramco', 'dammam', 'neom', 'rsaf'] },
  AE: { name: 'UAE', flag: '🇦🇪', aliases: ['uae', 'united arab emirates', 'dubai', 'abu dhabi', 'jebel ali'] },
  SG: { name: 'Singapore', flag: '🇸🇬', aliases: ['singapore', 'jurong', 'changi', 'rsaf'] },
  NL: { name: 'Netherlands', flag: '🇳🇱', aliases: ['netherlands', 'holland', 'amsterdam', 'rotterdam', 'the hague'] },
  SE: { name: 'Sweden', flag: '🇸🇪', aliases: ['sweden', 'stockholm', 'gotland', 'malmo', 'saab'] },
  NO: { name: 'Norway', flag: '🇳🇴', aliases: ['norway', 'oslo', 'barentswatch', 'bergen', 'tromso', 'svalbard'] },
  FI: { name: 'Finland', flag: '🇫🇮', aliases: ['finland', 'helsinki', 'tampere'] },
  RO: { name: 'Romania', flag: '🇷🇴', aliases: ['romania', 'bucharest', 'constanta', 'mihail kogalniceanu'] },
  EG: { name: 'Egypt', flag: '🇪🇬', aliases: ['egypt', 'cairo', 'suez canal', 'sinai', 'alexandria', 'port said'] },
  IQ: { name: 'Iraq', flag: '🇮🇶', aliases: ['iraq', 'baghdad', 'erbil', 'basra', 'mosul', 'al asad'] },
  LB: { name: 'Lebanon', flag: '🇱🇧', aliases: ['lebanon', 'beirut', 'southern lebanon', 'hezbollah', 'tyre', 'sidon'] },
  SO: { name: 'Somalia', flag: '🇸🇴', aliases: ['somalia', 'mogadishu', 'gulf of aden', 'puntland', 'somaliland'] },
  CD: { name: 'DR Congo', flag: '🇨🇩', aliases: ['dr congo', 'congo', 'drc', 'kinshasa', 'goma', 'rutshuru', 'kivu'] },
  NG: { name: 'Nigeria', flag: '🇳🇬', aliases: ['nigeria', 'abuja', 'lagos', 'kano', 'port harcourt'] },
  ZA: { name: 'South Africa', flag: '🇿🇦', aliases: ['south africa', 'pretoria', 'johannesburg', 'cape town', 'durban'] },
  TH: { name: 'Thailand', flag: '🇹🇭', aliases: ['thailand', 'bangkok', 'phuket', 'chiang mai'] },
  VN: { name: 'Vietnam', flag: '🇻🇳', aliases: ['vietnam', 'hanoi', 'ho chi minh city', 'saigon', 'da nang', 'cam ranh'] },
  MY: { name: 'Malaysia', flag: '🇲🇾', aliases: ['malaysia', 'kuala lumpur', 'penang', 'johor'] },
  AF: { name: 'Afghanistan', flag: '🇦🇫', aliases: ['afghanistan', 'kabul', 'kandahar', 'herat', 'hindu kush'] },
  MA: { name: 'Morocco', flag: '🇲🇦', aliases: ['morocco', 'rabat', 'casablanca', 'marrakech', 'tangier'] },
  DZ: { name: 'Algeria', flag: '🇩🇿', aliases: ['algeria', 'algiers', 'oran', 'constantine'] },
  TN: { name: 'Tunisia', flag: '🇹🇳', aliases: ['tunisia', 'tunis', 'sfax'] },
  LY: { name: 'Libya', flag: '🇱🇾', aliases: ['libya', 'tripoli', 'benghazi', 'misrata', 'tobruk'] },
  KE: { name: 'Kenya', flag: '🇰🇪', aliases: ['kenya', 'nairobi', 'mombasa'] },
  ET: { name: 'Ethiopia', flag: '🇪🇹', aliases: ['ethiopia', 'addis ababa', 'tigray'] },
  INTL: { name: 'International Waters', flag: '🌊', aliases: ['international waters', 'high seas', 'open ocean', 'atlantic', 'pacific', 'indian ocean', 'red sea', 'persian gulf', 'strait of hormuz', 'malacca strait', 'taiwan strait', 'black sea', 'baltic sea'] },
  SPACE: { name: 'Orbital Space', flag: '🛰️', aliases: ['space', 'low earth orbit', 'orbital', 'iss'] }
}

// US state mapping for USGS earthquakes and domestic incidents
const US_STATES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware',
  'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky',
  'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico',
  'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
  'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
  'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'virgin islands', 'guam'
])

const US_POSTAL_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'VI'
])

function escapeRegex(s) {
  return s.replace(/[\^$\\.*+?()[\]{}|]/g, '\\$&')
}

/**
 * Tests whether an alias appears in text with strict word boundaries.
 * Prevents substring false positives like "ran" matching inside "barranca",
 * or "con" matching inside "mosconi".
 */
export function matchesAlias(text, alias) {
  if (!text || !alias) return false
  const esc = escapeRegex(alias)
  const re = new RegExp('(^|[^a-zA-Z0-9])' + esc + '([^a-zA-Z0-9]|$)', 'i')
  return re.test(text)
}

/**
 * Normalizes raw country code or name string
 */
export function normalizeCountry(raw) {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  const upper = trimmed.toUpperCase()

  // Exact 2-letter ISO match
  if (COUNTRY_DATA[upper]) {
    return { code: upper, name: COUNTRY_DATA[upper].name, flag: COUNTRY_DATA[upper].flag }
  }

  // Postal code check for US states (exclude AR, PR which are Argentina and Puerto Rico)
  if (upper.length === 2 && US_POSTAL_CODES.has(upper) && upper !== 'AR') {
    return { code: 'US', name: 'United States', flag: '🇺🇸' }
  }

  // Check Puerto Rico postal code
  if (upper === 'PR') {
    return { code: 'PR', name: 'Puerto Rico', flag: '🇵🇷' }
  }

  const lower = trimmed.toLowerCase()

  // Full US state check
  if (US_STATES.has(lower)) {
    return { code: 'US', name: 'United States', flag: '🇺🇸' }
  }

  // Exact or word-boundary alias scan across registered countries
  for (const [code, info] of Object.entries(COUNTRY_DATA)) {
    if (info.aliases.some(alias => lower === alias || matchesAlias(lower, alias))) {
      return { code, name: info.name, flag: info.flag }
    }
  }

  // Generic fallback if it's 2 uppercase characters
  if (upper.length === 2 && /^[A-Z]{2}$/.test(upper)) {
    return { code: upper, name: upper, flag: '🌐' }
  }

  return null
}

/**
 * Parses strategic zone into country
 */
export function parseZoneCountry(zone) {
  if (!zone) return null
  const z = zone.toLowerCase()
  if (z.includes('ukraine') || z.includes('donbas') || z.includes('black sea')) return { code: 'UA', name: 'Ukraine', flag: '🇺🇦' }
  if (z.includes('israel') || z.includes('gaza') || z.includes('levant')) return { code: 'IL', name: 'Israel', flag: '🇮🇱' }
  if (z.includes('taiwan') || z.includes('strait')) return { code: 'TW', name: 'Taiwan', flag: '🇹🇼' }
  if (z.includes('hormuz') || z.includes('persian gulf') || z.includes('iran')) return { code: 'IR', name: 'Iran', flag: '🇮🇷' }
  if (z.includes('red sea') || z.includes('yemen') || z.includes('bab el-mandeb')) return { code: 'YE', name: 'Yemen', flag: '🇾🇪' }
  if (z.includes('korean') || z.includes('korea')) return { code: 'KR', name: 'South Korea', flag: '🇰🇷' }
  if (z.includes('baltic')) return { code: 'PL', name: 'Poland / Baltic', flag: '🇵🇱' }
  if (z.includes('india') || z.includes('pakistan')) return { code: 'IN', name: 'India', flag: '🇮🇳' }
  if (z.includes('barents')) return { code: 'NO', name: 'Norway', flag: '🇳🇴' }
  if (z.includes('panama')) return { code: 'PA', name: 'Panama', flag: '🇵🇦' }
  if (z.includes('suez')) return { code: 'EG', name: 'Egypt', flag: '🇪🇬' }
  if (z.includes('malacca')) return { code: 'SG', name: 'Singapore / Malacca', flag: '🇸🇬' }
  return null
}

/**
 * Extracts country from text (title, place, description, label)
 */
export function extractCountryFromText(text) {
  if (!text || typeof text !== 'string') return null

  // 1. Check for trailing USGS earthquake format: "75 km W of Ferndale, California", "14 km ENE of Ridgecrest, CA", or "117 km NW of Barranca, Peru"
  const commaParts = text.split(',').map(s => s.trim())
  if (commaParts.length > 1) {
    const last = commaParts[commaParts.length - 1]
    const lastUpper = last.toUpperCase()

    // Trailing 2-letter postal code is a US state in USGS feeds (CA, NV, AK, HI, TX, WA, etc.)
    if (US_POSTAL_CODES.has(lastUpper)) {
      return { code: 'US', name: 'United States', flag: '🇺🇸' }
    }

    // Trailing full US state name
    if (US_STATES.has(last.toLowerCase())) {
      return { code: 'US', name: 'United States', flag: '🇺🇸' }
    }

    // Trailing full country name (e.g. "Peru", "Argentina", "New Zealand", "Chile", "Japan")
    for (let i = commaParts.length - 1; i >= 1; i--) {
      const candidate = commaParts[i]
      const norm = normalizeCountry(candidate)
      if (norm) return norm
    }
  }

  // 2. Regex for parenthesized country codes like (US), (RU), (CN), (UA), (IL), (IR), (TW), (PE), (AR)
  const parenMatch = text.match(/\(([A-Z]{2,3})\)/)
  if (parenMatch && parenMatch[1]) {
    const norm = normalizeCountry(parenMatch[1])
    if (norm) return norm
  }

  // 3. Strict word-boundary alias scan across registered countries
  for (const [code, info] of Object.entries(COUNTRY_DATA)) {
    if (code === 'INTL' || code === 'SPACE') continue
    if (info.aliases.some(alias => matchesAlias(text, alias))) {
      return { code, name: info.name, flag: info.flag }
    }
  }

  return null
}

/**
 * Geographic bounding box inference for coordinate fallbacks
 */
export function inferCountryFromCoords(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return { code: 'GLOBAL', name: 'Global Signal', flag: '🌐' }

  // Ukraine / Donbas
  if (lat >= 44 && lat <= 53 && lng >= 22 && lng <= 41) return { code: 'UA', name: 'Ukraine', flag: '🇺🇦' }
  // Israel / Palestine / Levant
  if (lat >= 29.5 && lat <= 33.5 && lng >= 34.0 && lng <= 36.5) return { code: 'IL', name: 'Israel / Levant', flag: '🇮🇱' }
  // Taiwan
  if (lat >= 21.5 && lat <= 26.0 && lng >= 119.0 && lng <= 122.5) return { code: 'TW', name: 'Taiwan', flag: '🇹🇼' }
  // Persian Gulf / Iran
  if (lat >= 24.0 && lat <= 39.0 && lng >= 44.0 && lng <= 63.5) return { code: 'IR', name: 'Iran', flag: '🇮🇷' }
  // Red Sea / Yemen / Horn of Africa
  if (lat >= 11.5 && lat <= 28.0 && lng >= 32.0 && lng <= 52.0) return { code: 'YE', name: 'Yemen / Red Sea', flag: '🇾🇪' }
  // Continental United States
  if (lat >= 24.0 && lat <= 49.5 && lng >= -125.0 && lng <= -66.5) return { code: 'US', name: 'United States', flag: '🇺🇸' }
  // Alaska -> rolls up cleanly to US
  if (lat >= 51.0 && lat <= 72.0 && lng >= -179.0 && lng <= -129.0) return { code: 'US', name: 'United States', flag: '🇺🇸' }
  // Hawaii -> rolls up cleanly to US
  if (lat >= 18.5 && lat <= 22.5 && lng >= -161.0 && lng <= -154.0) return { code: 'US', name: 'United States', flag: '🇺🇸' }
  // Puerto Rico
  if (lat >= 17.8 && lat <= 18.6 && lng >= -67.4 && lng <= -65.2) return { code: 'PR', name: 'Puerto Rico', flag: '🇵🇷' }
  // Chile
  if (lat >= -56.0 && lat <= -17.5 && lng >= -76.0 && lng <= -66.5) return { code: 'CL', name: 'Chile', flag: '🇨🇱' }
  // Peru
  if (lat >= -18.5 && lat <= 0.0 && lng >= -81.5 && lng <= -68.5) return { code: 'PE', name: 'Peru', flag: '🇵🇪' }
  // Argentina
  if (lat >= -55.0 && lat <= -21.5 && lng >= -73.0 && lng <= -53.5) return { code: 'AR', name: 'Argentina', flag: '🇦🇷' }
  // Bolivia
  if (lat >= -23.0 && lat <= -9.5 && lng >= -69.5 && lng <= -57.5) return { code: 'BO', name: 'Bolivia', flag: '🇧🇴' }
  // Colombia
  if (lat >= -4.5 && lat <= 13.0 && lng >= -79.0 && lng <= -66.5) return { code: 'CO', name: 'Colombia', flag: '🇨🇴' }
  // Brazil
  if ((lat >= -33.8 && lat <= 5.3 && lng >= -53.5 && lng <= -34.8) || (lat >= -10.0 && lat <= 4.0 && lng >= -65.0 && lng <= -53.5)) return { code: 'BR', name: 'Brazil', flag: '🇧🇷' }
  // New Zealand
  if (lat >= -47.5 && lat <= -34.0 && lng >= 165.0 && lng <= 179.0) return { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' }
  // Papua New Guinea
  if (lat >= -12.0 && lat <= -1.0 && lng >= 140.5 && lng <= 156.0) return { code: 'PG', name: 'Papua New Guinea', flag: '🇵🇬' }
  // Fiji
  if (lat >= -21.0 && lat <= -15.5 && lng >= 177.0 && lng <= 180.0) return { code: 'FJ', name: 'Fiji', flag: '🇫🇯' }
  // Japan
  if (lat >= 24.0 && lat <= 46.0 && lng >= 123.0 && lng <= 146.0) return { code: 'JP', name: 'Japan', flag: '🇯🇵' }
  // Korean Peninsula
  if (lat >= 33.0 && lat <= 43.0 && lng >= 124.0 && lng <= 131.0) return { code: 'KR', name: 'Korea', flag: '🇰🇷' }
  // China
  if (lat >= 18.0 && lat <= 53.5 && lng >= 73.5 && lng <= 135.0) return { code: 'CN', name: 'China', flag: '🇨🇳' }
  // Russia (European)
  if (lat >= 50.0 && lat <= 70.0 && lng >= 28.0 && lng <= 60.0) return { code: 'RU', name: 'Russia', flag: '🇷🇺' }
  // United Kingdom
  if (lat >= 49.5 && lat <= 61.0 && lng >= -8.5 && lng <= 2.0) return { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' }
  // Germany
  if (lat >= 47.0 && lat <= 55.0 && lng >= 5.8 && lng <= 15.0) return { code: 'DE', name: 'Germany', flag: '🇩🇪' }
  // France
  if (lat >= 42.0 && lat <= 51.0 && lng >= -5.0 && lng <= 8.5) return { code: 'FR', name: 'France', flag: '🇫🇷' }
  // Poland
  if (lat >= 49.0 && lat <= 55.0 && lng >= 14.0 && lng <= 24.5) return { code: 'PL', name: 'Poland', flag: '🇵🇱' }
  // Turkey
  if (lat >= 36.0 && lat <= 42.5 && lng >= 26.0 && lng <= 45.0) return { code: 'TR', name: 'Turkey', flag: '🇹🇷' }
  // Italy
  if (lat >= 36.5 && lat <= 47.1 && lng >= 6.6 && lng <= 18.5) return { code: 'IT', name: 'Italy', flag: '🇮🇹' }
  // India
  if (lat >= 6.5 && lat <= 35.5 && lng >= 68.0 && lng <= 97.5) return { code: 'IN', name: 'India', flag: '🇮🇳' }
  // Indonesia
  if (lat >= -11.0 && lat <= 6.0 && lng >= 95.0 && lng <= 141.0) return { code: 'ID', name: 'Indonesia', flag: '🇮🇩' }
  // Australia
  if (lat >= -44.0 && lat <= -10.0 && lng >= 112.0 && lng <= 154.0) return { code: 'AU', name: 'Australia', flag: '🇦🇺' }
  // Iceland
  if (lat >= 63.0 && lat <= 67.0 && lng >= -25.0 && lng <= -13.0) return { code: 'IS', name: 'Iceland', flag: '🇮🇸' }

  return { code: 'INTL', name: 'International / Maritime', flag: '🌊' }
}

/**
 * Main entry point: accurately extracts country from any signal object
 */
export function getPointCountry(pt) {
  if (!pt) return { code: 'GLOBAL', name: 'Global', flag: '🌐' }

  // 1. Orbital Space
  if (pt.type === 'iss' || pt.type === 'launch') {
    return { code: 'SPACE', name: 'Orbital Space', flag: '🛰️' }
  }

  // 2. Direct property matches
  const directProp = pt.country || pt.meta?.country || pt.meta?.countryname || pt.meta?.origin_country || pt.meta?.country_code
  if (directProp) {
    const match = normalizeCountry(String(directProp))
    if (match) return match
  }

  // 3. Vessel flag / registration
  const flagProp = pt.meta?.flag || pt.flag || pt.meta?.registration || pt.registration
  if (flagProp) {
    const match = normalizeCountry(String(flagProp))
    if (match) return match
  }

  // 4. Strategic Zone
  const zoneProp = pt.meta?.zone || pt.zone
  if (zoneProp) {
    const match = parseZoneCountry(String(zoneProp))
    if (match) return match
  }

  // 5. Text extraction (name, title, place, description)
  const fullText = `${pt.name || ''} ${pt.title || ''} ${pt.place || pt.meta?.place || ''} ${pt.desc || pt.summary || ''}`
  const textMatch = extractCountryFromText(fullText)
  if (textMatch) return textMatch

  // 6. Coordinates geographic inference
  if (typeof pt.lat === 'number' && typeof pt.lng === 'number') {
    return inferCountryFromCoords(pt.lat, pt.lng)
  }

  return { code: 'GLOBAL', name: 'Global Signal', flag: '🌐' }
}
