import React, { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useStore } from '../../store'
import { useGroq } from '../../hooks/useGroq'
import { translateGoogle } from '../../hooks/useNewsFeed'
import { Bookmark, BookmarkCheck, Plus, ExternalLink, Brain, X } from 'lucide-react'

// Detect non-English text (heuristic: non-ASCII chars > 15% or common non-English patterns)
function isNonEnglish(text) {
  if (!text) return false
  const nonAscii = (text.match(/[^\x20-\x7E]/g) || []).length
  if (nonAscii / text.length > 0.12) return true
  // Arabic/Chinese/Russian/Japanese/Korean scripts
  if (/[؀-ۿ一-鿿Ѐ-ӿ぀-ゟ가-힯]/.test(text)) return true
  return false
}

// Open Google Translate for a URL
function translateUrl(url) {
  return `https://translate.google.com/translate?u=${encodeURIComponent(url)}&sl=auto&tl=en`
}

const SEV = {
  critical: 'var(--red)',
  high:     'var(--orange)',
  medium:   'var(--yellow)',
  low:      'var(--accent)',
}

export default function ArticleCard({ article, flash = false }) {
  const { save, unsave, isSaved, addNode, setTab, setEntityFocus, watchlist } = useStore()
  const { briefArticle, loading: aiLoading, hasKey } = useGroq()
  const [open,    setOpen]    = useState(false)
  const [aiText,  setAiText]  = useState('')
  const [aiShown, setAiShown] = useState(false)
  const [translatedTitle, setTranslatedTitle] = useState('')
  const [showOriginal, setShowOriginal] = useState(false)

  const saved      = isSaved(article.id)
  const needsTranslation = isNonEnglish(article.title)

  React.useEffect(() => {
    let cancelled = false
    if (needsTranslation && !translatedTitle) {
      translateGoogle(article.title).then(res => {
        if (!cancelled && res && res !== article.title) {
          setTranslatedTitle(res)
        }
      })
    }
    return () => { cancelled = true }
  }, [article.title, needsTranslation])
  const color  = SEV[article.severity] || 'var(--accent)'
  const ago    = (() => { try { return formatDistanceToNow(article.pub, { addSuffix: true }) } catch { return '' } })()
  const local  = (() => { try { return article.pub.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' } })()

  const highlight = (text) => {
    if (!text || !watchlist.length) return text
    const rx = new RegExp(`(${watchlist.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    return text.split(rx).map((p, i) =>
      rx.test(p) ? <mark key={i} style={{ background: 'rgba(234,179,8,0.2)', color: 'var(--yellow)', borderRadius: '1px' }}>{p}</mark> : p
    )
  }

  const doAI = async (e) => {
    e.stopPropagation()
    if (aiShown) { setAiShown(false); return }
    setAiShown(true)
    setAiText('')
    await briefArticle(article, t => setAiText(t))
  }

  const doBoard = (e) => {
    e.stopPropagation()
    addNode({ type: 'event', label: article.title.slice(0, 55), detail: article.summary?.slice(0, 200), source: article.source, url: article.url, color, x: 200 + Math.random() * 400, y: 150 + Math.random() * 300 })
    // Silent save — stay on current tab
  }

  return (
    <div className={`feed-item${open ? ' expanded' : ''}${flash ? ' flash' : ''}`}
      style={{ borderLeftColor: color }}
      onClick={() => setOpen(o => !o)}>
      <div style={{ padding: '8px 12px' }}>

        {/* Line 1: source · time · region — always visible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <a href={article.url !== '#' ? article.url : undefined}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ fontFamily: 'JetBrains Mono', fontSize: '10px', fontWeight: 600,
              color: article.url !== '#' ? 'var(--accent)' : 'var(--t2)',
              textDecoration: article.url !== '#' ? 'underline' : 'none',
              textDecorationColor: 'rgba(45,212,191,0.35)' }}>
            {article.source}
          </a>
          <span style={{ color: 'var(--border2)', fontSize: '10px' }}>·</span>
          <span className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }} title={local}>{ago}</span>
          {article.region && article.region !== 'Global' && (
            <>
              <span style={{ color: 'var(--border2)', fontSize: '10px' }}>·</span>
              <span className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>{article.region}</span>
            </>
          )}
          {/* Severity chip — only critical/high shown */}
          {(article.severity === 'critical' || article.severity === 'high') && (
            <span className="chip" style={{ marginLeft: 'auto', background: `${color}12`, borderColor: `${color}35`, color }}>{article.severity}</span>
          )}
        </div>

        {/* Line 2: headline */}
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t1)', lineHeight: 1.4, marginBottom: open ? '8px' : '0' }}>
          {highlight(translatedTitle && !showOriginal ? translatedTitle : article.title)}
          {translatedTitle && (
            <button
              onClick={e => { e.stopPropagation(); setShowOriginal(s => !s) }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontSize: '9px',
                fontFamily: 'JetBrains Mono, monospace',
                cursor: 'pointer',
                marginLeft: '8px',
                textDecoration: 'underline'
              }}
            >
              {showOriginal ? 'Show translation' : 'Show original'}
            </button>
          )}
        </div>

        {/* Expanded content */}
        {open && (
          <div onClick={e => e.stopPropagation()} className="fade-in">
            {article.summary && (
              <p style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.7, marginBottom: '8px' }}>
                {highlight(article.summary)}
              </p>
            )}

            {/* Entity chips */}
            {article.entities?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                {article.entities.map((ent, i) => (
                  <button key={i} className="entity"
                    onClick={e => { e.stopPropagation(); setEntityFocus(ent.name); setTab('feed') }}
                    title={`Search: ${ent.name}`}>
                    {ent.name}
                  </button>
                ))}
              </div>
            )}

            {/* Tags */}
            {article.tags?.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {article.tags.map(t => <span key={t} className="chip">{t}</span>)}
              </div>
            )}

            {/* Source link */}
            {article.url && article.url !== '#' && (
              <div style={{ marginBottom: '8px' }}>
                <a href={article.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: 'JetBrains Mono', fontSize: '9px', color: 'var(--accent)',
                    textDecoration: 'underline', textDecorationColor: 'rgba(45,212,191,0.3)' }}
                  onClick={e => e.stopPropagation()}>
                  ↗ Read full article at {article.source}
                </a>
                {needsTranslation && article.url && (
                  <a href={translateUrl(article.url)} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily:'JetBrains Mono', fontSize:'9px', color:'#f97316',
                      textDecoration:'none', marginLeft:'8px', padding:'1px 5px',
                      border:'1px solid rgba(249,115,22,0.3)', borderRadius:'2px' }}
                    onClick={e => e.stopPropagation()}>
                    🌐 Translate
                  </a>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button className={`btn ${saved ? 'btn-accent' : ''}`} style={{ fontSize: '10px', padding: '3px 8px' }}
                onClick={e => { e.stopPropagation(); saved ? unsave(article.id) : save(article) }}>
                {saved ? <><BookmarkCheck size={10}/> saved</> : <><Bookmark size={10}/> save</>}
              </button>
              <button className="btn" style={{ fontSize: '10px', padding: '3px 8px' }} onClick={doBoard}>
                <Plus size={10}/> board
              </button>
              {hasKey && (
                <button className={`btn ${aiShown ? 'btn-accent' : ''}`}
                  style={{ fontSize: '10px', padding: '3px 8px' }}
                  onClick={doAI} disabled={aiLoading && !aiText}>
                  <Brain size={10}/>
                  {aiLoading && !aiText ? 'reading…' : aiShown ? 'close' : 'brief me'}
                </button>
              )}
              {article.url && article.url !== '#' && (
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="btn"
                  style={{ fontSize: '10px', padding: '3px 8px' }} onClick={e => e.stopPropagation()}>
                  <ExternalLink size={10}/> source
                </a>
              )}
            </div>

            {/* AI brief — plain text, minimal */}
            {aiShown && (
              <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--void)',
                borderRadius: '3px', border: '1px solid rgba(45,212,191,0.15)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span className="mono" style={{ fontSize: '8px', color: 'var(--accent)' }}>AI brief</span>
                  <button onClick={() => setAiShown(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}><X size={10}/></button>
                </div>
                {aiLoading && !aiText
                  ? <span className="mono" style={{ fontSize: '10px', color: 'var(--t3)' }}>reading…</span>
                  : <p style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                      {aiText}
                      {aiLoading && <span className="pulse" style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', marginLeft: '4px', verticalAlign: 'middle' }} />}
                    </p>
                }
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
