// api/hello.js — Test endpoint
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json({ ok: true, source: 'hello', time: new Date().toISOString() })
}
