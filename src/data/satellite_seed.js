// src/data/satellite_seed.js — High-fidelity instant baseline for Nexus 3D Globe & Map
// Provides immediate rendering of strategic assets and natural phenomena on first load.

export const SEED_SATELLITE_BASELINE = {
  earthquakes: [
    { lat: 37.52, lng: 137.31, mag: 5.6, depth: 12, place: 'Noto Peninsula, Japan', time: '10:14', severity: 'high', tsunami: false },
    { lat: -21.45, lng: -68.32, mag: 5.2, depth: 110, place: 'Antofagasta, Chile', time: '08:42', severity: 'medium', tsunami: false },
    { lat: 38.12, lng: 38.45, mag: 4.8, depth: 8, place: 'Eastern Turkey / Malatya', time: '07:19', severity: 'medium', tsunami: false },
    { lat: 0.45, lng: 123.12, mag: 5.8, depth: 45, place: 'Minahasa, Sulawesi, Indonesia', time: '05:33', severity: 'high', tsunami: false },
    { lat: 60.14, lng: -152.88, mag: 4.5, depth: 95, place: 'Southern Alaska', time: '04:10', severity: 'medium', tsunami: false },
    { lat: -6.18, lng: 130.45, mag: 6.1, depth: 140, place: 'Banda Sea', time: '03:15', severity: 'critical', tsunami: false },
    { lat: 35.82, lng: 140.12, mag: 4.6, depth: 48, place: 'Chiba, Japan', time: '02:08', severity: 'medium', tsunami: false },
    { lat: 14.25, lng: -91.82, mag: 5.1, depth: 72, place: 'Off the coast of Guatemala', time: '01:50', severity: 'medium', tsunami: false },
    { lat: 40.85, lng: 14.18, mag: 4.2, depth: 4, place: 'Campi Flegrei, Naples, Italy', time: '00:45', severity: 'medium', tsunami: false },
    { lat: 64.12, lng: -21.90, mag: 4.4, depth: 6, place: 'Reykjanes Ridge, Iceland', time: '00:12', severity: 'medium', tsunami: false },
  ],

  volcanoes: [
    { name: 'Mount Etna', lat: 37.75, lng: 14.99, country: 'Italy', type: 'Stratovolcano', lastActivity: 'Active Ash Plume', vei: 3, severity: 'high', url: 'https://volcano.si.edu/volcano.cfm?vn=211060' },
    { name: 'Reykjanes / Sundhnúkur', lat: 63.88, lng: -22.38, country: 'Iceland', type: 'Fissure Vent', lastActivity: 'Basaltic Fissure Flow', vei: 2, severity: 'high', url: 'https://volcano.si.edu/volcano.cfm?vn=371030' },
    { name: 'Popocatépetl', lat: 19.02, lng: -98.62, country: 'Mexico', type: 'Stratovolcano', lastActivity: 'Gas & Ash Emissions', vei: 3, severity: 'high', url: 'https://volcano.si.edu/volcano.cfm?vn=341090' },
    { name: 'Mount Merapi', lat: -7.54, lng: 110.44, country: 'Indonesia', type: 'Stratovolcano', lastActivity: 'Pyroclastic Flows', vei: 4, severity: 'critical', url: 'https://volcano.si.edu/volcano.cfm?vn=263250' },
    { name: 'Sakurajima', lat: 31.59, lng: 130.65, country: 'Japan', type: 'Caldera / Stratovolcano', lastActivity: 'Vulcanian Explosions', vei: 3, severity: 'high', url: 'https://volcano.si.edu/volcano.cfm?vn=282080' },
    { name: 'Kilauea', lat: 19.42, lng: -155.28, country: 'United States', type: 'Shield Volcano', lastActivity: 'Halemaʻumaʻu Crater Lake', vei: 2, severity: 'medium', url: 'https://volcano.si.edu/volcano.cfm?vn=332010' },
    { name: 'Fuego', lat: 14.47, lng: -90.88, country: 'Guatemala', type: 'Stratovolcano', lastActivity: 'Lava Fountain Activity', vei: 3, severity: 'high', url: 'https://volcano.si.edu/volcano.cfm?vn=342090' },
    { name: 'Semeru', lat: -8.11, lng: 112.92, country: 'Indonesia', type: 'Stratovolcano', lastActivity: 'Ash Plumes to 4km', vei: 3, severity: 'high', url: 'https://volcano.si.edu/volcano.cfm?vn=263300' },
  ],

  hurricanes: [
    { id: 'al062026', name: 'Fay', classification: 'Tropical Storm', intensity: 45, pressure: 1002, lat: 28.5, lng: -48.2, severity: 'medium', movement: 'NW at 12kt', headline: 'Tropical Storm Fay tracking across central Atlantic.' },
    { id: 'ep162026', name: 'Odalys', classification: 'Hurricane Cat 2', intensity: 85, pressure: 978, lat: 16.4, lng: -118.6, severity: 'high', movement: 'WNW at 9kt', headline: 'Hurricane Odalys generating heavy swells off western Mexico.' },
  ],

  gdacs: [
    { lat: 15.5, lng: 32.5, severity: 'critical', title: 'Sudan Civil Conflict Displacement', description: 'UN OCHA humanitarian emergency across Khartoum and Darfur provinces.', url: 'https://www.gdacs.org', eventtype: 'DR', alertlevel: 'red' },
    { lat: 23.8, lng: 90.4, severity: 'high', title: 'Bangladesh Monsoon Inundation', description: 'Over 1.2M people affected by riverine flooding across Sylhet and Feni districts.', url: 'https://www.gdacs.org', eventtype: 'FL', alertlevel: 'orange' },
    { lat: -1.6, lng: 29.2, severity: 'high', title: 'DRC Eastern Province Clashes', description: 'Critical civilian protection crisis around Goma and Rutshuru.', url: 'https://www.gdacs.org', eventtype: 'DR', alertlevel: 'orange' },
    { lat: 31.4, lng: 34.3, severity: 'critical', title: 'Gaza Humanitarian Emergency', description: 'Severe infrastructure collapse and critical shelter shortage.', url: 'https://www.gdacs.org', eventtype: 'DR', alertlevel: 'red' },
  ],

  aircraft: [
    { lat: 44.15, lng: 30.22, callsign: 'FORTE12', icao24: 'ae5414', altitude: 54000, velocity: 340, heading: 85, squawk: '1200', zone: 'Black Sea Recon', country: 'US Air Force', pattern: 'High-altitude ISR Orbit' },
    { lat: 54.82, lng: 19.45, callsign: 'LAGR11', icao24: 'ae0145', altitude: 28000, velocity: 410, heading: 240, squawk: '2455', zone: 'Baltic Air Shield', country: 'NATO / RAF', pattern: 'Aerial Refueling Track' },
    { lat: 26.22, lng: 55.45, callsign: 'VIPER41', icao24: '710342', altitude: 22000, velocity: 460, heading: 310, squawk: '5120', zone: 'Strait of Hormuz', country: 'US Navy', pattern: 'Maritime Patrol' },
    { lat: 23.45, lng: 120.12, callsign: 'REDHAWK01', icao24: '899012', altitude: 31000, velocity: 480, heading: 180, squawk: '4301', zone: 'Taiwan Strait ADIZ', country: 'ROCAF', pattern: 'CAP Patrol' },
    { lat: 33.15, lng: 35.12, callsign: 'IAF821', icao24: '738045', altitude: 24000, velocity: 450, heading: 45, squawk: '7100', zone: 'Northern Border', country: 'Israel AF', pattern: 'Border Surveillance' },
    { lat: 14.85, lng: 42.45, callsign: 'SENTINEL', icao24: 'ae5b22', altitude: 35000, velocity: 390, heading: 165, squawk: '4220', zone: 'Southern Red Sea', country: 'Combined Maritime Forces', pattern: 'Anti-Ship Defense Orbit' },
    { lat: 50.12, lng: 23.45, callsign: 'NATO01', icao24: '4d03c2', altitude: 32000, velocity: 360, heading: 120, squawk: '1100', zone: 'Poland-Ukraine Border', country: 'NATO E-3A Sentry', pattern: 'AWACS Surveillance Orbit' },
    { lat: 34.25, lng: 24.12, callsign: 'MAGIC55', icao24: '33a210', altitude: 29000, velocity: 410, heading: 270, squawk: '2100', zone: 'Eastern Mediterranean', country: 'French Air Force', pattern: 'Maritime Escort' },
  ],

  milaircraft: [
    { lat: 44.15, lng: 30.22, callsign: 'FORTE12 (RQ-4B)', icao24: 'ae5414', altitude: 54000, velocity: 340, heading: 85, model: 'RQ-4 Global Hawk', zone: 'Black Sea', country: 'United States', _military: true },
    { lat: 50.12, lng: 23.45, callsign: 'NATO01 (E-3A)', icao24: '4d03c2', altitude: 32000, velocity: 360, heading: 120, model: 'Boeing E-3A Sentry', zone: 'Eastern Flank', country: 'NATO', _military: true },
    { lat: 26.22, lng: 55.45, callsign: 'P8-POSEIDON', icao24: 'ae6841', altitude: 18000, velocity: 380, heading: 315, model: 'Boeing P-8A Poseidon', zone: 'Persian Gulf', country: 'United States', _military: true },
    { lat: 55.10, lng: 20.15, callsign: 'RC-135 RIVET', icao24: 'ae01d5', altitude: 34000, velocity: 430, heading: 90, model: 'RC-135V Rivet Joint', zone: 'Baltic Sea', country: 'United Kingdom', _military: true },
  ],

  ships: [
    { lat: 26.55, lng: 56.40, name: 'Strait of Hormuz Chokepoint', mmsi: 'CHOKE-HORMUZ', zone: 'Strait of Hormuz', speed: 12, _density: true, _count: 42 },
    { lat: 12.58, lng: 43.35, name: 'Bab el-Mandeb Chokepoint', mmsi: 'CHOKE-BABEL', zone: 'Bab el-Mandeb', speed: 11, _density: true, _count: 18 },
    { lat: 1.25,  lng: 103.85, name: 'Malacca Strait Transit', mmsi: 'CHOKE-MALACCA', zone: 'Malacca Strait', speed: 14, _density: true, _count: 76 },
    { lat: 41.12, lng: 29.08, name: 'Bosphorus Transit Zone', mmsi: 'CHOKE-BOSPHORUS', zone: 'Turkish Straits', speed: 9, _density: true, _count: 24 },
    { lat: 29.95, lng: 32.55, name: 'Suez Canal Convoy South', mmsi: 'CHOKE-SUEZ', zone: 'Suez Canal', speed: 8, _density: true, _count: 31 },
    { lat: 9.10,  lng: -79.70, name: 'Panama Canal Locks Waiting', mmsi: 'CHOKE-PANAMA', zone: 'Panama Canal', speed: 4, _density: true, _count: 28 },
    { lat: 25.10, lng: 56.80, name: 'AL KHALIDIAH (VLCC Tanker)', mmsi: '470123000', type: 'Crude Oil Tanker', flag: 'UAE', zone: 'Gulf of Oman', speed: 13.5 },
    { lat: 24.80, lng: 57.20, name: 'PACIFIC GLORY (LNG)', mmsi: '352981000', type: 'LNG Carrier', flag: 'Panama', zone: 'Arabian Sea', speed: 16.2 },
    { lat: 13.20, lng: 43.10, name: 'MSC MEDITERRANEAN (Container)', mmsi: '255806000', type: 'Container Ship', flag: 'Liberia', zone: 'Red Sea Escort', speed: 18.0 },
  ],

  warships: [
    { lat: 14.20, lng: 42.10, name: 'USS DWIGHT D. EISENHOWER (CVN-69)', mmsi: 'MIL-USN-01', shipType: 'Aircraft Carrier', flag: 'US', zone: 'Red Sea', speed: 22, _military: true, _livePos: true },
    { lat: 13.90, lng: 42.45, name: 'HMS DIAMOND (D34)', mmsi: 'MIL-RN-01', shipType: 'Type 45 Destroyer', flag: 'UK', zone: 'Bab el-Mandeb', speed: 18, _military: true, _livePos: true },
    { lat: 34.50, lng: 33.20, name: 'FS FORBIN (D620)', mmsi: 'MIL-MN-01', shipType: 'Air Defense Frigate', flag: 'FR', zone: 'Eastern Mediterranean', speed: 16, _military: true, _livePos: true },
    { lat: 24.80, lng: 122.40, name: 'ROCS TSO YING (DDG-1803)', mmsi: 'MIL-ROCN-01', shipType: 'Guided Missile Destroyer', flag: 'TW', zone: 'Taiwan East Coast', speed: 19, _military: true, _livePos: true },
  ],

  globalFires: [
    { lat: 48.28, lng: 37.18, brightness: 412, confidence: 'high', zone: 'Pokrovsk Frontline', product: 'VIIRS', severity: 'critical', date: '2026-09-22' },
    { lat: 48.01, lng: 37.52, brightness: 388, confidence: 'high', zone: 'Kurakhove Sector', product: 'VIIRS', severity: 'high', date: '2026-09-22' },
    { lat: 31.52, lng: 34.46, brightness: 420, confidence: 'high', zone: 'Gaza City', product: 'VIIRS', severity: 'critical', date: '2026-09-22' },
    { lat: 15.58, lng: 32.53, brightness: 405, confidence: 'high', zone: 'Khartoum Industrial', product: 'VIIRS', severity: 'high', date: '2026-09-22' },
    { lat: 22.35, lng: 95.80, brightness: 372, confidence: 'nominal', zone: 'Sagaing Region', product: 'VIIRS', severity: 'medium', date: '2026-09-22' },
    { lat: -1.68, lng: 29.22, brightness: 415, confidence: 'high', zone: 'Rutshuru Territory', product: 'VIIRS', severity: 'critical', date: '2026-09-22' },
  ],

  iss: {
    lat: 28.4,
    lng: 48.2,
    altitude: 418,
    velocity: 27600,
    name: 'ISS (ZARYA)',
  },

  conflictEvents: [
    { lat: 48.52, lng: 37.85, title: 'Frontline Artillery Clashes', country: 'Ukraine', region: 'Donetsk', fatalities: 14, source: 'UCDP/OSINT', severity: 'high', date: '2026-09-22' },
    { lat: 31.35, lng: 34.32, title: 'Urban Combat Operations', country: 'Palestine', region: 'Southern Gaza', fatalities: 8, source: 'ReliefWeb/UN', severity: 'high', date: '2026-09-22' },
    { lat: 13.62, lng: 25.35, title: 'SAF-RSF Clashes in North Darfur', country: 'Sudan', region: 'El Fasher', fatalities: 22, source: 'ACLED', severity: 'critical', date: '2026-09-22' },
    { lat: 21.98, lng: 96.08, title: 'PDF Ambush on Junta Outpost', country: 'Myanmar', region: 'Mandalay', fatalities: 6, source: 'Local OSINT', severity: 'medium', date: '2026-09-22' },
    { lat: 14.45, lng: -1.85, title: 'Militant Complex Ambush', country: 'Mali', region: 'Sahel Border Zone', fatalities: 12, source: 'Crisis24', severity: 'high', date: '2026-09-22' },
  ],

  nuclear: [
    { lat: 34.88, lng: 50.99, title: 'Fordow Fuel Enrichment Plant (FFEP)', country: 'Iran', desc: 'Active IAEA safeguards inspection cycle. Centrifuge cascade monitoring.', severity: 'high' },
    { lat: 32.55, lng: 51.68, title: 'Isfahan Nuclear Technology Center', country: 'Iran', desc: 'Uranium conversion facility and fuel plate fabrication.', severity: 'high' },
    { lat: 39.80, lng: 125.75, title: 'Yongbyon Nuclear Scientific Research Center', country: 'North Korea', desc: '5MWe reactor cooling discharge and radiochemical laboratory activity.', severity: 'high' },
    { lat: 47.51, lng: 34.58, title: 'Zaporizhzhia Nuclear Power Plant (ZNPP)', country: 'Ukraine', desc: 'IAEA permanent monitoring mission on-site. External power line stability vigilance.', severity: 'critical' },
  ],

  // ── PEAK OSINT JOURNALISM DATASETS ───────────────────────────────────────────
  gpsjam: [
    { lat: 54.72, lng: 20.51, title: 'Kaliningrad / Baltic Sea GNSS Denial Zone', desc: 'Severe GPS jamming (>85% civil aircraft reporting degraded navigation integrity). Russian Baltic Fleet EW exercises.', severity: 'critical', intensity: 92, source: 'GPSJam/ADS-B NIC' },
    { lat: 34.55, lng: 33.15, title: 'Eastern Mediterranean / Cyprus GPS Spoofing Hub', desc: 'Systematic GPS spoofing causing civilian aircraft and marine vessels to display false positions near Beirut International Airport.', severity: 'critical', intensity: 88, source: 'GPSJam/ICAO' },
    { lat: 44.60, lng: 33.52, title: 'Crimea / Sevastopol Electronic Warfare Corridor', desc: 'High-power Russian EW systems active across the northern Black Sea disrupting maritime AIS and aerial drone navigation.', severity: 'high', intensity: 78, source: 'OSINT EW Monitor' },
    { lat: 26.35, lng: 56.12, title: 'Strait of Hormuz GNSS Spoofing Sector', desc: 'Localized GPS spoofing events aimed at drawing commercial tankers into foreign territorial waters.', severity: 'high', intensity: 74, source: 'UKMTO/AIS Monitor' },
    { lat: 37.85, lng: 126.40, title: 'Korean DMZ / Incheon Approach GPS Jamming', desc: 'Intermittent cross-border GPS jamming signals originating from North Korean military sectors in Kaesong and Haeju.', severity: 'medium', intensity: 65, source: 'ROK MND' },
  ],

  darkfleet: [
    { lat: 45.15, lng: 36.62, name: 'Kerch Strait Shadow Lightering Area', mmsi: 'DF-KERCH-01', desc: 'Dark fleet ship-to-ship (STS) crude oil transshipment hub. Multiple tankers operating with AIS disabled or spoofed flag records.', severity: 'critical', flag: 'Gabon / Reflagged', speed: 1.2 },
    { lat: 25.30, lng: 56.75, name: 'Gulf of Oman Offshore STS Transshipment', mmsi: 'DF-OMAN-02', desc: 'Unsanctioned crude transfer between Iranian VLCCs and foreign-flagged shadow tankers outside port monitoring limits.', severity: 'high', flag: 'Cook Islands', speed: 0.8 },
    { lat: 36.50, lng: 22.55, name: 'Laconia Bay STS Transshipment Anchorage', mmsi: 'DF-LACONIA-03', desc: 'Regular ship-to-ship transshipment of Russian Urals crude in international waters off the Greek Peloponnese coast.', severity: 'high', flag: 'Panama', speed: 1.5 },
    { lat: 1.35,  lng: 104.45, name: 'Singapore OPL Dark Blending Zone', mmsi: 'DF-SGOPL-04', desc: 'Offshore blending and re-documentation of sanctioned heavy crude oil cargoes.', severity: 'medium', flag: 'Liberia', speed: 2.1 },
  ],

  bgpAnomalies: [
    { lat: 15.50, lng: 32.55, country: 'Sudan', title: 'Sudan Nationwide Connectivity Collapse', desc: 'Over 85% drops in routing visibility following destruction of Khartoum main telecommunications switching centers.', severity: 'critical', dropPercent: 88, source: 'Cloudflare Radar / IODA' },
    { lat: 35.68, lng: 51.38, country: 'Iran', title: 'Iran Digital Curfew & Mobile Throttling', desc: 'Targeted mobile internet blackouts across Kurdistan and Sistan-Baluchestan provinces during public demonstrations.', severity: 'high', dropPercent: 62, source: 'IODA Georgia Tech' },
    { lat: 21.91, lng: 95.95, country: 'Myanmar', title: 'Myanmar Military Telecom Shutdown', desc: 'Coordinated fiber optic cuts and cellular tower power shutdowns in Sagaing resistance sectors.', severity: 'high', dropPercent: 75, source: 'Cloudflare Radar' },
    { lat: 12.80, lng: 43.15, country: 'Red Sea', title: 'Red Sea Submarine Cable Disruption', desc: 'Physical cut to AAE-1 and Seacom international submarine fiber cables in shallow waters near the Bab el-Mandeb.', severity: 'critical', dropPercent: 30, source: 'Submarine Cable Telecoms' },
  ],

  sarRadar: [
    { lat: 45.30, lng: 36.51, target: 'Crimean Bridge Defenses', title: 'Copernicus Sentinel-1 SAR: Crimean Bridge Counter-Drone Barriers', desc: 'Synthetic Aperture Radar (SAR) detection of newly deployed boom barriers, barge chains, and smoke generator barges flanking the bridge.', severity: 'high', platform: 'Sentinel-1 C-SAR' },
    { lat: 45.78, lng: 47.53, target: 'Olya Port, Caspian Sea', title: 'Sentinel-1 SAR: Iran-Russia Caspian Weapons Transfer Node', desc: 'All-weather SAR radar monitoring of cargo vessels berthed at Olya Port suspected of transporting ballistic missile and drone crates from Amirabad, Iran.', severity: 'high', platform: 'Sentinel-1 C-SAR' },
    { lat: 34.90, lng: 35.88, target: 'Tartus Naval Base, Syria', title: 'Sentinel-1 SAR: Russian Submarine & Frigate Berth Changes', desc: 'Radar penetration through Mediterranean cloud cover revealing frigate and submarine movements at Russian naval support facilities.', severity: 'medium', platform: 'Sentinel-1 C-SAR' },
  ],

  summary: {
    total: 125,
    fetchedAt: new Date().toISOString(),
  }
}

