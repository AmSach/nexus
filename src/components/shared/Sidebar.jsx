import React, { useState } from 'react'
import { useStore } from '../../store'
import { CATEGORIES, REGIONS } from '../../data/constants'
import { Activity, Rss, GitBranch, DollarSign, Bookmark, Settings, AlertTriangle, Map, Search, Tv2, Cpu } from 'lucide-react'

const TABS = [
  { id: 'feed',       label: 'Feed',       Icon: Rss          },
  { id: 'situations', label: 'Monitor',    Icon: AlertTriangle },
  { id: 'search',     label: 'Intel Search', Icon: Search     },
  { id: 'board',      label: 'Board',      Icon: GitBranch    },
  { id: 'map',        label: 'Map',        Icon: Map          },
  { id: 'finnews',    label: 'Finance',    Icon: DollarSign   },
  { id: 'vox',        label: 'VOX Sim',    Icon: Cpu          },
  { id: 'saved',      label: 'Saved',      Icon: Bookmark     },
  { id: 'health',     label: 'Health',     Icon: Activity     },
  { id: 'settings',   label: 'Settings',   Icon: Settings     },
  { id: 'view',       label: 'View Mode',  Icon: Tv2          },
]

export default function Sidebar({ collapsed }) {
  const { tab, setTab, filters, setFilter, clearFilters, watchlist, addWatch, removeWatch, saved } = useStore()
  const [watchInput, setWatchInput] = useState('')

  const addTerm = () => {
    if (watchInput.trim()) { addWatch(watchInput.trim()); setWatchInput('') }
  }

  if (collapsed) return (
    <div style={{ width: '40px', flexShrink: 0, background: 'var(--base)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '4px', gap: '2px' }}>
      {TABS.map(({ id, label, Icon }) => (
        <button key={id} onClick={() => setTab(id)} title={label}
          style={{ width: '32px', height: '32px', borderRadius: '3px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: tab === id ? 'rgba(45,212,191,0.12)' : 'transparent',
            color: tab === id ? 'var(--accent)' : 'var(--t3)' }}>
          <Icon size={14} />
        </button>
      ))}
    </div>
  )

  return (
    <div style={{ width: '155px', flexShrink: 0, background: 'var(--base)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Nav tabs */}
      <div style={{ flexShrink: 0, padding: '4px', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', width: '100%',
              padding: '5px 7px', borderRadius: '3px', cursor: 'pointer', border: 'none',
              fontFamily: 'Inter, sans-serif', fontSize: '11px', textAlign: 'left',
              background: tab === id ? 'rgba(45,212,191,0.1)' : 'transparent',
              color: tab === id ? 'var(--accent)' : 'var(--t3)',
              borderLeft: `2px solid ${tab === id ? 'var(--accent)' : 'transparent'}`,
            }}>
            <Icon size={12} style={{ flexShrink: 0 }} />
            <span>{label}</span>
            {id === 'saved' && saved.length > 0 && (
              <span className="chip" style={{ marginLeft: 'auto', padding: '0 4px' }}>{saved.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Feed filters — only when feed tab active */}
      {tab === 'feed' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          <Section label="CATEGORY">
            {CATEGORIES.map(c => (
              <FilterRow key={c.id} active={filters.category === c.id}
                onClick={() => setFilter('category', c.id)} color={c.color}>
                {c.label}
              </FilterRow>
            ))}
          </Section>

          <Section label="SEVERITY">
            {[
              { id: 'all',      label: 'All',      color: 'var(--t3)'    },
              { id: 'critical', label: 'Critical',  color: 'var(--red)'   },
              { id: 'high',     label: 'High',      color: 'var(--orange)'},
              { id: 'medium',   label: 'Medium',    color: 'var(--yellow)'},
              { id: 'low',      label: 'Low',       color: 'var(--accent)'},
            ].map(s => (
              <FilterRow key={s.id} active={filters.severity === s.id}
                onClick={() => setFilter('severity', s.id)} color={s.color}>
                {s.label}
              </FilterRow>
            ))}
          </Section>

          <Section label="REGION">
            {REGIONS.map(r => (
              <FilterRow key={r} active={filters.region === r}
                onClick={() => setFilter('region', r)}>
                {r === 'all' ? 'All regions' : r}
              </FilterRow>
            ))}
          </Section>

          <Section label="WATCHLIST">
            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
              <input value={watchInput} onChange={e => setWatchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTerm()}
                placeholder="+ add term" className="inp"
                style={{ fontSize: '10px', padding: '3px 7px' }} />
              <button className="btn btn-accent" style={{ padding: '3px 7px', fontSize: '10px' }} onClick={addTerm}>+</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {watchlist.map(t => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px',
                  fontFamily: 'JetBrains Mono', fontSize: '9px', padding: '2px 5px',
                  background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.2)',
                  borderRadius: '3px', color: 'var(--accent)' }}>
                  {t}
                  <button onClick={() => removeWatch(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.12em', marginBottom: '4px' }}>{label}</div>
      {children}
    </div>
  )
}

function FilterRow({ active, onClick, color, children }) {
  return (
    <button onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '4px 6px', borderRadius: '2px', cursor: 'pointer', border: 'none',
      fontFamily: 'Inter, sans-serif', fontSize: '11px',
      background: active ? `${color || 'var(--accent)'}12` : 'transparent',
      color: active ? (color || 'var(--accent)') : 'var(--t3)',
    }}>{children}</button>
  )
}
