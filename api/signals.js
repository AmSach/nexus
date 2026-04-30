// api/signals.js — Signal processing stub
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300')
  return res.json({ success: true, source: 'signals', data: [] })
}
