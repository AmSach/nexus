// api/ingest.js — Data ingest endpoint stub
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
  return res.json({ success: true, source: 'ingest', ingested: 0 })
}
