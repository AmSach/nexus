// api/fred.js — FRED economic data stub
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600')
  return res.json({ success: true, source: 'fred', data: [] })
}
