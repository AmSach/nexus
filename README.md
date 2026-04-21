# NEXUS Intelligence Platform v4

Real-time global OSINT platform — live news, conflict zone monitoring, geopolitical prediction markets, and ACPL/VOX forecasting engines.

## Architecture

- **Frontend**: React 18 + Vite + Tailwind CSS → Deploy to Vercel or any static host
- **Backend API**: Python FastAPI → Deploy to any server (port 8000)
- **API Proxy for Vercel**: Add to `vercel.json` rewrites to point `/api/*` to your backend URL

## Quick Start

```bash
git clone https://github.com/AmanSachan1/nexus-intel
cd nexus-intel
npm install
npm run dev      # Frontend on :5173
```

## Backend (Python API)

```bash
cd server
pip install fastapi uvicorn aiohttp duckdb
python server.py   # API on :8000
```

## Deploy to Vercel (Frontend Only)

Add `vercel.json` rewrites so API calls proxy to your backend:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://YOUR_BACKEND_URL/api/$1" }
  ]
}
```

Or set `VITE_API_BASE=https://YOUR_BACKEND_URL` in Vercel env vars.

## API Keys (free tier)

Set these in your backend server or Vercel environment variables:

| Key | Source | Purpose |
|-----|--------|---------|
| `GROQ_API_KEY` | console.groq.com | LLM briefings |
| `NEWSAPI_KEY` | newsapi.org | News aggregation |
| `GNEWS_KEY` | gnews.io | Alternative news |
| `ALPHAVANTAGE_KEY` | alphavantage.co | Market data |
| `NEWSDATA_KEY` | newsdata.io | News search |

## Features

- Live News Feed (RSS + GDELT + NewsAPI + GNews)
- 15-Zone Conflict Zone Monitoring
- ACPL Engine (Alert Confusion Probability)  
- VOX Geopolitical Prediction Markets
- Markets Panel (Equities, Crypto, FX, Commodities)
- Threat Intelligence (CVEs, KEV, OTX)
- Telegram/OSINT Signal Aggregation
