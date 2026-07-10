// api/firms.js — FIRMS thermal anomaly data stub
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  return res.json({ success: true, source: 'firms', data: [] })
}
