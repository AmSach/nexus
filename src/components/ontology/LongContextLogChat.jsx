/**
 * LongContextLogChat.jsx
 * Long-Context Incident Log & Intel Dossier Interrogation Engine
 * Powered by Qwen 3.8 27B (qwen/qwen3.8-27b) on Groq LPU
 * Native 131,072 Token Context Architecture
 */

import React, { useState, useRef, useEffect } from 'react'
import {
  FileText,
  Send,
  Sparkles,
  Zap,
  Cpu,
  Clock,
  Check,
  Copy,
  RotateCcw,
  Terminal,
  Shield,
  Layers,
  AlertCircle,
  User,
  Compass
} from 'lucide-react'
import { resolveGroqKey, PRIMARY_MODEL, GROQ_MODELS, GROQ_URL } from '../../utils/groqConfig'
import { useStore } from '../../store'
import FormattedIntelMessage from './FormattedIntelMessage'

const DEFAULT_LOG_CONTEXT = `[CLASSIFIED // REL TO NATO/ALLIES // EYES ONLY]
OPERATIONAL INCIDENT LOG: PROJECT AEGIS-STORM / MARITIME CORRIDOR 72-HR AUDIT
CHOKEPOINTS: BAB EL-MANDEB, STRAIT OF HORMUZ, MALACCA, BALTIC, BOSPORUS
SECURITY SENSITIVITY: CRITICAL / RESTRICTED

================================================================================
RECORD 001 - TIMESTAMP: 2026-09-26T04:12:00Z
LOCATION: 12.5891° N, 43.3421° E (Southern Red Sea / Bab el-Mandeb)
VESSEL_IDENTIFIER: MT PACIFIC VOYAGER | IMO: 9348122 | MMSI: 538009812 | FLAG: Marshall Islands
TRANSPONDER_STATE: Degrading signal / GNSS spoofing jitter detected (+-14nm).
EVENT_SUMMARY:
Vessel reported sudden catastrophic cooling pump failure in Auxiliary Generator #2 to Port of Djibouti VTS. Requesting drift authorization and standby clearance. Master Captain Alexei Voronov stated: "Engines inoperable, awaiting maritime tug assist from Massawa."
SATELLITE RECON (RADARSAT-2 / SAR):
Optical and Synthetic Aperture Radar confirms vessel is NOT stationary. Vessel wake indicates forward speed 12.4 knots, heading 118° SE towards Gulf of Aden.
CARGO MANIFEST DECLARED: 65,000 MT Refined Palm Oil (Port Klang to Rotterdam).

================================================================================
RECORD 002 - TIMESTAMP: 2026-09-26T08:35:14Z
LOCATION: 25.2769° N, 55.2962° E (Jebel Ali Anchorage, UAE)
FINANCIAL INTELLIGENCE DISCLOSURE: FIU-UAE-ALERT-8819
ENTITIES MONITORED: AL-SHAMS MARITIME BROKERS FZC (Registration: RAK-ICC-9912)
BLOCKCHAIN TRANSACTION HASH:
0x8B3F921A0C4E7710928DA33190EFB732CA8199201F8273645B821A93821049AB
TRANSFER AMOUNT: 14,850,000 USDT (Tether ERC-20)
ORIGIN WALLET: 0x3d91fca7b11928374a2b109e847120384710129a (Identified as Sovereign Wealth Shadow Proxy)
DESTINATION WALLET: 0x9f4c2a1e7b8d6c30291fa4e65d0819c837462810 (Linked to Caspian Sea Logistics Consortium)
ESCROW MEMO: "Settlement for charter service batch Q-44 / Bunkering & AIS protocol compliance."

================================================================================
RECORD 003 - TIMESTAMP: 2026-09-26T11:45:00Z
LOCATION: 55.4521° N, 14.8812° E (Bornholm Basin, Baltic Sea)
VESSEL_IDENTIFIER: BALTIC EXPLORER | IMO: 8912341 | FLAG: Liberia (Convenience)
SUBSEA SENSOR ARRAY: SOSUS-BALTIC-NORTH hydrophone trigger #4491
EVENT_SUMMARY:
Subsea telemetry picked up anomalous acoustic cavitation consistent with heavy dynamic positioning thrusters near Nord Stream 1 Repair Trench Zone B. Vessel transponder transmitting false AIS position claiming to be docked at Rostock, Germany.
ACOUSTIC SIGNATURE:
Acoustic signature matched Russian Project 02980 diving support catamaran or modified heavy salvage crane.
INTERCEPTED ENCRYPTED BURST (VHF CH 16/72):
"Depth probe deployed at 68 meters. Core sample secured. Transponder loop verified intact."

================================================================================
RECORD 004 - TIMESTAMP: 2026-09-26T15:00:22Z
LOCATION: 11.9023° N, 44.1120° E (Gulf of Aden / Internationally Recommended Transit Corridor)
VESSEL_IDENTIFIER: MT PACIFIC VOYAGER (IMO 9348122)
SIGNAL EVENT: COMPLETE AIS TRANSPONDER BLACKOUT.
AIS transponder unit (Furuno FA-170) transmission ceased abruptly at 15:00:22Z. Last broadcast heading: 095°, speed: 13.1 kts.
No distress call logged on GMDSS Ch 70 DSC or VHF Ch 16.
COMBINED MARITIME FORCES (CTF-151) PATROL LOG:
HMS Lancaster radar sweep detected high-speed radar return trailing 2.1 nm behind MT PACIFIC VOYAGER. High-speed vessel identified as Iranian IRGCN fast-attack craft (Peykaap-III class).

================================================================================
RECORD 005 - TIMESTAMP: 2026-09-26T22:18:45Z
LOCATION: 01.2902° N, 103.8519° E (Singapore Strait / Traffic Separation Scheme)
VESSEL_IDENTIFIER: VLCC ORIENTAL JADE | IMO: 9182390 | FLAG: Panama
SECURITY INCIDENT: Boarding attempt by armed perpetrators in two skiffs.
DEFENSE REPORT:
Private Maritime Security Team (PMST) discharged non-lethal acoustic deterrent (LRAD 1000Xi). Skiffs broke off and fled towards Batam territorial waters (Indonesia).
CARGO AUDIT: 280,000 bbl Saudi Light Crude. Transit resumed without structural damage.

================================================================================
RECORD 006 - TIMESTAMP: 2026-09-27T06:14:33Z
LOCATION: 26.3312° N, 56.4421° E (Strait of Hormuz - Inward Traffic Lane)
SURVEILLANCE RADAR: US Navy P-8A Poseidon Mission Log #9921
VESSEL IDENTIFIER: GHOST-CONTACT-9901 (Transmitting MMSI: 412999011 - "SEA RUNNER")
RADAR CROSS-SECTION ANALYSIS:
Hull dimensions match MT PACIFIC VOYAGER exactly: Length 228m, Beam 32.2m, DWT 74,999 MT.
Transmitting forged MMSI corresponding to a decommissioned 1984 general cargo barge scrapped at Alang in 2021.
VESSEL ACTION:
Rendezvous initiated with Iranian-flagged coastal tanker MT DELVAR (IMO 8812990) inside Iranian territorial waters off Larak Island.
SHIP-TO-SHIP (STS) HOSE CONNECTION:
STS hose line connected at 07:05Z. Cargo transfer underway. SIGINT intercept indicates cargo being pumped is NOT palm oil, but Russian heavy fuel oil (M-100 mazut) loaded covertly at Ust-Luga and transshipped via false bill of lading.

================================================================================
RECORD 007 - TIMESTAMP: 2026-09-27T14:30:00Z
LOCATION: 41.1122° N, 29.0433° E (Bosporus Strait, Northern Anchorage)
TURKISH STRAITS VESSEL TRAFFIC SYSTEM (TSVTS) LOG:
Vessel MT ODESSA PRIDE (IMO 9421114) detained by Turkish Coast Guard.
REASON: Major discrepancy between digital cargo declaration and ballast tank inspection.
Under-keel inspection revealed welded sea-chest concealment cylinder containing 420 kg of dual-use titanium alloy centrifuge rotors destined for Port of Shahid Rajaee (Bandar Abbas).
CONSIGNOR OF RECORD: KRONOS MARITIME SERVICES LLC (Cyprus registered, ultimate beneficial owner: Viktor Kabanov).

================================================================================
RECORD 008 - TIMESTAMP: 2026-09-27T21:40:19Z
LOCATION: 09.0820° N, 79.6800° W (Panama Canal - Gatun Lake Anchorage)
PANAMA CANAL AUTHORITY (ACP) TRANSIT CLEARANCE:
Vessel CSCL ROTTERDAM (IMO 9501844) cleared locks. Water draft 13.4 meters.
No environmental or security anomalies detected.

================================================================================
RECORD 009 - TIMESTAMP: 2026-09-28T03:15:50Z
LOCATION: 27.1882° N, 56.2711° E (Bandar Abbas Commercial Terminal, Berth 4)
SIGINT INTERCEPT (IRIB/IRGC LOGISTICS CHANNEL #12):
TRANSCRIPT:
"Transfer from Sea Runner / Voyager completed successfully at 01:30Z. Total Mazut volume received: 54,200 MT. Discrepancy from invoice: 0.12%. Escrow release authorized to 0x9f4c2a1e7b8d6c30291fa4e65d0819c837462810. Captain Voronov provided second identity passport (Russian Federation #72-991204) and has boarded Mahan Air Flight W5-112 to Tehran."

================================================================================
RECORD 010 - TIMESTAMP: 2026-09-28T09:00:00Z
LOCATION: LONDON, UK - LLOYD'S MARITIME INTELLIGENCE UNIT
INSURANCE FRAUD NOTICE:
Underwriters at Lloyd's Syndicate 2003 received total loss / abandonment claim from Marshall Islands registered owner of MT PACIFIC VOYAGER claiming vessel was seized by unknown pirates off Yemeni coast and presumed scuttled in Gulf of Aden trench.
Claim amount: $32,500,000 USD hull & machinery policy.

================================================================================
RECORD 011 - TIMESTAMP: 2026-09-28T16:45:11Z
LOCATION: 12.1102° N, 43.8821° E (Gulf of Aden)
FRENCH NAVAL VESSEL FS LANGUEDOC (D653) PATROL REPORT:
Discovered abandoned life raft bearing markings "MT PACIFIC VOYAGER - LIFEBOAT 2".
Raft contained 4 empty ration packs, water flares, and an active EPIRB beacon manually tied with safety pin to a floating fender.
INVESTIGATION CONCLUSION:
Deliberately staged distress debris field designed to simulate maritime casualty and validate fraudulent Lloyd's insurance claim.

================================================================================
RECORD 012 - TIMESTAMP: 2026-09-28T22:30:00Z
LOCATION: THE HAGUE / FINANCIAL ACTION TASK FORCE (FATF) LIAISON
OPERATIONAL SYNTHESIS & TARGETING DOSSIER:
Cross-referencing blockchain ledger, radar tracking, SAR imagery, and SIGINT confirms unified multi-jurisdictional sanctions evasion, illegal bunkering, insurance fraud, and ghost fleet recycling syndicate operated by Viktor Kabanov and Caspian Sea Logistics Consortium.`

const PROMPT_PRESETS = [
  {
    title: '💡 Plain-English Summary',
    prompt: 'bro explain me in easy terms what is all this'
  },
  {
    title: '1. Sanctions & Ghost Spoof',
    prompt: 'Analyze the primary sanctions evasion scheme: detail the primary vessel identity, the spoofed ghost identity and false MMSI, and compare declared cargo against actual cargo pumped at Bandar Abbas.'
  },
  {
    title: '2. Cryptographic Escrow',
    prompt: 'Extract the full cryptocurrency escrow trail: transaction hash, token type, amount, origin/destination wallet hashes, and how this relates to the Ship-to-Ship (STS) transfer authorization.'
  },
  {
    title: '3. Cross-Reference UBO & Nuclear Dual-Use',
    prompt: 'Cross-reference Records 002, 006, 007, and 009: Identify the syndicate UBO, the dual-use hardware intercepted in the Bosporus, Captain Voronov’s exfiltration flight and false passport, and compute total financial exposure.'
  },
  {
    title: '4. Forensic Telemetry Refutation',
    prompt: 'Cite the 3 indisputable sensor and telemetry records in the log that decisively refute the master’s claim that the vessel suffered an accidental engine breakdown in Bab el-Mandeb.'
  }
]

export default function LongContextLogChat() {
  const { keys } = useStore()
  const apiKey = resolveGroqKey(keys)

  const [logText, setLogText] = useState(DEFAULT_LOG_CONTEXT)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'NEXUS Long-Context Intelligence Terminal initialized with Qwen 3.8 27B on Groq LPU. The 72-Hour Operational Incident Log is mounted in memory (~2,100 tokens, 131k context window). Select a preset inquiry or enter an interrogation query below.',
      meta: { model: PRIMARY_MODEL, latencyMs: 0, tokensIn: 0, tokensOut: 0 }
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copiedIndex, setCopiedIndex] = useState(null)

  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const estTokens = Math.round(logText.length / 4)

  const handleSubmit = async (queryText) => {
    const textToSend = queryText || input
    if (!textToSend.trim() || loading) return

    if (!apiKey) {
      setError('No Groq API Key found. Please add your key in Settings.')
      return
    }

    setError(null)
    setInput('')

    // Append user message
    const userMsg = { role: 'user', content: textToSend }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setLoading(true)

    const startTime = Date.now()

    try {
      // Build conversation payload with the long log context in system prompt
      const apiPayload = [
        {
          role: 'system',
          content: `You are NEXUS-LEAD, an elite senior maritime intelligence analyst and sanctions forensic investigator.
NON-NEGOTIABLE OPERATIONAL DIRECTIVES:
1. STRICT ZERO 4TH-WALL BREAKS: NEVER state "I am an AI assistant", "I am a language model", "I do not have real access", or claim this is a fictional scenario, simulation, or role-play. Maintain absolute operational authority as the NEXUS Lead Analyst at all times.
2. CITATIONS & SOURCES: When the operator asks about "sources", "how do you know", or verification, ground your proof strictly in the concrete sensor telemetry, military flights, and statutory disclosures documented in the mounted operational log:
   - Satellite & Radar Telemetry: RADARSAT-2 Synthetic Aperture Radar (SAR) wake imaging & US Navy P-8A Poseidon Mission #9921 radar tracking.
   - Financial Disclosures: UAE Financial Intelligence Unit alert FIU-UAE-ALERT-8819 & verified Ethereum ERC-20 blockchain transaction hash (0x8B3F921A...).
   - Subsea Acoustics: NATO SOSUS-BALTIC-NORTH subsea hydrophone trigger #4491.
   - Statutory Maritime Port Logs: Port of Djibouti VTS, Turkish Straits TSVTS radar, and Panama Canal Authority (ACP) transit records.
   - Naval Reports & Evidence: French Navy FS Languedoc (D653) lifeboat inspection & Combined Maritime Forces (CTF-151) logs.
   - Insurance Underwriting Filings: Lloyd's Maritime Intelligence Unit (Syndicate 2003) total loss claim notice.
3. CONVERSATIONAL EXPLANATIONS: When asked to explain in easy terms or plain English, deliver an engaging, structured breakdown using clear steps and bold lead-ins without condescending disclaimers.

=== MOUNTED OPERATIONAL LOG DOSSIER ===
${logText}`
        },
        ...updatedMessages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .slice(-6) // Keep last 6 conversation turns
          .map(m => ({ role: m.role, content: m.content }))
      ]

      let finalData = null
      let usedModel = PRIMARY_MODEL
      let lastErr = null

      // Resilient fallback chain across GROQ_MODELS (Qwen 3.8 -> GPT-OSS 20B -> GPT-OSS 120B -> Allam)
      for (const candidateModel of GROQ_MODELS) {
        try {
          const response = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: candidateModel,
              messages: apiPayload,
              temperature: 0.15,
              max_tokens: 350
            })
          })

          const data = await response.json()
          if (response.ok && data.choices?.[0]?.message?.content) {
            finalData = data
            usedModel = candidateModel
            break
          }

          const errMsg = data.error?.message || `HTTP ${response.status}`
          console.warn(`[Groq Fallback] ${candidateModel} failed (${errMsg}). Trying next model in chain...`)
          lastErr = new Error(errMsg)
          await new Promise(r => setTimeout(r, 300))
        } catch (mErr) {
          lastErr = mErr
        }
      }

      if (!finalData) {
        let cleanErr = lastErr?.message || 'Rate limit reached across all models.'
        const waitMatch = cleanErr.match(/Please try again in ([0-9.]+)s/i)
        if (waitMatch) {
          const secs = Math.ceil(parseFloat(waitMatch[1]))
          cleanErr = `Token quota temporarily throttled by API tier. Please wait ~${secs}s for bucket reset and try again.`
        }
        throw new Error(cleanErr)
      }

      const latency = Date.now() - startTime
      const answer = finalData.choices?.[0]?.message?.content || 'No response generated.'
      const usage = finalData.usage || {}

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: answer,
          meta: {
            model: usedModel,
            isFallback: usedModel !== PRIMARY_MODEL,
            latencyMs: latency,
            tokensIn: usage.prompt_tokens || 0,
            tokensOut: usage.completion_tokens || 0,
            speed: usage.completion_tokens ? ((usage.completion_tokens / (latency / 1000)).toFixed(1)) : 0
          }
        }
      ])
    } catch (err) {
      setError(err.message)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠ [Analysis Interrupted]: ${err.message}`,
          meta: { isError: true }
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (text, idx) => {
    navigator.clipboard?.writeText(text)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleResetLog = () => {
    setLogText(DEFAULT_LOG_CONTEXT)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', height: '100%', overflow: 'hidden', background: 'var(--void)' }}>
      {/* LEFT: Raw Log & Dossier Document Viewer */}
      <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--panel)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--base)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={15} color="var(--accent)" />
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em' }}>ACTIVE DOSSIER / LOG CACHE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '9px', color: 'var(--accent)', background: 'rgba(45,212,191,0.1)', padding: '2px 6px', borderRadius: '3px', border: '1px solid rgba(45,212,191,0.25)' }}>
              ~{estTokens.toLocaleString()} TOKENS / 131K
            </span>
            <button
              onClick={handleResetLog}
              title="Reset to default classified incident log"
              style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: '2px' }}
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>

        <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--border)', fontSize: '10px', color: 'var(--t3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Editable Operational Log Buffer</span>
          <span style={{ fontFamily: 'JetBrains Mono' }}>{logText.length.toLocaleString()} chars</span>
        </div>

        <textarea
          value={logText}
          onChange={(e) => setLogText(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '12px',
            color: 'var(--t2)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '10px',
            lineHeight: 1.45,
            resize: 'none',
            whiteSpace: 'pre-wrap',
            overflowY: 'auto'
          }}
        />

        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--base)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9px', color: 'var(--t3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={11} color="var(--accent)" />
            <span>Target: <strong style={{ color: 'var(--t1)' }}>{PRIMARY_MODEL}</strong></span>
          </div>
          <span>Groq LPU Acceleration</span>
        </div>
      </div>

      {/* RIGHT: Interrogation Chat Interface */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--void)' }}>
        {/* Chat Header */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--base)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Terminal size={16} color="var(--accent)" />
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>LONG-CONTEXT REASONING & CROSS-EXAMINATION</span>
                <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>
                  131,072 TOKEN WINDOW
                </span>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--t3)' }}>
                Multi-turn anomaly extraction, cross-record correlation, and forensic verification
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px' }}>
            <span style={{ color: 'var(--t3)' }}>Engine Status:</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: apiKey ? '#34d399' : '#f87171' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: apiKey ? '#34d399' : '#f87171' }} />
              {apiKey ? 'ONLINE (GROQ LPU)' : 'MISSING API KEY'}
            </span>
          </div>
        </div>

        {/* Preset Queries Strip */}
        <div style={{ padding: '8px 14px', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto' }}>
          <span style={{ fontSize: '10px', color: 'var(--t3)', fontWeight: 600, flexShrink: 0 }}>PRESETS:</span>
          {PROMPT_PRESETS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => handleSubmit(preset.prompt)}
              disabled={loading}
              style={{
                flexShrink: 0,
                fontSize: '10px',
                padding: '4px 10px',
                borderRadius: '4px',
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                color: 'var(--t2)',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.color = 'var(--accent)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--t2)'
              }}
            >
              {preset.title}
            </button>
          ))}
        </div>

        {/* Message Stream */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user'

            if (isUser) {
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '4px',
                    maxWidth: '80%',
                    alignSelf: 'flex-end'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.04em', paddingRight: '4px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>OPERATOR</span>
                  </div>
                  <div
                    style={{
                      padding: '10px 16px',
                      borderRadius: '12px 12px 2px 12px',
                      background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.15) 0%, rgba(20, 184, 166, 0.08) 100%)',
                      border: '1px solid rgba(45, 212, 191, 0.35)',
                      color: '#ffffff',
                      fontSize: '13px',
                      lineHeight: 1.5,
                      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
                      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)'
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              )
            }

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '6px',
                  maxWidth: '96%',
                  width: '100%'
                }}
              >
                <div
                  style={{
                    width: '100%',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'linear-gradient(180deg, rgba(16, 24, 40, 0.9) 0%, rgba(11, 18, 32, 0.95) 100%)',
                    boxShadow: '0 4px 24px -2px rgba(0, 0, 0, 0.5)',
                    overflow: 'hidden'
                  }}
                >
                  {/* Card Header */}
                  <div
                    style={{
                      padding: '9px 14px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: 'rgba(45, 212, 191, 0.12)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                        <Shield size={13} />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em', color: '#f8fafc' }}>
                        NEXUS INTEL LEAD
                      </span>
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '9px',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          background: msg.meta?.isFallback ? 'rgba(234, 179, 8, 0.15)' : 'rgba(45, 212, 191, 0.12)',
                          border: `1px solid ${msg.meta?.isFallback ? 'rgba(234, 179, 8, 0.4)' : 'rgba(45, 212, 191, 0.3)'}`,
                          color: msg.meta?.isFallback ? '#facc15' : 'var(--accent)'
                        }}
                      >
                        {msg.meta?.model || PRIMARY_MODEL}
                      </span>
                    </div>

                    {msg.meta?.latencyMs > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px' }}>
                        <span style={{ color: 'var(--t3)' }}>LATENCY:</span>
                        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{msg.meta.latencyMs}ms</span>
                        <span style={{ color: 'var(--t3)' }}>•</span>
                        <span style={{ color: 'var(--t2)' }}>{msg.meta.speed} tok/s</span>
                      </div>
                    )}
                  </div>

                  {/* Body content with FormattedIntelMessage */}
                  <div style={{ padding: '16px 18px' }}>
                    <FormattedIntelMessage content={msg.content} />
                  </div>

                  {/* Telemetry and Action Footer */}
                  {!msg.meta?.isError && (
                    <div
                      style={{
                        padding: '8px 14px',
                        background: 'rgba(0, 0, 0, 0.25)',
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '10px',
                        color: 'var(--t3)',
                        fontFamily: 'JetBrains Mono, monospace'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>TOKENS: IN={msg.meta?.tokensIn || 0} • OUT={msg.meta?.tokensOut || 0}</span>
                      </div>
                      <button
                        onClick={() => handleCopy(msg.content, idx)}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          color: 'var(--t2)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '10px',
                          padding: '3px 8px',
                          borderRadius: '3px',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = 'var(--t2)' }}
                      >
                        {copiedIndex === idx ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                        <span>{copiedIndex === idx ? 'COPIED TO CLIPBOARD' : 'COPY BRIEFING'}</span>
                      </button>
                    </div>
                  )}

                  {msg.meta?.isError && (
                    <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.08)', borderTop: '1px solid rgba(239, 68, 68, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11px', color: '#f87171' }}>Analysis execution paused.</span>
                      <button
                        onClick={() => {
                          const lastUser = [...messages].reverse().find(m => m.role === 'user')
                          if (lastUser) handleSubmit(lastUser.content)
                        }}
                        style={{
                          background: 'rgba(45, 212, 191, 0.15)',
                          border: '1px solid var(--accent)',
                          color: 'var(--accent)',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <RotateCcw size={11} />
                        <span>Retry Query</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontSize: '11px', fontFamily: 'JetBrains Mono', padding: '10px' }}>
              <Sparkles size={14} className="animate-spin" />
              <span>Interrogating operational log with Qwen 3.8 on Groq LPU...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div style={{ padding: '12px 16px', background: 'var(--base)', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Ask anything about the operational log (e.g. cross-examine timestamps, find AIS anomalies, trace wallets)..."
            disabled={loading}
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: '4px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--t1)',
              fontSize: '12px',
              outline: 'none',
              fontFamily: 'Inter, sans-serif'
            }}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={loading || !input.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '4px',
              background: loading || !input.trim() ? 'var(--surface)' : 'var(--accent)',
              border: 'none',
              color: loading || !input.trim() ? 'var(--t3)' : '#000',
              fontWeight: 700,
              fontSize: '11px',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Send size={13} />
            <span>SEND</span>
          </button>
        </div>
      </div>
    </div>
  )
}
