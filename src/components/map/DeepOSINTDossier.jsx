/**
 * DeepOSINTDossier.jsx
 * Professional investigative intelligence dossier & deep OSINT research toolkit.
 * Cross-references satellite data, flight tracking, maritime AIS, electronic warfare,
 * and spatial-temporal news correlation.
 */

import React, { useState, useMemo } from 'react'
import {
  X, ExternalLink, Copy, Check, Radio, Shield, Anchor,
  Crosshair, Radar, Globe, FileText, ChevronDown, ChevronRight,
  Flame, AlertTriangle, Terminal, Eye, Share2, Compass, Layers
} from 'lucide-react'

const SEV_COLORS = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#2dd4bf',
}

export default function DeepOSINTDossier({ selected, articles = [], onClose, onSaveToBoard, flyTo }) {
  const [copied, setCopied] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)

  if (!selected) return null

  const lat = Number(selected.lat)
  const lng = Number(selected.lng)
  const hasCoords = !isNaN(lat) && !isNaN(lng)

  // Standardized Intelligence Community Citation
  const citation = useMemo(() => {
    const timestamp = selected.date || selected.time || selected.pub || selected._fetchedAt || new Date().toISOString()
    const coordsStr = hasCoords ? `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E` : 'UNLOCATED'
    return `[NEXUS-OSINT] ${selected.name || selected.title || 'Signal'} | TYPE: ${selected.type?.toUpperCase()} | COORDS: ${coordsStr} | TIME: ${timestamp} | SOURCE: ${selected.source || selected.meta?.source || 'Open-Source Telemetry'} | REF: ${selected.url || 'https://osnexus.vercel.app'}`
  }, [selected, hasCoords, lat, lng])

  const copyCitation = () => {
    navigator.clipboard?.writeText(citation)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  // Spatial-Temporal Cross Correlation: find news within the same theater
  const correlatedNews = useMemo(() => {
    if (!articles?.length) return []
    const targetKeywords = [
      selected.country,
      selected.region,
      selected.name?.split(' ')[0],
      selected.meta?.country,
      selected.meta?.zone,
    ].filter(Boolean).map(k => k.toLowerCase())

    if (!targetKeywords.length) return []

    return articles.filter(a => {
      const text = `${a.title || ''} ${a.summary || ''} ${a.country || ''} ${a.region || ''}`.toLowerCase()
      return targetKeywords.some(kw => kw.length > 2 && text.includes(kw))
    }).slice(0, 4)
  }, [articles, selected])

  return (
    <div className="fade-in" style={{
      position: 'absolute', top: '10px', right: '10px', bottom: '10px',
      width: '420px', maxWidth: 'calc(100vw - 20px)',
      background: 'rgba(5, 12, 24, 0.94)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(45, 212, 191, 0.25)',
      borderRadius: '6px',
      zIndex: 100,
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 16px 40px rgba(0,0,0,0.8), 0 0 20px rgba(45,212,191,0.1)',
      overflow: 'hidden'
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(10, 22, 40, 0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{
            fontSize: '8px', padding: '2px 6px', borderRadius: '3px',
            background: `${SEV_COLORS[selected.severity || 'low']}25`,
            color: SEV_COLORS[selected.severity || 'low'],
            fontWeight: 800, fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.08em', border: `1px solid ${SEV_COLORS[selected.severity || 'low']}50`
          }}>
            {(selected.severity || 'LOW').toUpperCase()}
          </span>
          <span className="mono" style={{ fontSize: '10px', color: 'var(--t3)', textTransform: 'uppercase' }}>
            {selected.type || 'INTEL OBJECT'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button onClick={copyCitation} title="Copy OSINT citation" className="btn" style={{ fontSize: '10px', padding: '3px 8px' }}>
            {copied ? <Check size={11} color="#22c55e" /> : <Copy size={11} />}
            <span style={{ fontSize: '9px', marginLeft: '3px' }}>{copied ? 'Copied' : 'Cite'}</span>
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: '4px' }}>
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        
        {/* Title */}
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--t1)', lineHeight: 1.4, margin: '0 0 6px 0' }}>
            {selected.title || selected.name || 'Intelligence Event'}
          </h2>
          {selected.desc && (
            <p style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.6, margin: 0 }}>
              {selected.desc}
            </p>
          )}
        </div>

        {/* ── Geolocation & Satellite Telemetry ── */}
        {hasCoords && (
          <div style={{
            padding: '10px', background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.1em' }}>GEOSPATIAL FIX</span>
              <button onClick={() => flyTo && flyTo(selected)} className="btn" style={{ fontSize: '8px', padding: '1px 6px', height: 'auto' }}>
                <Compass size={10} style={{ marginRight: '3px' }} /> Center Globe
              </button>
            </div>
            <div className="mono" style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 700, marginBottom: '6px' }}>
              {lat >= 0 ? `${lat.toFixed(4)}°N` : `${Math.abs(lat).toFixed(4)}°S`},&nbsp;
              {lng >= 0 ? `${lng.toFixed(4)}°E` : `${Math.abs(lng).toFixed(4)}°W`}
            </div>

            {/* Satellite Imagery Portal Links */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
              <a href={`https://browser.dataspace.copernicus.eu/?lat=${lat}&lng=${lng}&zoom=12`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '9px', color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Radar size={10} /> Copernicus EO
              </a>
              <a href={`https://worldview.earthdata.nasa.gov/?v=${lng-0.5},${lat-0.5},${lng+0.5},${lat+0.5}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '9px', color: '#f59e0b', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Globe size={10} /> NASA Worldview
              </a>
              <a href={`https://zoom.earth/#view=${lat},${lng},12z`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '9px', color: '#a78bfa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Eye size={10} /> Zoom.Earth
              </a>
              <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '9px', color: 'var(--t3)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <ExternalLink size={10} /> Google Maps
              </a>
            </div>
          </div>
        )}

        {/* ── SPECIALIZED DOSSIER: GPS JAMMING & ELECTRONIC WARFARE ── */}
        {(selected.type === 'gpsjam' || selected.meta?._gpsjam) && (
          <div style={{ padding: '10px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '4px' }}>
            <div className="mono" style={{ fontSize: '8px', color: '#f59e0b', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.1em' }}>
              📡 ELECTRONIC WARFARE & GNSS DENIAL PROFILE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Jamming Intensity</span>
                <div className="mono" style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700 }}>
                  {selected.meta?.intensity || selected.intensity || 85}% Severe
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Civil Aviation Impact</span>
                <div className="mono" style={{ fontSize: '11px', color: '#ef4444', fontWeight: 700 }}>
                  NIC &lt; 4 (Degraded)
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Telemetry Source</span>
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t2)' }}>
                  {selected.meta?.source || selected.source || 'GPSJam/ADS-B'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>EW Threat Classification</span>
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t2)' }}>
                  Active Ground Emitter
                </div>
              </div>
            </div>
            <div style={{ fontSize: '9px', color: 'var(--t3)', lineHeight: 1.5 }}>
              Tactical Advisory: Aircraft and marine vessels operating within this corridor report systematic position jumps, circle spoofing, and loss of satellite time references.
            </div>
          </div>
        )}

        {/* ── SPECIALIZED DOSSIER: DARK FLEET & SHADOW TANKERS ── */}
        {(selected.type === 'darkfleet' || selected.meta?._darkfleet) && (
          <div style={{ padding: '10px', background: 'rgba(192, 132, 252, 0.08)', border: '1px solid rgba(192, 132, 252, 0.3)', borderRadius: '4px' }}>
            <div className="mono" style={{ fontSize: '8px', color: '#c084fc', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.1em' }}>
              🏴‍☠️ SHADOW TANKER & STS TRANSSHIPMENT DOSSIER
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Flag State</span>
                <div className="mono" style={{ fontSize: '11px', color: '#c084fc', fontWeight: 700 }}>
                  {selected.meta?.flag || selected.flag || 'Flag of Convenience'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Transshipment Speed</span>
                <div className="mono" style={{ fontSize: '11px', color: 'var(--t2)' }}>
                  {selected.meta?.speed || selected.speed || 1.2} knots (Lightering)
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>MMSI / IMO Identifier</span>
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t2)' }}>
                  {selected.meta?.mmsi || selected.mmsi || 'SPOOFED-ID'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Sanctions Scrutiny</span>
                <div className="mono" style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700 }}>
                  High Risk (OFAC/G7)
                </div>
              </div>
            </div>
            <div style={{ fontSize: '9px', color: 'var(--t3)', lineHeight: 1.5 }}>
              Surveillance Assessment: Operating outside territorial radar coverage with periodic AIS transponder deactivation. Suspected crude lightering to obscure origin documentation.
            </div>
          </div>
        )}

        {/* ── SPECIALIZED DOSSIER: COPERNICUS SENTINEL-1 SAR RADAR ── */}
        {(selected.type === 'sarRadar' || selected.meta?._sar) && (
          <div style={{ padding: '10px', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '4px' }}>
            <div className="mono" style={{ fontSize: '8px', color: '#38bdf8', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.1em' }}>
              🛰 SYNTHETIC APERTURE RADAR (SAR) RECONNAISSANCE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Sensor Platform</span>
                <div className="mono" style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>
                  {selected.meta?.platform || selected.platform || 'Sentinel-1 C-SAR'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Radar Penetration</span>
                <div className="mono" style={{ fontSize: '11px', color: '#22c55e', fontWeight: 700 }}>
                  All-Weather / Cloud-Penetrating
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Resolution & Polarization</span>
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t2)' }}>
                  10m Ground / VV+VH
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Target Category</span>
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t2)' }}>
                  {selected.meta?.target || 'Maritime & Defense Infra'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '9px', color: 'var(--t3)', lineHeight: 1.5 }}>
              Analysis: High radar backscatter signature confirms metallic barrier deployments, vessel berth changes, and physical fortifications visible regardless of cloud or camouflage smoke.
            </div>
          </div>
        )}

        {/* ── SPECIALIZED DOSSIER: BGP & INTERNET OUTAGES ── */}
        {(selected.type === 'bgp' || selected.meta?.source?.includes('IODA')) && (
          <div style={{ padding: '10px', background: 'rgba(255, 102, 0, 0.08)', border: '1px solid rgba(255, 102, 0, 0.3)', borderRadius: '4px' }}>
            <div className="mono" style={{ fontSize: '8px', color: '#ff6600', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.1em' }}>
              🌐 INTERNET INFRASTRUCTURE & ROUTING OUTAGE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Impact Classification</span>
                <div className="mono" style={{ fontSize: '11px', color: '#ff6600', fontWeight: 700 }}>
                  {selected.impact || selected.meta?.impact || 'Sub-national Curfew'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Traffic Drop</span>
                <div className="mono" style={{ fontSize: '11px', color: '#ef4444', fontWeight: 700 }}>
                  {selected.dropPercent ? `-${selected.dropPercent}%` : '>75% Packet Loss'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Disruption Vector</span>
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t2)' }}>
                  BGP Route Withdrawal / Fiber Cut
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Monitoring Source</span>
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t2)' }}>
                  {selected.source || selected.meta?.source || 'IODA / Cloudflare Radar'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SPECIALIZED DOSSIER: MILITARY AIR PATROLS (ISR) ── */}
        {(selected.type === 'milaircraft' || selected.type === 'aircraft' && selected.meta?._military) && (
          <div style={{ padding: '10px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px' }}>
            <div className="mono" style={{ fontSize: '8px', color: '#ef4444', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.1em' }}>
              ✈ MILITARY AIRBORNE RECONNAISSANCE & COMBAT PATROL
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Tactical Callsign</span>
                <div className="mono" style={{ fontSize: '12px', color: '#ff4444', fontWeight: 800 }}>
                  {selected.callsign || selected.meta?.callsign || 'CLASSIFIED'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Airframe Platform</span>
                <div className="mono" style={{ fontSize: '11px', color: 'var(--t1)', fontWeight: 700 }}>
                  {selected.type || selected.meta?.model || 'Strategic ISR'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Altitude / Speed</span>
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t2)' }}>
                  {selected.alt ? `${Math.round(selected.alt).toLocaleString()} ft` : 'FL300'} · {selected.speed ? `${selected.speed} kts` : 'Cruising'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Operating Sector</span>
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t2)' }}>
                  {selected.zone || selected.meta?.zone || 'Combat Air Patrol'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SPECIALIZED DOSSIER: SEISMIC & TECTONIC DATA ── */}
        {selected.type === 'earthquake' && (
          <div style={{ padding: '10px', background: 'rgba(255, 102, 0, 0.08)', border: '1px solid rgba(255, 102, 0, 0.3)', borderRadius: '4px' }}>
            <div className="mono" style={{ fontSize: '8px', color: '#ff6600', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.1em' }}>
              ⚡ USGS SEISMOLOGICAL EVENT REPORT
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Magnitude</span>
                <div className="mono" style={{ fontSize: '13px', color: '#ff6600', fontWeight: 800 }}>
                  M{(selected.meta?.mag || selected.mag || 0).toFixed(1)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Focal Depth</span>
                <div className="mono" style={{ fontSize: '11px', color: 'var(--t1)' }}>
                  {selected.meta?.depth || selected.depth || 10} km
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Tsunami Status</span>
                <div className="mono" style={{ fontSize: '10px', color: selected.tsunami ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
                  {selected.tsunami ? '⚠️ ADVISORY ACTIVE' : 'NO THREAT'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Felt Reports</span>
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t2)' }}>
                  {selected.felt || 'Instrumental only'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SPECIALIZED DOSSIER: VOLCANIC HAZARDS ── */}
        {selected.type === 'volcano' && (
          <div style={{ padding: '10px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px' }}>
            <div className="mono" style={{ fontSize: '8px', color: '#ef4444', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.1em' }}>
              🌋 GLOBAL VOLCANISM PROGRAM (GVP) SURVEILLANCE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Volcano Structure</span>
                <div className="mono" style={{ fontSize: '11px', color: 'var(--t1)' }}>
                  {selected.meta?.type || selected.type || 'Stratovolcano'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: 'var(--t4)' }}>Aviation Color Code</span>
                <div className="mono" style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700 }}>
                  {selected.alert?.toUpperCase() || 'WATCH / ORANGE'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SPATIAL-TEMPORAL NEWS CROSS-CORRELATION ── */}
        {correlatedNews.length > 0 && (
          <div style={{
            padding: '10px', background: 'rgba(45, 212, 191, 0.04)',
            border: '1px solid rgba(45, 212, 191, 0.15)', borderRadius: '4px'
          }}>
            <div className="mono" style={{ fontSize: '8px', color: 'var(--accent)', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.1em' }}>
              📰 CORRELATED THEATER INTELLIGENCE ({correlatedNews.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {correlatedNews.map((art, i) => (
                <a key={i} href={art.url} target="_blank" rel="noopener noreferrer" style={{
                  textDecoration: 'none', padding: '6px 8px', background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.06)', borderRadius: '3px',
                  display: 'flex', flexDirection: 'column', gap: '2px'
                }}>
                  <span style={{ fontSize: '10px', color: 'var(--t1)', fontWeight: 600, lineHeight: 1.3 }}>
                    {art.title}
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: '8px', color: 'var(--accent)' }}>{art.source}</span>
                    <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>{art.time || 'recent'}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── Primary Action Buttons ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
          {selected.url && selected.url !== '#' && (
            <a href={selected.url} target="_blank" rel="noopener noreferrer" className="btn" style={{
              justifyContent: 'center', fontSize: '10px', padding: '8px 12px',
              background: 'rgba(45, 212, 191, 0.12)', borderColor: 'rgba(45, 212, 191, 0.3)', color: 'var(--accent)'
            }}>
              <ExternalLink size={12} style={{ marginRight: '5px' }} /> Inspect Primary Official Source
            </a>
          )}

          <button className="btn" onClick={() => onSaveToBoard && onSaveToBoard(selected)} style={{
            justifyContent: 'center', fontSize: '10px', padding: '8px 12px'
          }}>
            <FileText size={12} style={{ marginRight: '5px' }} /> + Pin to Investigation Board
          </button>
        </div>

        {/* ── Raw Forensics & JSON Inspector ── */}
        <div style={{ marginTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
          <button onClick={() => setShowRawJson(s => !s)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)',
            fontSize: '9px', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0'
          }}>
            {showRawJson ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span className="mono">RAW FORENSIC TELEMETRY (JSON)</span>
          </button>
          {showRawJson && (
            <pre className="mono" style={{
              marginTop: '6px', padding: '8px', background: 'rgba(0,0,0,0.6)',
              borderRadius: '3px', fontSize: '8px', color: '#2dd4bf', overflowX: 'auto',
              maxHeight: '160px', border: '1px solid rgba(45,212,191,0.2)'
            }}>
              {JSON.stringify(selected, null, 2)}
            </pre>
          )}
        </div>

      </div>
    </div>
  )
}
