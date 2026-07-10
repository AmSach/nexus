// api/hello.js — Test endpoint
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json({ ok: true, source: 'hello', time: new Date().toISOString() })
}
