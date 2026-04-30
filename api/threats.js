// api/threats.js — Threat intelligence stub
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600')
  return res.json({ success: true, source: 'threats', data: [] })
}
