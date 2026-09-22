// src/components/map/countryUtils.js — OSINT Country Extraction, Normalization & Geo-inference Engine
// Provides high-accuracy country identification, ISO 3166-1 alpha-2 codes, and flag emojis across all intelligence feeds.

export const COUNTRY_DATA = {
  US: { name: 'United States', flag: '🇺🇸', aliases: ['usa', 'united states', 'u.s.', 'u.s.a.', 'america'] },
  UA: { name: 'Ukraine', flag: '🇺🇦', aliases: ['ukraine', 'kyiv', 'donbas', 'donetsk', 'luhansk', 'crimea', 'kharkiv', 'zaporizhzhia', 'odesa'] },
  RU: { name: 'Russia', flag: '🇷🇺', aliases: ['russia', 'russian federation', 'moscow', 'belgorod', 'kursk', 'rostov', 'voronezh'] },
  IL: { name: 'Israel', flag: '🇮🇱', aliases: ['israel', 'gaza', 'palestine', 'tel aviv', 'jerusalem', 'haifa', 'west bank', 'rafah', 'khan younis'] },
  IR: { name: 'Iran', flag: '🇮🇷', aliases: ['iran', 'islamic republic of iran', 'tehran', 'isfahan', 'fordow', 'natanz', 'bushehr', 'shiraz'] },
  TW: { name: 'Taiwan', flag: '🇹🇼', aliases: ['taiwan', 'taipei', 'kaohsiung', 'hsinchu', 'taichung', 'rocf', 'rocn'] },
  CN: { name: 'China', flag: '🇨🇳', aliases: ['china', 'prc', "people's republic of china", 'beijing', 'shanghai', 'shenzhen', 'pla', 'plan'] },
  GB: { name: 'United Kingdom', flag: '🇬🇧', aliases: ['united kingdom', 'uk', 'great britain', 'britain', 'england', 'scotland', 'royal navy', 'raf'] },
  DE: { name: 'Germany', flag: '🇩🇪', aliases: ['germany', 'deutschland', 'berlin', 'munich', 'frankfurt', 'hamburg', 'bundeswehr'] },
  FR: { name: 'France', flag: '🇫🇷', aliases: ['france', 'paris', 'marseille', 'lyon', 'toulon', 'french navy', 'marine nationale'] },
  JP: { name: 'Japan', flag: '🇯🇵', aliases: ['japan', 'tokyo', 'osaka', 'honshu', 'hokkaido', 'kyushu', 'okinawa', 'noto', 'jmsdf'] },
  KR: { name: 'South Korea', flag: '🇰🇷', aliases: ['south korea', 'korea, republic of', 'seoul', 'incheon', 'busan', 'rokaf', 'rokn'] },
  KP: { name: 'North Korea', flag: '🇰🇵', aliases: ['north korea', 'dprk', "democratic people's republic of korea", 'pyongyang', 'yongbyon'] },
  IN: { name: 'India', flag: '🇮🇳', aliases: ['india', 'new delhi', 'mumbai', 'kashmir', 'ladakh', 'indian air force', 'indian navy'] },
  PK: { name: 'Pakistan', flag: '🇵🇰', aliases: ['pakistan', 'islamabad', 'karachi', 'lahore', 'rawalpindi'] },
  PL: { name: 'Poland', flag: '🇵🇱', aliases: ['poland', 'warsaw', 'krakow', 'gdansk', 'rzeszow'] },
  TR: { name: 'Turkey', flag: '🇹🇷', aliases: ['turkey', 'turkiye', 'türkiye', 'ankara', 'istanbul', 'izmir', 'malatya'] },
  GR: { name: 'Greece', flag: '🇬🇷', aliases: ['greece', 'athens', 'thessaloniki', 'crete', 'aegean'] },
  IT: { name: 'Italy', flag: '🇮🇹', aliases: ['italy', 'rome', 'milan', 'naples', 'sicily', 'etna', 'campi flegrei'] },
  ES: { name: 'Spain', flag: '🇪🇸', aliases: ['spain', 'madrid', 'barcelona', 'gibraltar strait', 'rota'] },
  CA: { name: 'Canada', flag: '🇨🇦', aliases: ['canada', 'ottawa', 'toronto', 'vancouver', 'quebec', 'rcaf'] },
  AU: { name: 'Australia', flag: '🇦🇺', aliases: ['australia', 'canberra', 'sydney', 'melbourne', 'perth', 'raaf', 'ran'] },
  BR: { name: 'Brazil', flag: '🇧🇷', aliases: ['brazil', 'brasil', 'brasilia', 'sao paulo', 'rio de janeiro', 'itaipu'] },
  CL: { name: 'Chile', flag: '🇨🇱', aliases: ['chile', 'santiago', 'antofagasta', 'valparaiso'] },
  MX: { name: 'Mexico', flag: '🇲🇽', aliases: ['mexico', 'mexico city', 'popocatepetl', 'guadalajara', 'monterrey'] },
  ID: { name: 'Indonesia', flag: '🇮🇩', aliases: ['indonesia', 'jakarta', 'java', 'sumatra', 'sulawesi', 'bali', 'merapi', 'semeru'] },
  PH: { name: 'Philippines', flag: '🇵🇭', aliases: ['philippines', 'manila', 'luzon', 'mindanao', 'subic', 'palawan'] },
  IS: { name: 'Iceland', flag: '🇮🇸', aliases: ['iceland', 'reykjavik', 'reykjanes', 'sundhnukur', 'grindavik'] },
  YE: { name: 'Yemen', flag: '🇾🇪', aliases: ['yemen', 'sanaa', 'hodeidah', 'aden', 'houthi', 'bab el-mandeb'] },
  SY: { name: 'Syria', flag: '🇸🇾', aliases: ['syria', 'damascus', 'aleppo', 'idlib', 'homs', 'latakia'] },
  SD: { name: 'Sudan', flag: '🇸🇩', aliases: ['sudan', 'khartoum', 'darfur', 'el fasher', 'port sudan'] },
  MM: { name: 'Myanmar', flag: '🇲🇲', aliases: ['myanmar', 'burma', 'naypyidaw', 'yangon', 'mandalay', 'sagaing'] },
  SA: { name: 'Saudi Arabia', flag: '🇸🇦', aliases: ['saudi arabia', 'riyadh', 'jeddah', 'aramco'] },
  AE: { name: 'UAE', flag: '🇦🇪', aliases: ['uae', 'united arab emirates', 'dubai', 'abu dhabi'] },
  SG: { name: 'Singapore', flag: '🇸🇬', aliases: ['singapore', 'jurong', 'changi'] },
  NL: { name: 'Netherlands', flag: '🇳🇱', aliases: ['netherlands', 'holland', 'amsterdam', 'rotterdam', 'the hague'] },
  SE: { name: 'Sweden', flag: '🇸🇪', aliases: ['sweden', 'stockholm', 'gotland'] },
  NO: { name: 'Norway', flag: '🇳🇴', aliases: ['norway', 'oslo', 'barentswatch', 'bergen'] },
  FI: { name: 'Finland', flag: '🇫🇮', aliases: ['finland', 'helsinki'] },
  RO: { name: 'Romania', flag: '🇷🇴', aliases: ['romania', 'bucharest', 'constanta'] },
  EG: { name: 'Egypt', flag: '🇪🇬', aliases: ['egypt', 'cairo', 'suez canal', 'sinai', 'alexandria'] },
  IQ: { name: 'Iraq', flag: '🇮🇶', aliases: ['iraq', 'baghdad', 'erbil', 'basra'] },
  LB: { name: 'Lebanon', flag: '🇱🇧', aliases: ['lebanon', 'beirut', 'southern lebanon', 'hezbollah'] },
  SO: { name: 'Somalia', flag: '🇸🇴', aliases: ['somalia', 'mogadishu', 'gulf of aden'] },
  CD: { name: 'DR Congo', flag: '🇨🇩', aliases: ['dr congo', 'congo', 'drc', 'kinshasa', 'goma', 'rutshuru'] },
  NG: { name: 'Nigeria', flag: '🇳🇬', aliases: ['nigeria', 'abuja', 'lagos'] },
  ZA: { name: 'South Africa', flag: '🇿🇦', aliases: ['south africa', 'pretoria', 'johannesburg', 'cape town'] },
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
  'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'puerto rico', 'virgin islands', 'guam'
])

const US_POSTAL_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'PR', 'VI'
])

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

  // Postal code check for US states
  if (upper.length === 2 && US_POSTAL_CODES.has(upper)) {
    return { code: 'US', name: 'United States', flag: '🇺🇸' }
  }

  const lower = trimmed.toLowerCase()

  // Full state check
  if (US_STATES.has(lower)) {
    return { code: 'US', name: 'United States', flag: '🇺🇸' }
  }

  // Alias scan across registered countries
  for (const [code, info] of Object.entries(COUNTRY_DATA)) {
    if (info.aliases.some(alias => lower === alias || lower.includes(alias))) {
      return { code, name: info.name, flag: info.flag }
    }
  }

  // Generic fallback if it's 2 characters
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

  // Check for trailing USGS earthquake format: "75 km W of Ferndale, California" or "Macedonia, Greece"
  const commaParts = text.split(',').map(s => s.trim())
  if (commaParts.length > 1) {
    const candidate = commaParts[commaParts.length - 1]
    const norm = normalizeCountry(candidate)
    if (norm) return norm
  }

  // Regex for parenthesized country codes like (US), (RU), (CN), (UA), (IL), (IR), (TW)
  const parenMatch = text.match(/\(([A-Z]{2,3})\)/)
  if (parenMatch && parenMatch[1]) {
    const norm = normalizeCountry(parenMatch[1])
    if (norm) return norm
  }

  const lower = text.toLowerCase()
  for (const [code, info] of Object.entries(COUNTRY_DATA)) {
    if (code === 'INTL' || code === 'SPACE') continue
    if (info.aliases.some(alias => lower.includes(alias))) {
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
  // Alaska
  if (lat >= 51.0 && lat <= 72.0 && lng >= -170.0 && lng <= -130.0) return { code: 'US', name: 'United States (AK)', flag: '🇺🇸' }
  // Hawaii
  if (lat >= 18.5 && lat <= 22.5 && lng >= -161.0 && lng <= -154.0) return { code: 'US', name: 'United States (HI)', flag: '🇺🇸' }
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
  // Brazil
  if (lat >= -34.0 && lat <= 5.5 && lng >= -74.0 && lng <= -34.5) return { code: 'BR', name: 'Brazil', flag: '🇧🇷' }
  // Chile
  if (lat >= -56.0 && lat <= -17.5 && lng >= -76.0 && lng <= -66.0) return { code: 'CL', name: 'Chile', flag: '🇨🇱' }
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
