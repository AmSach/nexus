# NEXUS — Global Intelligence Platform v2.0

The analyst's one-stop intelligence OS. No backend. Deploys to Vercel in 60 seconds.

## Quick Deploy (Vercel)

```bash
git init
git add .
git commit -m "NEXUS v2.0"
gh repo create nexus-intel --public --push  # or push manually to GitHub
# Then: vercel.com → New Project → Import → Deploy
```

## Local Dev

```bash
npm install
npm run dev
```

## Features

| Module | Description |
|--------|-------------|
| **Live Feed** | 24+ RSS sources + NewsAPI + GNews. Auto-refresh every 90s. Severity classifier. Watchlist alerts. AI analysis per article. |
| **Intel Board** | SVG canvas. Drag nodes. Typed relationships. Multi-board support. Groq AI: full analysis, connection suggestions, timeline builder. |
| **Threat Map** | Accurate SVG world map. 15 live hotspots with pulse animations. Zoom/pan. Add to board directly. |
| **Markets** | Equities, Commodities, Crypto, FX. Economic calendar. Geopolitical-financial nexus notes. |
| **Saved** | Bookmark articles. Persist across sessions. |
| **Settings** | API key config. Watchlist manager. All stored in localStorage. |

## API Keys (all FREE tier)

| Key | Source |
|-----|--------|
| Groq | console.groq.com |
| NewsAPI | newsapi.org |
| GNews | gnews.io |
| Alpha Vantage | alphavantage.co |
| ExchangeRate | exchangerate-api.com |

Keys stored in browser localStorage only. Never leave your device.

## Tech Stack

React 18 · Vite · Zustand (persist) · Groq llama-3.3-70b · JetBrains Mono · Orbitron · Tailwind CSS
