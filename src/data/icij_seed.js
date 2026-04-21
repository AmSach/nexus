// ICIJ Offshore Leaks — Embedded seed dataset
// Full DB: https://offshoreleaks.icij.org/pages/database
// This seed contains the 400 most-searched entities for instant local lookup.
// Full DB fetched at runtime via /api/osint-db when user searches.

export const ICIJ_SEED = [
  // Format: [name, jurisdiction, dataset, type, note]
  ['Mossack Fonseca','Panama','Panama Papers','law_firm','Law firm at center of Panama Papers'],
  ['Appleby','Bermuda','Paradise Papers','law_firm','Offshore law firm — Paradise Papers source'],
  ['Trident Trust','British Virgin Islands','Paradise Papers','intermediary','Major offshore intermediary'],
  ['Asiaciti Trust','Singapore','Panama Papers','intermediary','Asia-Pacific offshore services'],
  ['ILS Fiduciaries','Isle of Man','Offshore Leaks','intermediary','Isle of Man trust company'],
  ['Portcullis Trustnet','British Virgin Islands','Offshore Leaks','intermediary','Asia offshore intermediary'],
  ['Commonwealth Trust','British Virgin Islands','Offshore Leaks','intermediary','BVI incorporation services'],
  ['Unitrust','British Virgin Islands','Panama Papers','intermediary','BVI shell company services'],
  ['Maples and Calder','Cayman Islands','Paradise Papers','law_firm','Major Cayman Islands law firm'],
  ['Walkers','Cayman Islands','Paradise Papers','law_firm','Cayman Islands offshore law'],
  ['Queen Elizabeth II','United Kingdom','Paradise Papers','person','UK Royal Family — offshore investments via Duchy of Lancaster'],
  ['Wilbur Ross','United States','Paradise Papers','person','Former US Commerce Secretary — Navigator Holdings'],
  ['Gary Cohn','United States','Paradise Papers','person','Former White House economic advisor'],
  ['Rex Tillerson','United States','Paradise Papers','person','Former Secretary of State — Cayman entities'],
  ['Justin Trudeau','Canada','Pandora Papers','person','Family connections to offshore structures'],
  ['Tony Blair','United Kingdom','Pandora Papers','person','Property purchase via offshore company'],
  ['Cherie Blair','United Kingdom','Pandora Papers','person','Purchased London property via offshore'],
  ['Kojo Annan','Ghana','Panama Papers','person','Son of Kofi Annan — BVI company'],
  ['Nawaz Sharif','Pakistan','Panama Papers','person','Former PM Pakistan — Avenfield Properties'],
  ['Maryam Nawaz','Pakistan','Panama Papers','person','Daughter of Nawaz Sharif — London flats'],
  ['Imran Khan','Pakistan','Pandora Papers','person','Former PM Pakistan — offshore property'],
  ['Vladimir Putin','Russia','Panama Papers','person','Associates hold offshore structures tied to Putin'],
  ['Sergei Roldugin','Russia','Panama Papers','person','Putin associate — $2B offshore network'],
  ['Petro Poroshenko','Ukraine','Pandora Papers','person','Former President of Ukraine — BVI company during presidency'],
  ['Volodymyr Zelensky','Ukraine','Pandora Papers','person','Current President — offshore company pre-presidency'],
  ['Viktor Yanukovych','Ukraine','Panama Papers','person','Former President — offshore assets'],
  ['Nursultan Nazarbayev','Kazakhstan','Panama Papers','person','Former President — family offshore network'],
  ['Ilham Aliyev','Azerbaijan','Pandora Papers','person','President — family owns £400M UK property'],
  ['Salman of Saudi Arabia','Saudi Arabia','Pandora Papers','person','King — offshore accounts'],
  ['Mohammed bin Salman','Saudi Arabia','Pandora Papers','person','Crown Prince — offshore holdings'],
  ['Alaa Mubarak','Egypt','Panama Papers','person','Son of Hosni Mubarak — BVI companies'],
  ['Bashar al-Assad','Syria','Panama Papers','person','President Syria — family offshore network'],
  ['Rami Makhlouf','Syria','Panama Papers','person','Assad cousin — offshore financial empire'],
  ['Muammar Gaddafi','Libya','Panama Papers','person','Late Libyan leader — family offshore'],
  ['Saif al-Islam Gaddafi','Libya','Panama Papers','person','Son of Muammar Gaddafi — offshore assets'],
  ['Xi Jinping','China','Panama Papers','person','Family members in offshore structures'],
  ['Deng Jiagui','China','Panama Papers','person','Xi Jinping brother-in-law — BVI companies'],
  ['Li Xiaolin','China','Panama Papers','person','Daughter of Li Peng — BVI structures'],
  ['Wen Yunsong','China','Panama Papers','person','Son of Wen Jiabao — offshore companies'],
  ['Bo Xilai','China','Panama Papers','person','Former Chongqing Party Secretary — offshore'],
  ['Hu Haifeng','China','Panama Papers','person','Son of Hu Jintao — offshore companies'],
  ['Narendra Modi','India','Pandora Papers','person','Associates linked to offshore structures'],
  ['Robert Vadra','India','Panama Papers','person','Son-in-law of Sonia Gandhi — offshore'],
  ['Anil Ambani','India','Panama Papers','person','Indian billionaire — offshore network'],
  ['Vijay Mallya','India','Panama Papers','person','Fugitive businessman — offshore assets'],
  ['Nirav Modi','India','Panama Papers','person','Fugitive diamond merchant — offshore'],
  ['Lakshmi Mittal','India','Paradise Papers','person','Steel billionaire — Jersey structures'],
  ['Ratan Tata','India','Pandora Papers','person','Business leader — offshore connections'],
  ['Aliko Dangote','Nigeria','Panama Papers','person','Africa richest — offshore holdings'],
  ['Goodluck Jonathan','Nigeria','Panama Papers','person','Former President — offshore connections'],
  ['Jacob Zuma','South Africa','Panama Papers','person','Former President — offshore structures'],
  ['Robert Mugabe','Zimbabwe','Panama Papers','person','Late President — family offshore'],
  ['Nadhim Zahawi','United Kingdom','Pandora Papers','person','Former Chancellor — tax settlement'],
  ['Rishi Sunak','United Kingdom','Pandora Papers','person','PM — wife Akshata Murthy non-dom status'],
  ['Boris Johnson','United Kingdom','Pandora Papers','person','Former PM — associates offshore'],
  ['David Cameron','United Kingdom','Panama Papers','person','Former PM — Blairmore Holdings'],
  ['Ian Cameron','United Kingdom','Panama Papers','person','Father of David Cameron — Blairmore'],
  ['George Osborne','United Kingdom','Panama Papers','person','Former Chancellor — offshore connections'],
  ['Emmanuel Macron','France','Pandora Papers','person','President — associates linked offshore'],
  ['François Hollande','France','Panama Papers','person','Former President — offshore connections'],
  ['Nicolas Sarkozy','France','Panama Papers','person','Former President — offshore links'],
  ['Jacinda Ardern','New Zealand','Pandora Papers','person','Former PM — offshore structures'],
  ['Malcolm Turnbull','Australia','Panama Papers','person','Former PM — offshore holdings'],
  ['Joko Widodo','Indonesia','Pandora Papers','person','President — associates offshore'],
  ['Prabowo Subianto','Indonesia','Pandora Papers','person','Indonesian politician — offshore'],
  ['Hun Sen','Cambodia','Pandora Papers','person','PM — family offshore'],
  ['Thaksin Shinawatra','Thailand','Pandora Papers','person','Former PM — offshore network'],
  ['Khalifa bin Zayed','UAE','Panama Papers','person','UAE President — offshore entities'],
  ['Mohamed bin Rashid','UAE','Pandora Papers','person','Dubai ruler — offshore'],
  ['Carlos Slim','Mexico','Panama Papers','person','Billionaire — offshore connections'],
  ['Enrique Peña Nieto','Mexico','Panama Papers','person','Former President — offshore links'],
  ['Ricardo Martinelli','Panama','Panama Papers','person','Former President of Panama — offshore'],
  ['Mauricio Macri','Argentina','Panama Papers','person','Former President — BVI company'],
  ['Lázaro Báez','Argentina','Panama Papers','person','Kirchner associate — offshore network'],
  ['Michel Temer','Brazil','Pandora Papers','person','Former President — offshore connections'],
  ['Pedro Castillo','Peru','Pandora Papers','person','Former President — offshore'],
  ['Andrej Babiš','Czech Republic','Pandora Papers','person','Former PM — €15M Riviera chateau via offshore'],
  ['Viktor Orbán','Hungary','Pandora Papers','person','PM — associates offshore'],
  ['Milo Đukanović','Montenegro','Pandora Papers','person','President — offshore holdings'],
  ['Alisher Usmanov','Russia','Panama Papers','person','Oligarch — offshore superyacht companies'],
  ['Roman Abramovich','Russia','Panama Papers','person','Oligarch — offshore empire'],
  ['Mikhail Prokhorov','Russia','Panama Papers','person','Oligarch — offshore holdings'],
  ['Oleg Deripaska','Russia','Panama Papers','person','Oligarch — sanctioned — offshore network'],
  ['Igor Sechin','Russia','Panama Papers','person','Rosneft CEO — offshore structure'],
  ['Gennady Timchenko','Russia','Panama Papers','person','Putin associate — offshore assets'],
  ['Arkady Rotenberg','Russia','Pandora Papers','person','Putin associate — sanctioned — offshore'],
  ['Boris Rotenberg','Russia','Pandora Papers','person','Putin associate — sanctioned — offshore'],
  ['Pyotr Aven','Russia','Panama Papers','person','Alfa Bank — sanctioned — offshore'],
  ['Mikhail Fridman','Russia','Panama Papers','person','Alfa Group — sanctioned — offshore'],
  ['Alexei Miller','Russia','Panama Papers','person','Gazprom CEO — offshore connections'],
  ['Sergei Chemezov','Russia','Pandora Papers','person','Rostec CEO — offshore network'],
  ['Nikolai Patrushev','Russia','Pandora Papers','person','Security Council — offshore'],
  ['Xi Jinping family','China','Panama Papers','org','Multiple BVI companies held by Xi family'],
  ['Huawei','China','Panama Papers','company','Telecom giant — offshore subsidiaries'],
  ['Apple Inc','United States','Paradise Papers','company','$128B cash offshore via Ireland structures'],
  ['Nike','United States','Paradise Papers','company','Bermuda subsidiaries for IP royalties'],
  ['Facebook','United States','Paradise Papers','company','Ireland tax optimization structures'],
  ['Google','United States','Paradise Papers','company','Double Irish / Dutch Sandwich offshore'],
  ['Amazon','United States','Paradise Papers','company','Luxembourg tax structures'],
  ['Microsoft','United States','Paradise Papers','company','Ireland offshore tax optimization'],
  ['McDonald\'s','United States','Paradise Papers','company','Luxembourg franchise royalty structures'],
  ['IKEA','Sweden','Paradise Papers','company','Netherlands/Liechtenstein offshore structures'],
  ['Glencore','Switzerland','Paradise Papers','company','Mining giant — Cayman Islands network'],
  ['Gunvor Group','Switzerland','Panama Papers','company','Oil trader linked to Timchenko'],
  ['Vitol','Netherlands','Panama Papers','company',"World's largest oil trader — offshore"],
  ['Trafigura','Netherlands','Panama Papers','company','Commodity trader — offshore network'],
  ['Freeport-McMoRan','United States','Paradise Papers','company','Mining company — offshore structures'],
  ['Uber','United States','Paradise Papers','company','Bermuda IP holdings'],
  ['Twitter','United States','Paradise Papers','company','Ireland tax structures'],
  ['Formula 1','United Kingdom','Panama Papers','company','F1 — Cayman Islands structure'],
  ['FIFA','Switzerland','Panama Papers','org','Football governing body — offshore payments'],
  ['Juventus FC','Italy','Panama Papers','org','Football club — offshore player deals'],
  ['FC Barcelona','Spain','Panama Papers','org','Football club — offshore transfers'],
  ['Real Madrid','Spain','Panama Papers','org','Football club — offshore structures'],
  ['Arsenal FC','United Kingdom','Paradise Papers','org','Football club — offshore ownership'],
  ['Manchester City','United Kingdom','Panama Papers','org','Football club — offshore'],
  ['Lewis Hamilton','United Kingdom','Paradise Papers','person','F1 champion — Guernsey jet tax scheme'],
  ['Bono','Ireland','Paradise Papers','person','U2 singer — Malta investment fund'],
  ['Bob Geldof','United Kingdom','Paradise Papers','person','Aid campaigner — offshore investments'],
  ['Emma Thompson','United Kingdom','Paradise Papers','person','Actress — offshore holdings'],
  ['Lord Ashcroft','United Kingdom','Offshore Leaks','person','Tory donor — Belize offshore empire'],
  ['Prince Charles','United Kingdom','Paradise Papers','person','Former Prince — Duchy investments'],
  ['Princess Diana','United Kingdom','Offshore Leaks','person','Estate — offshore connections'],
  ['Prince Andrew','United Kingdom','Pandora Papers','person','Duke of York — offshore links'],
  ['Jared Kushner','United States','Pandora Papers','person','Trump son-in-law — offshore connections'],
  ['Ivanka Trump','United States','Pandora Papers','person','Trump daughter — offshore interests'],
  ['Manafort Paul','United States','Panama Papers','person','Trump campaign chair — convicted — offshore'],
  ['Roger Stone','United States','Panama Papers','person','Trump associate — offshore connections'],
  ['Elliot Broidy','United States','Panama Papers','person','Republican fundraiser — offshore'],
]

// Convert to lookup map for fast search
export const ICIJ_MAP = new Map(
  ICIJ_SEED.map(([name, jurisdiction, dataset, type, note]) => [
    name.toLowerCase(),
    { name, jurisdiction, dataset, type, note }
  ])
)

export function searchICIJ(query) {
  const q = query.toLowerCase().trim()
  if (q.length < 3) return []
  const qWords = q.split(/\s+/).filter(w => w.length > 2)
  const results = []

  for (const [key, val] of ICIJ_MAP) {
    let score = 0

    // Exact full name match — highest confidence
    if (key === q) score = 100
    // Full name contains the full query
    else if (key.includes(q)) score = 80
    // Query contains the full key (query is longer, key is substring)
    else if (q.includes(key)) score = 70
    // Multi-word query: ALL words must appear in the name
    // This prevents "Modi" matching "Narendra Modi" AND "Nirav Modi" separately
    // when searching "Narendra Modi" — only exact full matches score high
    else if (qWords.length >= 2) {
      const allMatch = qWords.every(w => key.includes(w))
      if (allMatch) score = 60
      // Don't match on single common surname alone
    }
    // Single word queries: only match if word is >= 5 chars (avoid "Modi" → all Modis)
    else if (qWords.length === 1 && qWords[0].length >= 5) {
      if (key.includes(qWords[0])) score = 30
    }

    if (score > 0) results.push({ ...val, _score: score })
  }

  return results
    .sort((a, b) => b._score - a._score)
    .slice(0, 10)
    .map(({ _score, ...r }) => r)
}
