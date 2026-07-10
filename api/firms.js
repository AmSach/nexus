// api/firms.js — FIRMS thermal anomaly data stub
// Force fresh Vercel deploy to clear stale function cache
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  res.status(200).json({ success: true, source: 'firms', data: [] })
}
