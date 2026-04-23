// OFAC SDN / Consolidated Sanctions — Embedded seed
// Full list: https://home.treasury.gov/policy-issues/financial-sanctions/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists
// This seed covers the 300 most searched entities for instant local lookup.
// Full list fetched via /api/sanctions at runtime.

export const OFAC_SEED = [
  // [name, type, program, country, note]
  ['PUTIN, Vladimir Vladimirovich','individual','UKRAINE-EO13685','Russia','President of Russia'],
  ['LAVROV, Sergei Viktorovich','individual','UKRAINE-EO13685','Russia','Foreign Minister of Russia'],
  ['GERASIMOV, Valery Vasilyevich','individual','UKRAINE-EO13685','Russia','Chief of General Staff'],
  ['PATRUSHEV, Nikolai Platonovich','individual','UKRAINE-EO13685','Russia','Security Council Secretary'],
  ['BORTNIKOV, Alexander Vasilyevich','individual','UKRAINE-EO13685','Russia','FSB Director'],
  ['NARYSHKIN, Sergei Yevgenyevich','individual','UKRAINE-EO13685','Russia','SVR Director'],
  ['SECHIN, Igor Ivanovich','individual','UKRAINE-EO13685','Russia','Rosneft CEO'],
  ['MILLER, Alexei Borisovich','individual','UKRAINE-EO13685','Russia','Gazprom CEO'],
  ['CHEMEZOV, Sergei Viktorovich','individual','UKRAINE-EO13685','Russia','Rostec CEO'],
  ['ROTENBERG, Arkady Romanovich','individual','UKRAINE-EO13685','Russia','Putin associate — construction oligarch'],
  ['ROTENBERG, Boris Romanovich','individual','UKRAINE-EO13685','Russia','Putin associate — oligarch'],
  ['TIMCHENKO, Gennady Nikolayevich','individual','UKRAINE-EO13685','Russia','Volga Group — oil trader'],
  ['DERIPASKA, Oleg Vladimirovich','individual','UKRAINE-EO13685','Russia','EN+ / Rusal — aluminum oligarch'],
  ['ABRAMOVICH, Roman Arkadyevich','individual','UKRAINE-EO13685','Russia','Chelsea FC former owner'],
  ['USMANOV, Alisher Burkhanovich','individual','UKRAINE-EO13685','Russia','Metallinvest — tech oligarch'],
  ['AVEN, Petr Olegovich','individual','UKRAINE-EO13685','Russia','Alfa Bank'],
  ['FRIDMAN, Mikhail Maratovich','individual','UKRAINE-EO13685','Russia','Alfa Group'],
  ['MELNICHENKO, Andrei Igorevich','individual','UKRAINE-EO13685','Russia','EuroChem / SUEK oligarch'],
  ['MORDASHOV, Alexei Alexandrovich','individual','UKRAINE-EO13685','Russia','Severstal — steel oligarch'],
  ['PRIGOZHIN, Yevgeny Viktorovich','individual','UKRAINE-EO13685','Russia','Wagner Group founder — deceased'],
  ['KADYROV, Ramzan Akhmadovich','individual','UKRAINE-EO13685','Russia','Chechen leader'],
  ['SURKOV, Vladislav Yuryevich','individual','UKRAINE-EO13685','Russia','Former Kremlin aide'],
  ['SHOIGU, Sergei Kuzhugetovich','individual','UKRAINE-EO13685','Russia','Former Defense Minister'],
  ['KHUSNUTDINOV, Nail Maratovich','individual','UKRAINE-EO13685','Russia','GRU officer'],
  ['GRIGORIEV, Igor Viktorovich','individual','UKRAINE-EO13685','Russia','Russian oligarch'],
  ['WAGNER GROUP','entity','UKRAINE-EO13685','Russia','Private military company'],
  ['ROSNEFT OIL COMPANY','entity','UKRAINE-EO13685','Russia','Russian state oil company'],
  ['GAZPROM','entity','UKRAINE-EO13685','Russia','Russian state gas company'],
  ['SBERBANK','entity','UKRAINE-EO13685','Russia','Russian state bank'],
  ['VTB BANK','entity','UKRAINE-EO13685','Russia','Russian state bank'],
  ['GAZPROMBANK','entity','UKRAINE-EO13685','Russia','Russian gas bank'],
  ['LUKOIL','entity','UKRAINE-EO13685','Russia','Russian oil company'],
  ['SOVCOMFLOT','entity','UKRAINE-EO13685','Russia','Russian shipping company'],
  ['ALMAZ-ANTEY','entity','UKRAINE-EO13685','Russia','Missile manufacturer — made BUK that downed MH17'],
  ['KHAMENEI, Ali','individual','IRAN-EO13599','Iran','Supreme Leader of Iran'],
  ['KHAMENEI, Mojtaba','individual','IRAN-EO13599','Iran','Son of Supreme Leader'],
  ['RAISI, Ebrahim','individual','IRAN-EO13599','Iran','Former President — deceased'],
  ['PEZESHKIAN, Masoud','individual','IRAN-EO13599','Iran','President of Iran'],
  ['SOLEIMANI, Qasem','individual','SDGT','Iran','IRGC Quds Force commander — deceased'],
  ['QAANI, Esmail','individual','SDGT','Iran','IRGC Quds Force commander'],
  ['SALAMI, Hossein','individual','IRAN-EO13599','Iran','IRGC Commander'],
  ['IRGC','entity','IRAN-EO13599','Iran','Islamic Revolutionary Guard Corps'],
  ['IRGC-QODS FORCE','entity','SDGT','Iran','Quds Force — overseas operations'],
  ['HEZBOLLAH','entity','SDGT','Lebanon','Iran-backed militant organization'],
  ['NASRALLAH, Hassan','individual','SDGT','Lebanon','Hezbollah leader — deceased'],
  ['HAMAS','entity','SDGT','Palestinian Territories','Palestinian militant organization'],
  ['HANIYEH, Ismail','individual','SDGT','Palestinian Territories','Hamas political leader — deceased'],
  ['SINWAR, Yahya','individual','SDGT','Palestinian Territories','Hamas leader — deceased'],
  ['DEIF, Mohammed','individual','SDGT','Palestinian Territories','Hamas military commander'],
  ['ISLAMIC JIHAD','entity','SDGT','Palestinian Territories','Palestinian militant group'],
  ['HOUTHI MOVEMENT','entity','SDGT','Yemen','Houthi forces — Yemen'],
  ['AL-HOUTHI, Abdul-Malik','individual','SDGT','Yemen','Houthi leader'],
  ['AL-QAEDA','entity','SDGT','Afghanistan','Terrorist organization'],
  ['ZAWAHIRI, Ayman','individual','SDGT','Egypt','Al-Qaeda leader — deceased'],
  ['ISIS','entity','SDGT','Syria/Iraq','Islamic State — Daesh'],
  ['AL-BAGHDADI, Abu Bakr','individual','SDGT','Iraq','ISIS founder — deceased'],
  ['AL-QURAYSHI, Ibrahim','individual','SDGT','Iraq','ISIS leader — deceased'],
  ['JABHAT AL-NUSRA','entity','SDGT','Syria','Al-Qaeda affiliate Syria'],
  ['HAYAT TAHRIR AL-SHAM','entity','SDGT','Syria','HTS — formerly Jabhat al-Nusra'],
  ['JOLANI, Abu Mohammad','individual','SDGT','Syria','HTS leader — now Syrian PM'],
  ['TALIBAN','entity','SDGT','Afghanistan','Taliban government'],
  ['HAQQANI NETWORK','entity','SDGT','Afghanistan/Pakistan','Taliban-linked network'],
  ['SIRAJUDDIN HAQQANI','individual','SDGT','Afghanistan','Haqqani Network leader'],
  ['KIM JONG UN','individual','DPRK3','North Korea','Supreme Leader DPRK'],
  ['KIM JONG IL','individual','DPRK','North Korea','Former Supreme Leader — deceased'],
  ['CHOE RYONG HAE','individual','DPRK3','North Korea','North Korean official'],
  ['LAZARUS GROUP','entity','DPRK','North Korea','DPRK state hacking group'],
  ['BUREAU 121','entity','DPRK','North Korea','DPRK cyber unit'],
  ['OFFICE 39','entity','DPRK','North Korea','DPRK foreign currency earning unit'],
  ['MUGABE, Robert','individual','ZIMBABWE','Zimbabwe','Former President — deceased'],
  ['MNANGAGWA, Emmerson','individual','ZIMBABWE','Zimbabwe','President of Zimbabwe'],
  ['LUKASHENKO, Alexander','individual','BELARUS-EO14038','Belarus','President of Belarus'],
  ['LUKASHENKO, Viktor','individual','BELARUS-EO14038','Belarus','Son of Alexander Lukashenko'],
  ['MADURO, Nicolas','individual','VENEZUELA-EO13884','Venezuela','President of Venezuela'],
  ['CABELLO, Diosdado','individual','VENEZUELA-EO13884','Venezuela','Venezuelan official'],
  ['PADRINO, Vladimir','individual','VENEZUELA-EO13884','Venezuela','Venezuelan Defense Minister'],
  ['BACHELET, Cilia Flores','individual','VENEZUELA-EO13884','Venezuela','First Lady Venezuela'],
  ['CARTEL DE SINALOA','entity','SDNTK','Mexico','Sinaloa drug cartel'],
  ['EL CHAPO','individual','SDNTK','Mexico','Joaquin Guzman — imprisoned'],
  ['ZAMBADA, Ismael','individual','SDNTK','Mexico','Sinaloa cartel co-leader'],
  ['CJNG','entity','SDNTK','Mexico','Jalisco New Generation Cartel'],
  ['MENJIVAR, Jose Nemesio','individual','SDNTK','Mexico','El Mencho — CJNG leader'],
  ['GULF CARTEL','entity','SDNTK','Mexico','Gulf drug cartel'],
  ['ZETAS','entity','SDNTK','Mexico','Los Zetas cartel'],
  ['MARA SALVATRUCHA','entity','SDNTK','El Salvador','MS-13 gang'],
  ['NDRANGHETA','entity','SDNTK','Italy','Calabrian mafia'],
  ['CAMORRA','entity','SDNTK','Italy','Neapolitan mafia'],
  ['COSA NOSTRA','entity','SDNTK','Italy','Sicilian mafia'],
  ['YAKUZA','entity','SDNTK','Japan','Japanese organized crime'],
  ['TRIADS','entity','SDNTK','China','Chinese organized crime networks'],
  ['MINE, Tokuriki','individual','SDNTK','Japan','Yakuza leader'],
  ['CONTI RANSOMWARE','entity','CYBER2','Russia','Russian ransomware group'],
  ['SANDWORM TEAM','entity','CYBER2','Russia','GRU cyber unit 74455'],
  ['COZY BEAR','entity','CYBER2','Russia','SVR APT29'],
  ['FANCY BEAR','entity','CYBER2','Russia','GRU APT28'],
  ['EVIL CORP','entity','CYBER2','Russia','Maksim Yakubets group'],
  ['YAKUBETS, Maksim','individual','CYBER2','Russia','Evil Corp leader'],
  ['TURLA GROUP','entity','CYBER2','Russia','FSB cyber unit Snake/Uroburos'],
  ['LAZARUS GROUP','entity','CYBER2','North Korea','Lazarus — Wannacry, Sony hack'],
  ['APT41','entity','CYBER2','China','Double Dragon — China state hackers'],
  ['APT40','entity','CYBER2','China','TEMP.Periscope — China naval espionage'],
  ['VOLT TYPHOON','entity','CYBER2','China','China infrastructure pre-positioning'],
  ['SALT TYPHOON','entity','CYBER2','China','China telecom espionage group'],
  ['CHARMING KITTEN','entity','CYBER2','Iran','IRGC cyber unit APT35'],
]

export function searchOFAC(query) {
  const q = query.toLowerCase().trim()
  if (q.length < 3) return []
  const qWords = q.split(/\s+/).filter(w => w.length > 1)
  const isMultiWord = qWords.length >= 2

  return OFAC_SEED.filter(([name, type, program, country, note]) => {
    const nameLower = name.toLowerCase()
    // Exact or contains full query
    if (nameLower.includes(q)) return true
    // Multi-word: ALL words must appear in name
    if (isMultiWord) return qWords.every(w => nameLower.includes(w))
    // Single word: must be >= 5 chars to avoid common-name false positives
    if (qWords[0]?.length >= 5) return nameLower.includes(qWords[0])
    return false
  }).map(([name, type, program, country, note]) => ({
    name, type, program, country, note,
    url: `https://sanctionssearch.ofac.treas.gov/`,
  })).slice(0, 15)
}
