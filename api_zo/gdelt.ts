// api_zo/gdelt.js — Hono API route for zo.space
// Handles both passthrough (pre-built URL) and direct search modes
// GDELT sourcelang:english must be appended UNENCODED — handled here server-side

import type { Context } from "hono";

export default async (c: Context) => {
  const req = c.req;

  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  c.header("Cache-Control", "s-maxage=180, stale-while-revalidate=600");

  if (req.method === "OPTIONS") return c.body(null, 200);

  const get = async (url: string, ms = 18000) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NEXUS-GDELT/5.0)" },
      });
      clearTimeout(t);
      if (!r.ok) return null;
      return r;
    } catch {
      return null;
    }
  };

  // ── MODE 1: Search — GDELT full-text search with 12 angle variants ──
  const q = req.query("q") || "";
  const mode = req.query("mode") || "artlist";
  const maxr = req.query("maxrecords") || "250";
  const timespan = req.query("timespan") || "3months";
  const sort = req.query("sort") || "DateDesc";

  if (q) {
    // URLSearchParams encodes spaces as '+' — decodeURIComponent won't decode those
    // Must replace '+' → ' ' BEFORE decoding
    const query = decodeURIComponent(q.replace(/\+/g, " ")).trim();
    const words = query.split(/\s+/).filter((w: string) => w.length > 0);

    // Build all search angles — all parallel
    const variants = [
      { vq: query, n: 250, angle: "general" },
      words.length > 1 ? { vq: `"${query}"`, n: 100, angle: "exact" } : null,
      words.length > 1 ? { vq: words.join(" OR "), n: 100, angle: "broad" } : null,
      { vq: `${query} crime fraud corruption`, n: 50, angle: "crime" },
      { vq: `${query} court arrested charged convicted`, n: 50, angle: "legal" },
      { vq: `${query} sanction indicted investigation`, n: 50, angle: "sanctions" },
      { vq: `${query} offshore money laundering shell`, n: 40, angle: "financial" },
      { vq: `${query} associate partner ally network`, n: 40, angle: "network" },
      { vq: `${query} military weapons attack strike`, n: 40, angle: "military" },
      { vq: `${query} death dead killed died`, n: 30, angle: "death" },
      { vq: `${query} nuclear weapons missile biological`, n: 30, angle: "wmd" },
      { vq: `${query} hacked leak breach cyber attack`, n: 30, angle: "cyber" },
    ].filter(Boolean) as { vq: string; n: number; angle: string }[];

    const seen = new Set<string>();
    const articles: Record<string, unknown>[] = [];
    let timeline = null;

    // Build GDELT URL correctly — sourcelang:english appended WITHOUT encoding
    const buildUrl = (vq: string, n: number, m: string, ts: string, s: string) => {
      const enc = encodeURIComponent(vq);
      return `https://api.gdeltproject.org/api/v2/doc/doc?query=${enc}+sourcelang:english&mode=${m}&maxrecords=${n}&sort=${s}&timespan=${ts}&format=json`;
    };

    await Promise.allSettled([
      ...variants.map(({ vq, n, angle }) =>
        get(buildUrl(vq, n, mode, timespan, sort), 18000).then(async (r) => {
          if (!r) return;
          const d = await r.json().catch(() => null);
          (d?.articles || []).forEach((a: Record<string, unknown>) => {
            if (!a?.title) return;
            const k = ((a.url as string) || (a.title as string)).slice(0, 80);
            if (seen.has(k)) return;
            seen.add(k);
            articles.push({ ...a, _angle: angle });
          });
        }).catch(() => {})
      ),
      // Timeline volume
      get(buildUrl(query, 1, "timelinevol", timespan, sort), 15000).then(async (r) => {
        if (r) timeline = await r.json().catch(() => null);
      }).catch(() => {}),
      // Tone-sorted (controversy signal)
      get(buildUrl(query, 50, "artlist", timespan, "ToneAsc"), 15000).then(async (r) => {
        if (!r) return;
        const d = await r.json().catch(() => null);
        (d?.articles || []).forEach((a: Record<string, unknown>) => {
          if (!a?.title) return;
          const k = ((a.url as string) || (a.title as string)).slice(0, 80);
          if (seen.has(k)) return;
          seen.add(k);
          articles.push({ ...a, _angle: "negative_tone" });
        });
      }).catch(() => {}),
    ]);

    // If all variants timed out, try one simple fallback query
    if (articles.length === 0) {
      const fallbackR = await get(
        `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}+sourcelang:english&mode=artlist&maxrecords=100&sort=DateDesc&timespan=${timespan}&format=json`,
        14000
      );
      if (fallbackR) {
        const fd = await fallbackR.json().catch(() => null);
        (fd?.articles || []).forEach((a: Record<string, unknown>) => {
          if (!a?.title) return;
          const k = ((a.url as string) || (a.title as string)).slice(0, 80);
          if (seen.has(k)) return;
          seen.add(k);
          articles.push({ ...a, _angle: "fallback" });
        });
      }
    }

    return c.json({
      articles,
      timeline,
      count: articles.length,
      angles: [...new Set(articles.map((a) => a._angle as string))],
      fetchedAt: new Date().toISOString(),
    });
  }

  // ── MODE 2: Passthrough — proxy for pre-built GDELT URLs ──
  const passthrough = req.query("passthrough");
  if (passthrough) {
    try {
      const targetUrl = decodeURIComponent(passthrough.replace(/\+/g, " "));
      const r = await get(targetUrl, 20000);
      if (!r) return c.json({ error: "GDELT upstream unreachable" }, 502);
      const d = await r.json();
      return c.json(d);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  }

  return c.json({ error: "q or passthrough param required" }, 400);
};
