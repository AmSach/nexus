import { useState, useCallback } from 'react'
import { useStore } from '../store'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Model fallback chain — tries each in order until one succeeds
// Primary is highest quality; fallbacks activate on rate-limit (429) or model errors
const MODELS = [
  'llama-3.3-70b-versatile',        // Primary: best quality, 128K context
  'llama-3.1-70b-versatile',        // Fallback 1: stable 70B
  'llama-3.1-8b-instant',           // Fallback 2: fast, lower quality
  'mixtral-8x7b-32768',             // Fallback 3: Mixtral 32K context
  'gemma2-9b-it',                   // Fallback 4: Google Gemma
  'llama3-70b-8192',                // Fallback 5: Llama3 70B 8K
  'llama3-8b-8192',                 // Fallback 6: smallest, most available
]
const MODEL = MODELS[0]  // keep for backward compat

// 128K context window — send everything. 8192 max output tokens.
const SYS = `You are a senior intelligence analyst. Non-negotiable rules:
- Process EVERY signal provided. Missing a signal = incomplete analysis.
- Only use information explicitly in the signals. Never add external knowledge.
- Write structured intelligence products: dense, factual, scannable.
- Every claim: cite [Source] or mark (confirmed) / (estimated) / (inferred).
- No padding. No filler. Names, dates, numbers, locations over vague language.
- If a signal contradicts another: flag the contradiction explicitly.`

async function streamWithModel(key, model, sysOverride, userPrompt, onToken, maxTok) {
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sysOverride || SYS },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens:  maxTok,
      temperature: 0.1,
      stream:      true,
    }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    const msg = e.error?.message || `Groq ${r.status}`
    // 429 = rate limit, 404 = model not found, 503 = overloaded — all retryable
    if (r.status === 429 || r.status === 404 || r.status === 503 || r.status === 500) {
      throw new Error(`RETRY:${r.status}:${msg}`)
    }
    throw new Error(msg)
  }
  const reader = r.body.getReader()
  const dec    = new TextDecoder()
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of dec.decode(value).split('\n')) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
      try {
        const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || ''
        if (delta) { full += delta; onToken(full) }
      } catch {}
    }
  }
  return full
}

async function stream(key, sysOverride, userPrompt, onToken, maxTok = 4000) {
  let lastErr = null
  for (const model of MODELS) {
    try {
      const result = await streamWithModel(key, model, sysOverride, userPrompt, onToken, maxTok)
      if (model !== MODELS[0]) console.info(`[Groq] Used fallback model: ${model}`)
      return result
    } catch (e) {
      lastErr = e
      if (!e.message?.startsWith('RETRY:')) throw e  // non-retryable error
      // Wait briefly before trying next model (avoid hammering API)
      await new Promise(r => setTimeout(r, 800))
      onToken('')  // reset streaming output for next attempt
    }
  }
  throw lastErr || new Error('All Groq models failed')
}

// Build the full signal block — all signals, no truncation of count
function buildSignalBlock(nodes) {
  return nodes.map((n, i) =>
    `[${i + 1}] ${n.label}\n    └ ${n.detail || 'no detail'}`
  ).join('\n\n')
}

export function useGroq() {
  const { keys } = useStore()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const hasKey = !!(import.meta.env.VITE_GROQ_KEY || keys.groq)
  const resolvedKey = import.meta.env.VITE_GROQ_KEY || keys.groq || ''

  const ask = useCallback(async (sys, prompt, onToken, maxTok) => {
    if (!resolvedKey) { setError('Add Groq key in Settings.'); return null }
    setLoading(true); setError(null)
    try   { return await stream(resolvedKey, sys, prompt, onToken, maxTok) }
    catch (e) { setError(e.message); return null }
    finally   { setLoading(false) }
  }, [resolvedKey])

  // ── Article quick-read ────────────────────────────────────────────────────
  const briefArticle = useCallback((a, onToken) => ask(
    SYS,
    `Source: ${a.source}\nHeadline: "${a.title}"\n${a.summary ? 'Body: ' + a.summary.slice(0, 500) : ''}\n\n3 lines:\n1. What exactly happened — confirmed facts only, name all actors and locations\n2. Significance — one line, no fluff\n3. Watch for — one specific next indicator or trigger`,
    onToken, 300
  ), [ask])

  // ── ANALYZE ───────────────────────────────────────────────────────────────
  const analyzeBoard = useCallback((nodes, edges, onToken) => {
    if (!nodes.length) return ask(SYS, 'No signals provided.', onToken, 100)

    const total   = nodes.length
    const signals = buildSignalBlock(nodes)
    const edgeStr = edges.length
      ? edges.map(x => {
          const s = nodes.find(n => n.id === x.src)?.label || '?'
          const t = nodes.find(n => n.id === x.tgt)?.label || '?'
          return `  ${s} → [${x.label}] → ${t}`
        }).join('\n')
      : '  none mapped yet'

    return ask(SYS, `SITUATION ANALYSIS REQUEST
Total signals: ${total}. Process every single one.

ALL SIGNALS:
${signals}

MAPPED CONNECTIONS:
${edgeStr}

Produce a complete SITUATION ANALYSIS covering all ${total} signals:

OVERALL PICTURE
[3-4 lines: the full current state — named actors, locations, confirmed status of key events]

KEY DEVELOPMENTS  (every significant development from every signal, most critical first)
▸ [actor / location]: [what happened, specific] — [Source] [CONFIRMED/ESTIMATED]
▸ [repeat for every notable signal — do not skip any high or critical severity signal]

ACTORS IN PLAY
[every named actor across all signals — role, current status, one line each]

CONTRADICTIONS / CONFLICTING REPORTS
[flag any signals that contradict each other — which sources, what conflict]

CRITICAL GAPS
[what is absent from the signals that would materially change the picture]

ASSESSMENT
[current trajectory, confidence level, key uncertainty]`,
    onToken, 4000)
  }, [ask])

  // ── SUGGEST CONNECTIONS ───────────────────────────────────────────────────
  const suggestLinks = useCallback((nodes, onToken) => {
    if (nodes.length < 2) return ask(SYS, 'Need at least 2 signals.', onToken, 100)

    const total   = nodes.length
    const signals = buildSignalBlock(nodes)

    return ask(SYS, `CONNECTION ANALYSIS REQUEST
Total signals: ${total}. Scan all of them for hidden links.

ALL SIGNALS:
${signals}

Find every meaningful CONNECTION across these ${total} signals. For each:

CONNECTION N: [Entity/Actor A] ↔ [Entity/Actor B]
  RELATIONSHIP:            [nature of the link — operational, financial, political, etc.]
  EVIDENCE IN SIGNALS:     [signal numbers that support this, quoted minimally]
  STRENGTH:                [STRONG / MODERATE / WEAK — with reason]
  CONFIRMATION NEEDED:     [one specific piece of evidence that would confirm]
  SIGNIFICANCE:            [why this connection matters for the situation]

[Include ALL significant connections — aim for completeness, not brevity]

NETWORK PATTERN
[The overarching structure across all signals — what kind of network is this]

MOST CRITICAL CONNECTION
[Single most operationally significant link and why]`,
    onToken, 4000)
  }, [ask])

  // ── TIMELINE ─────────────────────────────────────────────────────────────
  const buildTimeline = useCallback((nodes, onToken) => {
    if (!nodes.length) return ask(SYS, 'No signals provided.', onToken, 100)

    const total   = nodes.length
    const signals = buildSignalBlock(nodes)

    return ask(SYS, `CHRONOLOGICAL INTELLIGENCE TIMELINE REQUEST
Total signals: ${total}. Every signal must appear in the timeline.

ALL SIGNALS:
${signals}

Build a complete chronological intelligence timeline. Rules:
- Include EVERY signal as a timeline entry — do not skip anything
- Order by date. Signals with no date: estimate position from context, mark (date estimated)
- Entry format: date + status marker + who + what + where + consequence + source
- Mark every entry: [CONFIRMED], [ESTIMATED], or [INFERRED]

── TIMELINE ──────────────────────────────────────────────────────────────────

[DATE or ~ESTIMATED DATE]  [CONFIRMED / ESTIMATED / INFERRED]
  WHO:         [named actor(s) — no "officials" without names]
  WHAT:        [exactly what happened — specific action, not vague]
  WHERE:       [location — specific as available]
  CONSEQUENCE: [immediate result or known impact]
  SOURCE:      [source name from signal]

[Repeat for every signal — all ${total} must appear]

── GAPS IN THE TIMELINE ──────────────────────────────────────────────────────
[Time periods with no signals — what might have happened that we can't confirm]
[Key actors with no attributed timeline entry]
[Causation links that are missing]

── NEXT EXPECTED ─────────────────────────────────────────────────────────────
[Based on the sequence: what event logically comes next, confidence level, trigger to watch]`,
    onToken, 6000)
  }, [ask])

  const query = useCallback((q, nodes, onToken) => {
    const ctx = nodes.length ? `Context (${nodes.length} signals): ${nodes.map(x => x.label).join(' | ')}. ` : ''
    return ask(SYS, ctx + '\n\nQuestion: ' + q, onToken, 600)
  }, [ask])

  return { briefArticle, analyzeBoard, suggestLinks, buildTimeline, query, loading, error, hasKey }
}
