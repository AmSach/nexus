/**
 * ontologyData.js
 * Typed Semantic Ontology Objects for NEXUS Operational Intelligence
 * Defines physical vessels, facilities, chokepoints, corporate UBO networks, and critical supply chain BOM nodes.
 */

export const CHOKEPOINTS_ONTOLOGY = [
  {
    id: 'bab_el_mandeb',
    name: 'Bab el-Mandeb Strait',
    region: 'Red Sea / Gulf of Aden',
    coordinates: [12.583, 43.333],
    baselineDailyTransits: 52,
    currentTransitReductionPct: 67,
    divertedRoute: 'Cape of Good Hope (+3,300 nm / +10-14 days)',
    fuelCostPerDivertedVoyageUSD: 245000,
    criticalCommodities: ['Brent Crude', 'Murban Crude', 'Qatargas LNG', 'European Containerized Freight'],
    threatLevel: 'CRITICAL',
    controllingActors: ['Houthi Movement / Ansar Allah', 'US NAVCENT (CTF 153)', 'EU Operation Aspides']
  },
  {
    id: 'strait_of_hormuz',
    name: 'Strait of Hormuz',
    region: 'Persian Gulf / Gulf of Oman',
    coordinates: [26.566, 56.250],
    baselineDailyTransits: 84,
    currentTransitReductionPct: 0,
    divertedRoute: 'None (East-West Pipeline capacity capped at 5.0 Mbpd vs 21 Mbpd transit)',
    fuelCostPerDivertedVoyageUSD: 0,
    criticalCommodities: ['Dubai / Oman Crude', 'Arab Light', 'Qatari LNG (77 MTPA)', 'Naphtha'],
    threatLevel: 'ELEVATED',
    controllingActors: ['IRGC Navy', 'US 5th Fleet', 'Royal Navy (HMS Duncan)']
  },
  {
    id: 'suez_canal',
    name: 'Suez Canal',
    region: 'Egypt / Mediterranean',
    coordinates: [30.705, 32.344],
    baselineDailyTransits: 68,
    currentTransitReductionPct: 62,
    divertedRoute: 'Cape of Good Hope',
    fuelCostPerDivertedVoyageUSD: 310000,
    criticalCommodities: ['Container Freight', 'Refined Petroleum Products', 'Fertilizer'],
    threatLevel: 'HIGH',
    controllingActors: ['Suez Canal Authority (SCA)', 'Egyptian Armed Forces']
  },
  {
    id: 'malacca_strait',
    name: 'Strait of Malacca',
    region: 'Southeast Asia',
    coordinates: [2.500, 101.500],
    baselineDailyTransits: 220,
    currentTransitReductionPct: 0,
    divertedRoute: 'Lombok / Sunda Strait (+3.5 days)',
    fuelCostPerDivertedVoyageUSD: 85000,
    criticalCommodities: ['Middle East Crude to China/Japan/Korea', 'LNG', 'Iron Ore'],
    threatLevel: 'LOW',
    controllingActors: ['Singapore Navy', 'Royal Malaysian Navy', 'Indonesian Navy']
  },
  {
    id: 'taiwan_strait',
    name: 'Taiwan Strait',
    region: 'East Asia',
    coordinates: [24.000, 119.500],
    baselineDailyTransits: 145,
    currentTransitReductionPct: 5,
    divertedRoute: 'East of Taiwan / Philippine Sea (+1.5 days)',
    fuelCostPerDivertedVoyageUSD: 45000,
    criticalCommodities: ['Semiconductors', 'Precision Optics', 'Containerized Electronics'],
    threatLevel: 'HIGH',
    controllingActors: ['PLA Eastern Theater Command', 'Taiwan ROC Navy', 'US 7th Fleet']
  }
]

export const CORPORATE_UBO_ONTOLOGY = [
  {
    id: 'ubo_al_bahr',
    name: 'Al-Bahr Maritime Holdings SA',
    jurisdiction: 'Marshall Islands',
    registrationNo: 'MI-99421-B',
    ultimateBeneficialOwner: 'Tariq Al-Muhandis (Designated SDN Tier-2 proxy)',
    sanctionsRiskScore: 92,
    sanctionsTags: ['OFAC-SDN-LINKED', 'SHADOW-FLEET-OPERATOR', 'STS-CRUDE-EVASION'],
    controllingFleetCount: 9,
    frontCompanies: ['Blue Horizon Tankers FZE (UAE)', 'Caspian Crest Shipping Ltd (Cyprus)'],
    bankIntermediaries: ['Al-Mashreq Trade House (Dubai)', 'Bank Mellat Correspondent']
  },
  {
    id: 'ubo_ocean_link',
    name: 'Ocean Link Maritime Logistics Ltd',
    jurisdiction: 'Liberia',
    registrationNo: 'LBR-5582-K',
    ultimateBeneficialOwner: 'Vitol / Trafigura JV (Commercial Legitimacy Confirmed)',
    sanctionsRiskScore: 8,
    sanctionsTags: ['COMPLIANT', 'WESTERN-P&I-INSURED', 'INSTITUTIONAL-CHARTER'],
    controllingFleetCount: 24,
    frontCompanies: [],
    bankIntermediaries: ['JPMorgan Chase NY', 'BNP Paribas Geneva']
  },
  {
    id: 'ubo_red_star',
    name: 'Red Star Navigation Co Ltd',
    jurisdiction: 'Hong Kong / Dalian',
    registrationNo: 'HK-3882910',
    ultimateBeneficialOwner: 'China COSCO Shipping Corp (State-Owned)',
    sanctionsRiskScore: 24,
    sanctionsTags: ['SOE-AFFILIATED', 'NON-SANCTIONED-CARRIER', 'CHINESE-FLAG-PROTECTION'],
    controllingFleetCount: 42,
    frontCompanies: ['COSCO Bulk Holdings (BVI)'],
    bankIntermediaries: ['Bank of China (Hong Kong)', 'ICBC']
  },
  {
    id: 'ubo_nordic_crude',
    name: 'Nordic Crude Transport KS',
    jurisdiction: 'Norway / Bermuda',
    registrationNo: 'BM-20491',
    ultimateBeneficialOwner: 'John Fredriksen / Frontline Ltd',
    sanctionsRiskScore: 4,
    sanctionsTags: ['PUBLICLY-LISTED-NYSE', 'GARD-P&I-CLUB', 'CLEAN-TANKER-EXPONENT'],
    controllingFleetCount: 36,
    frontCompanies: [],
    bankIntermediaries: ['DNB Bank ASA', 'Nordea Bank Abp']
  }
]

export const VESSELS_ONTOLOGY = [
  {
    id: 'ves_front_altair',
    name: 'Front Altair II',
    imo: '9748231',
    mmsi: '538006129',
    type: 'VLCC Crude Tanker',
    dwt: 299990,
    draftMeters: 20.8,
    flag: 'Marshall Islands',
    speedKnots: 13.4,
    heading: 142,
    lat: 13.125,
    lng: 43.110,
    chokepointId: 'bab_el_mandeb',
    destination: 'Rotterdam (NL)',
    eta: '2026-10-04T12:00:00Z',
    status: 'CORRIDOR_DEVIATION', // 'NORMAL' | 'AIS_DARK' | 'CORRIDOR_DEVIATION' | 'DIVERTED_CAPE' | 'ESCORTED'
    riskScore: 78,
    uboId: 'ubo_nordic_crude',
    piClub: 'Gard P&I Club (Norway)',
    cargoManifest: {
      type: 'Arab Light Crude',
      volumeBarrels: 2000000,
      charterer: 'TotalEnergies Trading SA',
      cargoValueUSD: 168000000,
      htsCode: '2709.00.00'
    },
    telemetryHistory: [
      { timestamp: '06:00Z', lat: 13.850, lng: 42.750, speed: 14.1, alert: null },
      { timestamp: '08:30Z', lat: 13.410, lng: 42.980, speed: 13.8, alert: 'Approaching High Threat Zone' },
      { timestamp: '11:15Z', lat: 13.125, lng: 43.110, speed: 13.4, alert: 'Deviating towards Western Traffic Separation Scheme' }
    ]
  },
  {
    id: 'ves_msc_clara',
    name: 'MSC Clara Regina',
    imo: '9839442',
    mmsi: '356912000',
    type: 'Ultra Large Container Ship (ULCS)',
    dwt: 228000,
    draftMeters: 16.2,
    flag: 'Panama',
    speedKnots: 18.2,
    heading: 215,
    lat: -34.200,
    lng: 18.600,
    chokepointId: 'bab_el_mandeb',
    destination: 'Hamburg (DE)',
    eta: '2026-10-12T06:00:00Z',
    status: 'DIVERTED_CAPE',
    riskScore: 18,
    uboId: 'ubo_ocean_link',
    piClub: 'Standard Club (UK)',
    cargoManifest: {
      type: 'Automotive Wire Harnesses & Tier-1 Powertrain ECUs',
      volumeContainersTEU: 19800,
      charterer: 'MSC Mediterranean Shipping Co',
      cargoValueUSD: 412000000,
      htsCode: '8544.30.00'
    },
    telemetryHistory: [
      { timestamp: '3 Days Ago', lat: 4.200, lng: 48.100, speed: 19.5, alert: 'Rerouted south of Socotra by fleet operations' },
      { timestamp: '1 Day Ago', lat: -22.100, lng: 38.400, speed: 18.8, alert: 'Transiting Mozambique Channel' },
      { timestamp: 'Current', lat: -34.200, lng: 18.600, speed: 18.2, alert: 'Rounding Cape of Good Hope (+12 days elapsed)' }
    ]
  },
  {
    id: 'ves_al_yarmouk',
    name: 'Caspian Horizon (ex-Sea Star)',
    imo: '9283718',
    mmsi: '677042000',
    type: 'Aframax Crude Tanker',
    dwt: 112000,
    draftMeters: 14.5,
    flag: 'Gabon',
    speedKnots: 8.2,
    heading: 310,
    lat: 12.210,
    lng: 44.050,
    chokepointId: 'bab_el_mandeb',
    destination: 'Baniyas (Syria) / Unreported',
    eta: '2026-09-30T18:00:00Z',
    status: 'AIS_DARK',
    riskScore: 94,
    uboId: 'ubo_al_bahr',
    piClub: 'Ingosstrakh (Russian Replacement Coverage)',
    cargoManifest: {
      type: 'Sanctioned Iranian Heavy Crude',
      volumeBarrels: 730000,
      charterer: 'Naftiran Intertrade Co (NICO)',
      cargoValueUSD: 51100000,
      htsCode: '2709.00.00'
    },
    telemetryHistory: [
      { timestamp: '02:00Z', lat: 11.900, lng: 45.200, speed: 11.2, alert: 'Transponder intermittent' },
      { timestamp: '04:12Z', lat: 12.050, lng: 44.800, speed: 9.8, alert: 'AIS transponder signal extinguished (Dark Mode)' },
      { timestamp: '09:40Z', lat: 12.210, lng: 44.050, speed: 8.2, alert: 'Reacquired via Capella SAR satellite aperture radar' }
    ]
  },
  {
    id: 'ves_cosco_shanghai',
    name: 'COSCO Pride of Shanghai',
    imo: '9912048',
    mmsi: '413289000',
    type: 'Neopanamax Container Ship',
    dwt: 145000,
    draftMeters: 15.0,
    flag: 'China',
    speedKnots: 17.5,
    heading: 325,
    lat: 12.800,
    lng: 43.450,
    chokepointId: 'bab_el_mandeb',
    destination: 'Fos-sur-Mer (FR)',
    eta: '2026-10-02T10:00:00Z',
    status: 'NORMAL',
    riskScore: 32,
    uboId: 'ubo_red_star',
    piClub: 'China P&I Club',
    cargoManifest: {
      type: 'Industrial Photovoltaic Cells & Industrial Machinery',
      volumeContainersTEU: 13200,
      charterer: 'COSCO Shipping Lines',
      cargoValueUSD: 280000000,
      htsCode: '8541.43.00'
    },
    telemetryHistory: [
      { timestamp: '05:00Z', lat: 12.100, lng: 44.100, speed: 17.6, alert: 'Broadcasting VHF: All Chinese Crew / China Owned' },
      { timestamp: '09:00Z', lat: 12.500, lng: 43.700, speed: 17.5, alert: 'Navigating northbound transit corridor' },
      { timestamp: 'Current', lat: 12.800, lng: 43.450, speed: 17.5, alert: 'Passing Perim Island safely under safe-passage pact' }
    ]
  },
  {
    id: 'ves_maersk_denver',
    name: 'Maersk Denver Express',
    imo: '9348922',
    mmsi: '338291000',
    type: 'Post-Panamax Boxship',
    dwt: 115000,
    draftMeters: 14.2,
    flag: 'United States',
    speedKnots: 19.8,
    heading: 330,
    lat: 12.950,
    lng: 43.300,
    chokepointId: 'bab_el_mandeb',
    destination: 'Piraeus (GR)',
    eta: '2026-10-01T14:00:00Z',
    status: 'ESCORTED',
    riskScore: 68,
    uboId: 'ubo_ocean_link',
    piClub: 'American Steamship Owners Mutual',
    cargoManifest: {
      type: 'Semiconductors & Dual-Use Commercial Electronics',
      volumeContainersTEU: 8800,
      charterer: 'Maersk Line A/S',
      cargoValueUSD: 360000000,
      htsCode: '8542.31.00'
    },
    telemetryHistory: [
      { timestamp: '04:00Z', lat: 12.100, lng: 44.200, speed: 18.0, alert: 'Joined convoy with USS Carney (DDG-64)' },
      { timestamp: '07:30Z', lat: 12.600, lng: 43.600, speed: 19.5, alert: 'Close naval escort established (0.8 nm perimeter)' },
      { timestamp: 'Current', lat: 12.950, lng: 43.300, speed: 19.8, alert: 'Transiting Bab el-Mandeb narrows under active Aegis umbrella' }
    ]
  }
]

export const FACILITIES_ONTOLOGY = [
  {
    id: 'fac_ras_tanura',
    name: 'Ras Tanura Terminal & Refinery',
    type: 'Crude Export Terminal & Refinery',
    operator: 'Saudi Aramco',
    coordinates: [26.640, 50.160],
    chokepointId: 'strait_of_hormuz',
    capacityThroughput: '6.5 Million bpd export capacity',
    strategicBufferDays: 14,
    vulnerabilityIndex: 68,
    threatExposure: 'Hormuz closure would strand 5.2M bpd sea export (East-West Petroline pipeline to Yanbu absorbs only 1.8M bpd delta)',
    downstreamSupplyChain: ['Rotterdam Refineries', 'Jamnagar', 'Ulsan Petrochemical']
  },
  {
    id: 'fac_tsmc_fab18',
    name: 'TSMC Fab 18 (GigaFab)',
    type: 'Advanced 3nm / 5nm Foundry',
    operator: 'Taiwan Semiconductor Manufacturing Co',
    coordinates: [23.113, 120.278],
    chokepointId: 'taiwan_strait',
    capacityThroughput: '140,000 300mm wafer starts/month',
    strategicBufferDays: 21,
    vulnerabilityIndex: 86,
    threatExposure: 'Strait blockade halts neon precursor imports from Ukraine/China and halts outbound air/sea freight to global assembly fabs',
    downstreamSupplyChain: ['Apple Cupertino', 'NVIDIA Santa Clara', 'Tesla Austin', 'Qualcomm San Diego']
  },
  {
    id: 'fac_tesla_berlin',
    name: 'Tesla Gigafactory Berlin-Brandenburg',
    type: 'Electric Vehicle Final Assembly Plant',
    operator: 'Tesla Inc',
    coordinates: [52.399, 13.791],
    chokepointId: 'bab_el_mandeb',
    capacityThroughput: '375,000 Model Y vehicles/year',
    strategicBufferDays: 12,
    vulnerabilityIndex: 91,
    threatExposure: 'JIT manufacturing model relies on maritime shipments of battery cathode cells from Ningbo and wire harnesses from Malaysia transiting Red Sea',
    downstreamSupplyChain: ['European Dealership Delivery Network']
  },
  {
    id: 'fac_basf_ludwigshafen',
    name: 'BASF Ludwigshafen Verbund Site',
    type: 'Chemical & Fertilizer Synthesis Complex',
    operator: 'BASF SE',
    coordinates: [49.497, 8.432],
    chokepointId: 'suez_canal',
    capacityThroughput: 'Largest integrated chemical complex in world (10 km²)',
    strategicBufferDays: 18,
    vulnerabilityIndex: 82,
    threatExposure: 'Dependent on imported LNG feedstocks and phosphate rock precursors transiting Suez Canal and Mediterranean',
    downstreamSupplyChain: ['European Agricultural Fertilizer', 'Automotive Polyurethanes', 'Pharmaceutical Precursors']
  }
]

export const SUPPLY_CHAIN_BOM_NODES = [
  {
    id: 'bom_wire_harness_model_y',
    componentName: 'Main Body Wiring Harness (Model Y)',
    partNumber: '1082340-00-J',
    htsCode: '8544.30.00',
    primaryOrigin: 'Kedah, Malaysia / Haiphong, Vietnam',
    criticalChokepoint: 'bab_el_mandeb',
    transitMode: 'Ultra Large Container Ship (ULCS via Red Sea/Suez)',
    standardTransitDays: 24,
    divertedCapeTransitDays: 37,
    normalSafetyBufferDays: 12,
    consumingFacilityId: 'fac_tesla_berlin',
    dailyPlantDowntimeCostUSD: 18500000,
    emergencyAirCharterCostUSD: 820000,
    airCharterLeadTimeDays: 3,
    roiOfAirCharter: '22.5x cost-benefit vs plant shutdown'
  },
  {
    id: 'bom_3nm_wafer_gpu',
    componentName: '3nm Monolithic Processor Die (Blackwell/B200)',
    partNumber: 'NV-B200-SXM6',
    htsCode: '8542.31.00',
    primaryOrigin: 'Tainan Science Park, Taiwan',
    criticalChokepoint: 'taiwan_strait',
    transitMode: 'Dedicated Air-Cargo Transits (Boeing 777F)',
    standardTransitDays: 3,
    divertedCapeTransitDays: 7,
    normalSafetyBufferDays: 15,
    consumingFacilityId: 'fac_tsmc_fab18',
    dailyPlantDowntimeCostUSD: 45000000,
    emergencyAirCharterCostUSD: 1200000,
    airCharterLeadTimeDays: 2,
    roiOfAirCharter: '37.5x cost-benefit'
  },
  {
    id: 'bom_heavy_arab_light',
    componentName: 'Arab Light Seaborne Crude Feedstock',
    partNumber: 'CRUDE-ARAB-LT-01',
    htsCode: '2709.00.00',
    primaryOrigin: 'Ras Tanura, Saudi Arabia',
    criticalChokepoint: 'strait_of_hormuz',
    transitMode: 'VLCC Supertanker',
    standardTransitDays: 28,
    divertedCapeTransitDays: 42,
    normalSafetyBufferDays: 20,
    consumingFacilityId: 'fac_ras_tanura',
    dailyPlantDowntimeCostUSD: 12000000,
    emergencyAirCharterCostUSD: 0, // Impossible for bulk liquids
    airCharterLeadTimeDays: null,
    roiOfAirCharter: 'N/A - pipeline or strategic reserve draw required'
  }
]
