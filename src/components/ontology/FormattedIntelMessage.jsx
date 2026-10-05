/**
 * FormattedIntelMessage.jsx
 * High-End Executive Typography & Step-Card Markdown Renderer
 * Converts raw intelligence/incident logs and LLM output into
 * sleek, modern executive cards, callouts, and structured steps.
 */

import React from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Target,
  Shield,
  Clock,
  Layers,
  ArrowRight,
  ExternalLink,
  Info,
  Radio,
  Compass
} from 'lucide-react'

// Helper to format plain text and highlight record/sensor citations
function formatPlainSpans(str, baseKey) {
  if (!str) return null
  const recRegex = /\b(Record\s+\d+|RECORD\s+\d+|MMSI:\s*\d+|IMO:\s*\d+)\b/g
  const parts = []
  let lastIdx = 0
  let m
  let subKey = 0

  while ((m = recRegex.exec(str)) !== null) {
    if (m.index > lastIdx) {
      parts.push(<span key={`${baseKey}-${subKey++}`}>{str.slice(lastIdx, m.index)}</span>)
    }
    parts.push(
      <span
        key={`${baseKey}-${subKey++}`}
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--accent)',
          background: 'rgba(45, 212, 191, 0.12)',
          border: '1px solid rgba(45, 212, 191, 0.28)',
          padding: '1px 5px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 700,
          whiteSpace: 'nowrap'
        }}
      >
        {m[1]}
      </span>
    )
    lastIdx = m.index + m[0].length
  }

  if (lastIdx < str.length) {
    parts.push(<span key={`${baseKey}-${subKey++}`}>{str.slice(lastIdx)}</span>)
  }

  return parts
}

// Helper to render inline formatting: bold, italic, inline code, and record pills
function renderInline(text) {
  if (!text) return null

  // Tokenize bold, italic, code
  const parts = []
  let remaining = text
  let keyIndex = 0

  while (remaining.length > 0) {
    // Check for bold: **text**
    const boldMatch = remaining.match(/^([\s\S]*?)\*\*(.+?)\*\*([\s\S]*)/)
    // Check for code: `text`
    const codeMatch = remaining.match(/^([\s\S]*?)`([^`]+)`([\s\S]*)/)
    // Check for italic: *text* (when not preceded/followed by *)
    const italicMatch = remaining.match(/^([\s\S]*?)(?<!\*)\*([^*]+)\*(?!\*)([\s\S]*)/)

    // Find earliest match
    let earliest = null
    let type = null

    if (boldMatch) {
      earliest = { match: boldMatch, index: boldMatch[1].length, type: 'bold' }
    }
    if (codeMatch && (!earliest || codeMatch[1].length < earliest.index)) {
      earliest = { match: codeMatch, index: codeMatch[1].length, type: 'code' }
    }
    if (italicMatch && (!earliest || italicMatch[1].length < earliest.index)) {
      earliest = { match: italicMatch, index: italicMatch[1].length, type: 'italic' }
    }

    if (!earliest) {
      parts.push(...formatPlainSpans(remaining, keyIndex++))
      break
    }

    const { match, type: matchType } = earliest
    const prefix = match[1]
    const content = match[2]
    const rest = match[3]

    if (prefix) {
      parts.push(...formatPlainSpans(prefix, keyIndex++))
    }

    if (matchType === 'bold') {
      parts.push(
        <strong
          key={keyIndex++}
          style={{
            fontWeight: 700,
            color: '#f8fafc',
            letterSpacing: '-0.01em'
          }}
        >
          {content}
        </strong>
      )
    } else if (matchType === 'code') {
      parts.push(
        <code
          key={keyIndex++}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '11px',
            background: 'rgba(255, 255, 255, 0.07)',
            padding: '2px 5px',
            borderRadius: '4px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: 'var(--accent)',
            fontFeatureSettings: "'tnum' 1"
          }}
        >
          {content}
        </code>
      )
    } else if (matchType === 'italic') {
      parts.push(
        <em
          key={keyIndex++}
          style={{
            fontStyle: 'italic',
            color: 'var(--t1)'
          }}
        >
          {content}
        </em>
      )
    }

    remaining = rest
  }

  return parts
}

// Helper to categorize bullet lead tags
function parseBulletLabel(rawText) {
  // Matches "* **Label:** Details" or "- **Label:** Details"
  const bulletMatch = rawText.match(/^\s*[*•-]\s*\*\*(.+?):\*\*\s*(.*)$/)
  if (bulletMatch) {
    return {
      label: bulletMatch[1].trim(),
      details: bulletMatch[2].trim()
    }
  }

  // Matches "* Label: Details"
  const plainMatch = rawText.match(/^\s*[*•-]\s*([^:]+):\s*(.*)$/)
  if (plainMatch && plainMatch[1].length < 25) {
    return {
      label: plainMatch[1].trim(),
      details: plainMatch[2].trim()
    }
  }

  // Plain bullet without explicit label
  const generalBullet = rawText.match(/^\s*[*•-]\s*(.*)$/)
  if (generalBullet) {
    return {
      label: null,
      details: generalBullet[1].trim()
    }
  }

  return null
}

function getBadgeStyle(label) {
  const l = (label || '').toLowerCase()
  if (l.includes('lie') || l.includes('false') || l.includes('contradict') || l.includes('fraud') || l.includes('staged')) {
    return {
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.35)',
      color: '#f87171',
      icon: AlertTriangle
    }
  }
  if (l.includes('money') || l.includes('pay') || l.includes('escrow') || l.includes('crypto') || l.includes('usdt') || l.includes('usd') || l.includes('fund')) {
    return {
      bg: 'rgba(34, 197, 94, 0.12)',
      border: 'rgba(34, 197, 94, 0.35)',
      color: '#4ade80',
      icon: DollarSign
    }
  }
  if (l.includes('goal') || l.includes('objective') || l.includes('target') || l.includes('destination')) {
    return {
      bg: 'rgba(168, 85, 247, 0.12)',
      border: 'rgba(168, 85, 247, 0.35)',
      color: '#c084fc',
      icon: Target
    }
  }
  if (l.includes('who') || l.includes('entity') || l.includes('ubo') || l.includes('vessel')) {
    return {
      bg: 'rgba(59, 130, 246, 0.12)',
      border: 'rgba(59, 130, 246, 0.35)',
      color: '#60a5fa',
      icon: Shield
    }
  }
  // Default (e.g. What happened, Event, Clue)
  return {
    bg: 'rgba(45, 212, 191, 0.1)',
    border: 'rgba(45, 212, 191, 0.28)',
    color: 'var(--accent)',
    icon: Layers
  }
}

// Helper to parse and render Markdown tables with high-end executive styling
function renderTableBlock(block, bIdx) {
  const rows = (block.rawRows || []).filter(r => r.trim() !== '')
  if (rows.length < 2) return null

  const parseRow = (rowStr) => {
    // Strip leading/trailing pipe
    const trimmed = rowStr.replace(/^\|/, '').replace(/\|$/, '')
    return trimmed.split('|').map(c => c.trim())
  }

  const headerCells = parseRow(rows[0])
  const colCount = Math.max(headerCells.length, 1)

  // Check if second row is separator row (|---|---|)
  let dataStartIndex = 1
  if (rows[1] && rows[1].includes('---')) {
    dataStartIndex = 2
  }

  // Parse all raw rows into cells, and if any row was concatenated, chunk by colCount
  const dataRows = []
  for (let r = dataStartIndex; r < rows.length; r++) {
    const rawCells = parseRow(rows[r])
    if (rawCells.length <= colCount) {
      const padded = [...rawCells]
      while (padded.length < colCount) {
        padded.push('')
      }
      dataRows.push(padded)
    } else {
      // Chunk into rows of colCount
      for (let c = 0; c < rawCells.length; c += colCount) {
        const chunk = rawCells.slice(c, c + colCount)
        if (chunk.some(cell => cell.trim() !== '')) {
          while (chunk.length < colCount) {
            chunk.push('')
          }
          dataRows.push(chunk)
        }
      }
    }
  }

  return (
    <div
      key={bIdx}
      style={{
        margin: '16px 0',
        borderRadius: '10px',
        border: '1px solid rgba(45, 212, 191, 0.22)',
        background: 'linear-gradient(180deg, rgba(13, 20, 36, 0.96) 0%, rgba(9, 14, 26, 0.98) 100%)',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        overflow: 'hidden'
      }}
    >
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: '12px',
            fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif"
          }}
        >
          <thead>
            <tr
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                background: 'rgba(15, 23, 42, 0.98)',
                backdropFilter: 'blur(8px)',
                borderBottom: '1px solid rgba(45, 212, 191, 0.3)'
              }}
            >
              {headerCells.map((h, hIdx) => (
                <th
                  key={hIdx}
                  style={{
                    padding: '11px 14px',
                    fontWeight: 800,
                    fontSize: '10.5px',
                    color: hIdx === 0 ? 'var(--accent)' : '#f8fafc',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                    borderRight: hIdx === colCount - 1 ? 'none' : '1px solid rgba(255, 255, 255, 0.05)'
                  }}
                >
                  {renderInline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, rIdx) => (
              <tr
                key={rIdx}
                style={{
                  borderBottom: rIdx === dataRows.length - 1 ? 'none' : '1px solid rgba(255, 255, 255, 0.06)',
                  background: rIdx % 2 === 1 ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                  transition: 'background 0.15s ease'
                }}
              >
                {row.map((cell, cIdx) => {
                  const cellLines = cell ? cell.split(/<br\s*\/?>/i) : ['']
                  const isFirstCol = cIdx === 0
                  const isNumeric = /^\d+$/.test(cell.trim())

                  return (
                    <td
                      key={cIdx}
                      style={{
                        padding: '11px 14px',
                        color: isFirstCol ? 'var(--accent)' : 'var(--t1)',
                        fontWeight: isFirstCol ? 700 : 400,
                        fontFamily: isFirstCol ? 'JetBrains Mono, monospace' : 'inherit',
                        lineHeight: 1.55,
                        verticalAlign: 'top',
                        borderRight: cIdx === colCount - 1 ? 'none' : '1px solid rgba(255, 255, 255, 0.04)'
                      }}
                    >
                      {isFirstCol && isNumeric ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '22px',
                            height: '22px',
                            borderRadius: '5px',
                            background: 'rgba(45, 212, 191, 0.12)',
                            border: '1px solid rgba(45, 212, 191, 0.3)',
                            color: 'var(--accent)',
                            fontSize: '11px',
                            fontWeight: 800
                          }}
                        >
                          {cell.trim().padStart(2, '0')}
                        </span>
                      ) : (
                        cellLines.map((linePart, lpIdx) => (
                          <React.Fragment key={lpIdx}>
                            {lpIdx > 0 && <div style={{ height: '6px' }} />}
                            {renderInline(linePart.trim())}
                          </React.Fragment>
                        ))
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function FormattedIntelMessage({ content }) {
  if (!content) return null

  // Pre-process content to fix markdown tables where rows were concatenated without newlines
  const preprocessed = (content || '')
    // Fix separator row glued to row 1: e.g. |---|---|| 1 | or |---|---| | 1 |
    .replace(/(-{2,}\|)\s*\|/g, '$1\n|')
    // Fix rows joined by || or | | followed by row index or label: e.g. | | 2 | or || 2 |
    .replace(/\|\s*\|\s*(\d+)\s*\|/g, '|\n| $1 |')

  // Split content into blocks by newline or heading boundaries
  const lines = preprocessed.split('\n')
  const blocks = []
  let currentBlock = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd()

    // Detect Table Row (starts with | or contains multiple | characters)
    const isTableRow = line.trim().startsWith('|') && (line.trim().endsWith('|') || line.includes('|'))
    if (isTableRow) {
      if (currentBlock && currentBlock.type === 'table') {
        currentBlock.rawRows.push(line.trim())
      } else {
        if (currentBlock) blocks.push(currentBlock)
        currentBlock = {
          type: 'table',
          rawRows: [line.trim()]
        }
      }
      continue
    } else if (currentBlock && currentBlock.type === 'table') {
      blocks.push(currentBlock)
      currentBlock = null
    }

    // Detect Heading 1, 2, 3
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      if (currentBlock) blocks.push(currentBlock)
      currentBlock = {
        type: 'step_section',
        level: headingMatch[1].length,
        rawTitle: headingMatch[2].trim(),
        items: []
      }
      continue
    }

    // Detect "The Big Picture:" / "Summary:" / "Overview:" header
    if (line.match(/^\s*\*\*(The Big Picture|Executive Summary|Summary|Key Findings|Overview):\*\*\s*$/i)) {
      if (currentBlock) blocks.push(currentBlock)
      currentBlock = {
        type: 'callout_box',
        title: line.replace(/\*/g, '').replace(':', '').trim(),
        contentLines: []
      }
      continue
    }

    // Bullet lines
    if (line.match(/^\s*[*•-]\s+/)) {
      if (currentBlock && (currentBlock.type === 'step_section' || currentBlock.type === 'bullet_list')) {
        currentBlock.items.push(line)
      } else {
        if (currentBlock) blocks.push(currentBlock)
        currentBlock = {
          type: 'bullet_list',
          items: [line]
        }
      }
      continue
    }

    // Empty lines
    if (line.trim() === '') {
      if (currentBlock && currentBlock.type !== 'step_section' && currentBlock.type !== 'callout_box') {
        blocks.push(currentBlock)
        currentBlock = null
      }
      continue
    }

    // Regular text lines
    if (currentBlock && currentBlock.type === 'callout_box') {
      currentBlock.contentLines.push(line)
    } else if (currentBlock && currentBlock.type === 'step_section') {
      // Descriptive subtitle or intro text inside the step
      currentBlock.items.push(line)
    } else if (currentBlock && currentBlock.type === 'paragraph') {
      currentBlock.lines.push(line)
    } else {
      if (currentBlock) blocks.push(currentBlock)
      currentBlock = {
        type: 'paragraph',
        lines: [line]
      }
    }
  }

  if (currentBlock) blocks.push(currentBlock)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        color: 'var(--t1)',
        fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif",
        fontSize: '13px',
        lineHeight: 1.62
      }}
    >
      {blocks.map((block, bIdx) => {
        // 1. CALLOUT BOX (e.g. "The Big Picture" / "Executive Summary")
        if (block.type === 'callout_box') {
          return (
            <div
              key={bIdx}
              style={{
                position: 'relative',
                background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)',
                border: '1px solid rgba(45, 212, 191, 0.3)',
                borderRadius: '8px',
                padding: '14px 18px',
                boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.5)'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '10px',
                  color: 'var(--accent)',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase'
                }}
              >
                <Compass size={14} color="var(--accent)" />
                <span>{block.title}</span>
              </div>
              <div
                style={{
                  color: '#e2e8f0',
                  fontSize: '13px',
                  lineHeight: 1.65
                }}
              >
                {renderInline(block.contentLines.join(' '))}
              </div>
            </div>
          )
        }

        // 2. STEP SECTION (e.g. "### 1. The Setup: Faking a Breakdown (Sept 26, 04:12)")
        if (block.type === 'step_section') {
          // Parse step number, title, and timestamp
          // e.g. "1. The Setup: Faking a Breakdown (Sept 26, 04:12)"
          const stepMatch = block.rawTitle.match(/^(\d+)[\.\)]\s*(.*?)(?:\s*\(([^)]+)\))?$/)
          const stepNum = stepMatch ? stepMatch[1] : null
          const stepTitle = stepMatch ? stepMatch[2] : block.rawTitle
          const stepTime = stepMatch ? stepMatch[3] : null

          return (
            <div
              key={bIdx}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '8px',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
              }}
            >
              {/* Step Header */}
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {stepNum ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        background: 'rgba(45, 212, 191, 0.15)',
                        border: '1px solid rgba(45, 212, 191, 0.4)',
                        color: 'var(--accent)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '11px',
                        fontWeight: 800
                      }}
                    >
                      {stepNum.padStart(2, '0')}
                    </span>
                  ) : (
                    <Layers size={14} color="var(--accent)" />
                  )}
                  <h4
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#f8fafc',
                      letterSpacing: '-0.01em'
                    }}
                  >
                    {renderInline(stepTitle)}
                  </h4>
                </div>

                {stepTime && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '10px',
                      color: 'var(--t2)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255, 255, 255, 0.07)'
                    }}
                  >
                    <Clock size={11} color="var(--t3)" />
                    <span>{stepTime}</span>
                  </div>
                )}
              </div>

              {/* Step Items / Bullets */}
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {block.items.map((item, itemIdx) => {
                  const bullet = parseBulletLabel(item)

                  if (!bullet) {
                    // Regular text line in step
                    return (
                      <div key={itemIdx} style={{ fontSize: '12.5px', color: 'var(--t2)', lineHeight: 1.55 }}>
                        {renderInline(item)}
                      </div>
                    )
                  }

                  const { label, details } = bullet
                  const badge = label ? getBadgeStyle(label) : null
                  const BadgeIcon = badge?.icon

                  return (
                    <div
                      key={itemIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        fontSize: '12.5px',
                        lineHeight: 1.55
                      }}
                    >
                      {label ? (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flexShrink: 0 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: badge.bg,
                              border: `1px solid ${badge.border}`,
                              color: badge.color,
                              fontSize: '10px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.03em',
                              marginTop: '2px',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {BadgeIcon && <BadgeIcon size={10} />}
                            <span>{label}</span>
                          </span>
                        </div>
                      ) : (
                        <span
                          style={{
                            width: '4px',
                            height: '4px',
                            borderRadius: '50%',
                            background: 'var(--accent)',
                            marginTop: '9px',
                            flexShrink: 0
                          }}
                        />
                      )}
                      <div style={{ color: 'var(--t1)', flex: 1 }}>
                        {renderInline(details)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        }

        // 3. STANDALONE BULLET LIST
        if (block.type === 'bullet_list') {
          return (
            <div
              key={bIdx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '4px 0'
              }}
            >
              {block.items.map((item, iIdx) => {
                const bullet = parseBulletLabel(item)
                if (!bullet) {
                  return (
                    <div key={iIdx} style={{ fontSize: '13px', color: 'var(--t1)' }}>
                      {renderInline(item)}
                    </div>
                  )
                }

                const { label, details } = bullet
                const badge = label ? getBadgeStyle(label) : null
                const BadgeIcon = badge?.icon

                return (
                  <div key={iIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px' }}>
                    {label ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: badge.bg,
                          border: `1px solid ${badge.border}`,
                          color: badge.color,
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          marginTop: '2px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {BadgeIcon && <BadgeIcon size={10} />}
                        <span>{label}</span>
                      </span>
                    ) : (
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', marginTop: '8px', flexShrink: 0 }} />
                    )}
                    <div style={{ color: 'var(--t1)', flex: 1 }}>
                      {renderInline(details)}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        }

        // 4. REGULAR PARAGRAPHS
        if (block.type === 'paragraph') {
          const text = block.lines.join(' ')
          // If starts with "In short:"
          const inShortMatch = text.match(/^\s*\*\*(In short:?)\*\*\s*(.*)$/i)
          if (inShortMatch) {
            return (
              <div
                key={bIdx}
                style={{
                  background: 'rgba(45, 212, 191, 0.05)',
                  borderLeft: '3px solid var(--accent)',
                  padding: '10px 14px',
                  borderRadius: '0 6px 6px 0',
                  color: 'var(--t1)',
                  fontSize: '12.5px',
                  marginTop: '4px'
                }}
              >
                <strong style={{ color: 'var(--accent)', marginRight: '6px' }}>IN SHORT:</strong>
                {renderInline(inShortMatch[2])}
              </div>
            )
          }

          return (
            <p
              key={bIdx}
              style={{
                margin: 0,
                fontSize: '13px',
                color: 'var(--t2)',
                lineHeight: 1.62
              }}
            >
              {renderInline(text)}
            </p>
          )
        }

        // 5. DATA TABLES
        if (block.type === 'table') {
          return renderTableBlock(block, bIdx)
        }

        return null
      })}
    </div>
  )
}
