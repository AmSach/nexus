import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useStore } from '../../store'
import { useGroq } from '../../hooks/useGroq'
import { useEntityIntel } from '../../hooks/useEntityIntel'
import { useSatellite } from '../../hooks/useSatellite'
import { NODE_TYPES, EDGE_TYPES } from '../../data/constants'
import { Plus, Trash2, Download, ZoomIn, ZoomOut, Maximize2, X, Brain, Lightbulb, Clock, Edit3, Loader, GitBranch, ChevronDown } from 'lucide-react'

const NODE_R = 32

function getNodeColor(type) {
  return NODE_TYPES.find(t => t.type === type)?.color || '#94a3b8'
}
function getNodeIcon(type) {
  return NODE_TYPES.find(t => t.type === type)?.icon || '◈'
}

// ── Node renderer ────────────────────────────────────────────────────────────
function BoardNode({ node, selected, connecting, onDown, onDblClick, onHover }) {
  const color = getNodeColor(node.type)
  const icon  = getNodeIcon(node.type)
  const glow  = selected
    ? `drop-shadow(0 0 10px ${color}aa)`
    : `drop-shadow(0 0 4px ${color}44)`
  // Show up to 18 chars on the node — two lines if needed
  const fullLabel = node.label
  const line1 = fullLabel.length > 14 ? fullLabel.slice(0, 14) : fullLabel
  const line2 = fullLabel.length > 14 ? (fullLabel.slice(14, 26) + (fullLabel.length > 26 ? '…' : '')) : null

  return (
    <g transform={`translate(${node.x},${node.y})`}
      onMouseDown={onDown}
      onDoubleClick={onDblClick}
      onContextMenu={e => { e.preventDefault(); onDown && onDown(e) }}
      onMouseEnter={e => onHover && onHover(node, e)}
      onMouseLeave={() => onHover && onHover(null, null)}
      style={{ cursor: connecting ? 'crosshair' : 'grab' }}>
      {/* Selection ring */}
      {selected && <circle r={NODE_R + 10} fill="none" stroke={color} strokeWidth={1.5} opacity={0.3} />}
      {/* Main circle */}
      <circle r={NODE_R} fill="var(--panel)" stroke={color}
        strokeWidth={selected ? 2.5 : 1.5} style={{ filter: glow }} />
      {/* Icon */}
      <text y={-8} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: '18px', userSelect: 'none', pointerEvents: 'none' }}>
        {icon}
      </text>
      {/* Label line 1 */}
      <text y={line2 ? 8 : 12} textAnchor="middle"
        style={{ fontFamily: 'JetBrains Mono', fontSize: '9px', fill: 'var(--t1)', fontWeight: 600, userSelect: 'none', pointerEvents: 'none' }}>
        {line1}
      </text>
      {/* Label line 2 */}
      {line2 && (
        <text y={19} textAnchor="middle"
          style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', fill: 'var(--t2)', userSelect: 'none', pointerEvents: 'none' }}>
          {line2}
        </text>
      )}
      {/* Type badge */}
      <text y={line2 ? 30 : 25} textAnchor="middle"
        style={{ fontFamily: 'JetBrains Mono', fontSize: '7px', fill: color, opacity: 0.85, userSelect: 'none', pointerEvents: 'none' }}>
        {node.type}
      </text>
    </g>
  )
}

export default function IntelBoard() {
  const { boards, activeBoard, setActiveBoard, addBoard, deleteBoard, addNode, updateNode, deleteNode, addEdge, deleteEdge, clearBoard, setBoardNotes, _board } = useStore()
  const { analyzeBoard, suggestLinks, buildTimeline, loading: aiLoading, error: aiError, hasKey } = useGroq()
  const { enrich, loading: enrichLoading, progress: enrichProgress, result: enrichResult, error: enrichError, clear: clearEnrich, srcStatus: enrichSrcStatus } = useEntityIntel()
  const { data: satData } = useSatellite()
  const [enrichTarget, setEnrichTarget] = useState(null) // node being enriched

  const board  = _board()
  const nodes  = board?.nodes || []
  const edges  = board?.edges || []

  const svgRef = useRef(null)
  const [zoom,      setZoom]      = useState(1)
  const [pan,       setPan]       = useState({ x: 0, y: 0 })
  const [dragging,  setDragging]  = useState(null)
  const [panning,   setPanning]   = useState(null)
  const [selNode,   setSelNode]   = useState(null)
  const [selEdge,   setSelEdge]   = useState(null)
  const [connecting,setConnecting]= useState(null)
  const [addModal,  setAddModal]  = useState(false)
  const [editModal, setEditModal] = useState(null)
  const [edgeModal, setEdgeModal] = useState(null)
  const [rightTab,  setRightTab]  = useState('inspect')
  const [aiText,    setAiText]    = useState('')
  const [aiMode,    setAiMode]    = useState('')
  const [boardMenu, setBoardMenu] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [hoveredNode, setHoveredNode] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [contextMenu, setContextMenu] = useState(null) // { x, y, nodeId }

  const selNodeObj = nodes.find(n => n.id === selNode)
  const selEdgeObj = edges.find(e => e.id === selEdge)

  // Wheel zoom
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handler = e => {
      e.preventDefault()
      setZoom(z => Math.max(0.15, Math.min(4, z * (e.deltaY < 0 ? 1.1 : 0.91))))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const onNodeDown = useCallback((e, id) => {
    e.stopPropagation()
    // Right-click → context menu
    if (e.button === 2) {
      e.preventDefault()
      const rect = svgRef.current?.getBoundingClientRect()
      setContextMenu({ x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0), nodeId: id })
      setSelNode(id)
      return
    }
    if (connecting) {
      if (connecting !== id) setEdgeModal({ src: connecting, tgt: id })
      setConnecting(null)
      return
    }
    const n = nodes.find(x => x.id === id)
    setDragging({ id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y })
    setSelNode(id); setSelEdge(null)
  }, [connecting, nodes])

  const onNodeDblClick = useCallback((e, id) => {
    e.stopPropagation()
    const n = nodes.find(x => x.id === id)
    if (n) setEditModal(n)
  }, [nodes])

  const onSvgDown = useCallback(e => {
    if (connecting) { setConnecting(null); return }
    if (e.target === svgRef.current || e.target.tagName === 'rect') {
      setPanning({ sx: e.clientX - pan.x, sy: e.clientY - pan.y })
      setSelNode(null); setSelEdge(null)
    }
  }, [connecting, pan])

  const onMove = useCallback(e => {
    if (dragging) {
      const dx = (e.clientX - dragging.sx) / zoom
      const dy = (e.clientY - dragging.sy) / zoom
      updateNode(dragging.id, { x: dragging.ox + dx, y: dragging.oy + dy })
    } else if (panning) {
      setPan({ x: e.clientX - panning.sx, y: e.clientY - panning.sy })
    }
  }, [dragging, panning, zoom, updateNode])

  const onUp = useCallback(() => { setDragging(null); setPanning(null) }, [])

  const confirmEdge = type => {
    const et = EDGE_TYPES.find(x => x.type === type)
    addEdge({ src: edgeModal.src, tgt: edgeModal.tgt, type, label: et?.label || type, color: et?.color || '#334155', dash: et?.dash || false })
    setEdgeModal(null)
  }

  const runAI = async mode => {
    setRightTab('ai'); setAiMode(mode); setAiText('')
    if (mode === 'analyze')  await analyzeBoard(nodes, edges, t => setAiText(t))
    if (mode === 'suggest')  await suggestLinks(nodes, t => setAiText(t))
    if (mode === 'timeline') await buildTimeline(nodes, t => setAiText(t))
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ nodes, edges, notes: board.notes }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `nexus-${board.name.replace(/\s+/g,'-')}.json`; a.click()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--void)' }}>
      {/* Toolbar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderBottom: '1px solid var(--border)', background: 'var(--base)', flexWrap: 'wrap' }}>
        {/* Board selector */}
        <div style={{ position: 'relative' }}>
          <button className="btn" style={{ fontSize: '10px' }} onClick={() => setBoardMenu(o => !o)}>
            <GitBranch size={11} /> {board?.name} <ChevronDown size={9} />
          </button>
          {boardMenu && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: '200px', background: 'var(--raised)', border: '1px solid var(--border2)', borderRadius: '3px', zIndex: 50, boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}>
              {boards.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                  <button onClick={() => { setActiveBoard(b.id); setBoardMenu(false) }}
                    style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter', fontSize: '11px', color: b.id === activeBoard ? 'var(--accent)' : 'var(--t2)' }}>
                    {b.name} <span style={{ color: 'var(--t4)' }}>({b.nodes.length})</span>
                  </button>
                  {boards.length > 1 && (
                    <button onClick={() => deleteBoard(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)' }}><X size={10}/></button>
                  )}
                </div>
              ))}
              <div style={{ padding: '6px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input value={newBoardName} onChange={e => setNewBoardName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newBoardName.trim()) { addBoard(newBoardName.trim()); setNewBoardName(''); setBoardMenu(false) } }}
                    placeholder="New board…" className="inp" style={{ fontSize: '10px', padding: '3px 6px' }} />
                  <button className="btn btn-accent" style={{ padding: '3px 6px', fontSize: '10px' }}
                    onClick={() => { if (newBoardName.trim()) { addBoard(newBoardName.trim()); setNewBoardName(''); setBoardMenu(false) } }}>+</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />

        <button className="btn btn-accent" style={{ fontSize: '10px' }} onClick={() => setAddModal(true)}>
          <Plus size={11} /> node
        </button>
        <button className="btn" style={{ fontSize: '10px' }}
          disabled={!selNode}
          onClick={() => selNode && setConnecting(selNode)}>
          {connecting ? <span style={{ color: 'var(--orange)' }}>click target…</span> : '◈ connect'}
        </button>
        {selNode && (
          <>
            <button className="btn" style={{ fontSize: '10px' }} onClick={() => setEditModal(selNodeObj)}>
              <Edit3 size={10} /> edit
            </button>
            <button className="btn btn-danger" style={{ fontSize: '10px' }} onClick={() => { deleteNode(selNode); setSelNode(null) }}>
              <Trash2 size={10} />
            </button>
          </>
        )}

        <div style={{ flex: 1 }} />

        {hasKey && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className="btn btn-accent" style={{ fontSize: '10px' }} onClick={() => runAI('analyze')} disabled={aiLoading}>
              <Brain size={10} /> {aiLoading && aiMode === 'analyze' ? '…' : 'analyze'}
            </button>
            <button className="btn" style={{ fontSize: '10px' }} onClick={() => runAI('suggest')} disabled={aiLoading || nodes.length < 2}>
              <Lightbulb size={10} /> suggest
            </button>
            <button className="btn" style={{ fontSize: '10px' }} onClick={() => runAI('timeline')} disabled={aiLoading || nodes.length === 0}>
              <Clock size={10} /> timeline
            </button>
          </div>
        )}
        {!hasKey && <span className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>add Groq key for AI</span>}

        <div style={{ display: 'flex', gap: '3px' }}>
          <button className="btn" style={{ padding: '4px 6px' }} onClick={() => setZoom(z => Math.min(4, z * 1.15))}><ZoomIn size={11}/></button>
          <button className="btn" style={{ padding: '4px 6px' }} onClick={() => setZoom(z => Math.max(0.15, z * 0.87))}><ZoomOut size={11}/></button>
          <button className="btn" style={{ padding: '4px 6px' }} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}><Maximize2 size={11}/></button>
          <button className="btn" style={{ padding: '4px 6px' }} onClick={exportJSON}><Download size={11}/></button>
          <button className="btn btn-danger" style={{ padding: '4px 6px', fontSize: '9px' }}
            onClick={() => window.confirm('Clear board?') && (clearBoard(), setSelNode(null), setSelEdge(null))}>
            ✕
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <svg ref={svgRef} style={{ width: '100%', height: '100%', background: 'var(--void)', cursor: panning ? 'grabbing' : connecting ? 'crosshair' : 'default' }}
            onMouseDown={onSvgDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
            <defs>
              <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"
                patternTransform={`translate(${pan.x % 24},${pan.y % 24})`}>
                <circle cx="12" cy="12" r="0.6" fill="var(--border)" />
              </pattern>
              {EDGE_TYPES.map(et => (
                <marker key={et.type} id={`arr-${et.type}`} markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
                  <polygon points="0 0,7 2.5,0 5" fill={et.color} />
                </marker>
              ))}
            </defs>

            <rect width="100%" height="100%" fill="url(#dots)" />

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {edges.map(edge => {
                const src = nodes.find(n => n.id === edge.src)
                const tgt = nodes.find(n => n.id === edge.tgt)
                if (!src || !tgt) return null
                const mx = (src.x + tgt.x) / 2
                const my = (src.y + tgt.y) / 2
                const dx = tgt.x - src.x, dy = tgt.y - src.y
                const cp = `${src.x + dx * 0.3 + dy * 0.12} ${src.y + dy * 0.3 - dx * 0.12}`
                const isSel = selEdge === edge.id
                return (
                  <g key={edge.id} style={{ cursor: 'pointer' }} onClick={() => setSelEdge(isSel ? null : edge.id)}>
                    <path d={`M ${src.x} ${src.y} Q ${cp} ${tgt.x} ${tgt.y}`}
                      fill="none" stroke={isSel ? '#fff' : edge.color} strokeWidth={isSel ? 2 : 1.5}
                      strokeDasharray={edge.dash ? '5 3' : undefined}
                      markerEnd={`url(#arr-${edge.type})`} opacity={0.75} />
                    <rect x={mx - 35} y={my - 9} width={70} height={16} rx={2} fill="var(--void)" stroke={edge.color} strokeWidth={0.5} opacity={0.9} />
                    <text x={mx} y={my + 4} textAnchor="middle" style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', fill: edge.color }}>
                      {edge.label}
                    </text>
                    {isSel && (
                      <g onClick={e => { e.stopPropagation(); deleteEdge(edge.id); setSelEdge(null) }}>
                        <circle cx={mx + 38} cy={my - 7} r={6} fill="var(--red)" style={{ cursor: 'pointer' }} />
                        <text x={mx + 38} y={my - 3} textAnchor="middle" style={{ fontSize: '9px', fill: '#fff' }}>×</text>
                      </g>
                    )}
                  </g>
                )
              })}

              {/* Nodes */}
              {nodes.map(node => (
                <BoardNode key={node.id} node={node}
                  selected={selNode === node.id}
                  connecting={!!connecting}
                  onDown={e => onNodeDown(e, node.id)}
                  onDblClick={e => onNodeDblClick(e, node.id)}
                  onHover={(n, e) => {
                    if (!n) { setHoveredNode(null); return }
                    const rect = svgRef.current?.getBoundingClientRect()
                    if (rect) setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 10 })
                    setHoveredNode(n)
                  }} />
              ))}
            </g>
          </svg>

          {/* ── Hover tooltip ─────────────────────────────────────── */}
          {hoveredNode && !contextMenu && (
            <div style={{
              position: 'absolute',
              left: tooltipPos.x, top: tooltipPos.y,
              maxWidth: '260px', zIndex: 50,
              background: 'var(--raised)', border: '1px solid var(--border2)',
              borderRadius: '4px', padding: '8px 10px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
              borderLeft: `3px solid ${getNodeColor(hoveredNode.type)}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '14px' }}>{getNodeIcon(hoveredNode.type)}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--t1)', lineHeight: 1.3 }}>
                  {hoveredNode.label}
                </span>
              </div>
              <div className="mono" style={{ fontSize: '8px', color: getNodeColor(hoveredNode.type), marginBottom: hoveredNode.detail ? '5px' : 0 }}>
                {hoveredNode.type}
              </div>
              {hoveredNode.detail && (
                <p style={{ fontSize: '10px', color: 'var(--t2)', lineHeight: 1.6, marginBottom: hoveredNode.source ? '4px' : 0 }}>
                  {hoveredNode.detail.slice(0, 180)}{hoveredNode.detail.length > 180 ? '…' : ''}
                </p>
              )}
              {hoveredNode.source && (
                <div className="mono" style={{ fontSize: '8px', color: 'var(--accent)' }}>
                  {hoveredNode.source}
                </div>
              )}
            </div>
          )}

          {/* ── Right-click context menu ──────────────────────────── */}
          {contextMenu && (() => {
            const ctxNode = nodes.find(n => n.id === contextMenu.nodeId)
            if (!ctxNode) return null
            const color = getNodeColor(ctxNode.type)
            return (
              <div
                style={{
                  position: 'absolute', left: contextMenu.x, top: contextMenu.y,
                  zIndex: 100, background: 'var(--raised)',
                  border: '1px solid var(--border2)', borderRadius: '4px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  minWidth: '180px', overflow: 'hidden',
                }}
                onMouseLeave={() => setContextMenu(null)}
              >
                {/* Header */}
                <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', background: 'var(--panel)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px' }}>{getNodeIcon(ctxNode.type)}</span>
                  <span style={{ fontSize: '10px', fontWeight: 600, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
                    {ctxNode.label}
                  </span>
                </div>
                {/* Actions */}
                {[
                  { label: 'Edit details', icon: '✏️', action: () => { setEditModal(ctxNode); setContextMenu(null) } },
                  { label: 'Connect to…', icon: '🔗', action: () => { setConnecting(ctxNode.id); setContextMenu(null) } },
                  { label: ctxNode.url && ctxNode.url !== '#' ? 'Open source ↗' : null, icon: '🔗', action: () => { window.open(ctxNode.url, '_blank'); setContextMenu(null) }, url: true },
                  { label: 'Duplicate', icon: '⧉', action: () => {
                    addNode({ ...ctxNode, id: undefined, x: ctxNode.x + 60, y: ctxNode.y + 60, label: ctxNode.label + ' (copy)' })
                    setContextMenu(null)
                  }},
                  { label: '─', divider: true },
                  { label: 'Delete node', icon: '🗑', danger: true, action: () => { deleteNode(ctxNode.id); setSelNode(null); setContextMenu(null) } },
                ].filter(item => item.label !== null && (item.label !== '─' || item.divider)).map((item, i) => {
                  if (item.divider) return <div key={i} style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                  if (item.url && (!ctxNode.url || ctxNode.url === '#')) return null
                  return (
                    <button key={i} onClick={item.action}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        width: '100%', padding: '7px 12px', border: 'none',
                        background: 'transparent', cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif', fontSize: '11px',
                        color: item.danger ? 'var(--red)' : 'var(--t2)',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'rgba(239,68,68,0.1)' : 'var(--hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontSize: '12px' }}>{item.icon}</span>
                      {item.label}
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {/* Empty state */}
          {nodes.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', gap: '8px' }}>
              <div style={{ opacity: 0.08, fontSize: '48px' }}>◈</div>
              <p style={{ color: 'var(--t4)', fontSize: '12px' }}>Board empty — add nodes or import from articles in the Feed</p>
            </div>
          )}

          {/* Zoom indicator */}
          <div className="mono" style={{ position: 'absolute', bottom: '10px', left: '10px', fontSize: '9px', color: 'var(--t4)', background: 'var(--base)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: '2px' }}>
            {nodes.length}n · {edges.length}e · {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: '260px', flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--base)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Panel tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {[{ id: 'inspect', l: 'Inspector' }, { id: 'intel', l: 'Entity Intel' }, { id: 'ai', l: 'AI' }, { id: 'notes', l: 'Notes' }].map(t => (
              <button key={t.id} onClick={() => setRightTab(t.id)}
                style={{ flex: 1, padding: '7px 4px', border: 'none', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: '9px', letterSpacing: '0.05em',
                  background: rightTab === t.id ? 'rgba(45,212,191,0.06)' : 'transparent',
                  borderBottom: rightTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                  color: rightTab === t.id ? 'var(--accent)' : 'var(--t3)' }}>
                {t.l}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {/* Inspector */}
            {rightTab === 'inspect' && (
              <>
                {selNodeObj && <NodeInspector node={selNodeObj} nodes={nodes} edges={edges} onConnect={() => setConnecting(selNodeObj.id)} onEdit={() => setEditModal(selNodeObj)} onDelete={() => { deleteNode(selNode); setSelNode(null) }}
                  onEnrich={() => { setRightTab('intel'); setEnrichTarget(selNodeObj); enrich(selNodeObj.label) }} />}
                {selEdgeObj && !selNodeObj && <EdgeInspector edge={selEdgeObj} nodes={nodes} onDelete={() => { deleteEdge(selEdge); setSelEdge(null) }} />}
                {!selNodeObj && !selEdgeObj && <BoardStats nodes={nodes} edges={edges} />}
              </>
            )}

            {/* Entity Intel */}
            {rightTab === 'intel' && (
              <EntityIntelPanel
                node={selNodeObj || enrichTarget}
                loading={enrichLoading}
                progress={enrichProgress}
                result={enrichResult}
                error={enrichError}
                srcStatus={enrichSrcStatus}
                onSearch={(name) => { setEnrichTarget({ label: name }); enrich(name) }}
                onClear={clearEnrich}
                onAddNode={(nodeData) => addNode({ ...nodeData, x: 250 + Math.random() * 400, y: 150 + Math.random() * 300 })}
              />
            )}

            {/* AI */}
            {rightTab === 'ai' && (
              <div>
                {!hasKey && (
                  <div style={{ fontSize: '11px', color: 'var(--orange)', padding: '10px', background: 'rgba(249,115,22,0.08)', borderRadius: '3px', marginBottom: '10px' }}>
                    Add Groq API key in Settings to enable AI.
                  </div>
                )}
                {hasKey && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
                    {[
                      { mode: 'analyze',  label: 'Analyze board',       Icon: Brain      },
                      { mode: 'suggest',  label: 'Suggest connections',  Icon: Lightbulb  },
                      { mode: 'timeline', label: 'Build timeline',       Icon: Clock      },
                    ].map(({ mode, label, Icon }) => (
                      <button key={mode} className="btn btn-accent" style={{ justifyContent: 'flex-start', fontSize: '10px' }}
                        onClick={() => runAI(mode)} disabled={aiLoading}>
                        {aiLoading && aiMode === mode ? <Loader size={10} className="spin" /> : <Icon size={10} />}
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {aiError && (
                  <div style={{ fontSize: '10px', color: 'var(--red)', marginBottom: '8px' }}>{aiError}</div>
                )}
                {aiText && (
                  <div>
                    <div className="mono" style={{ fontSize: '8px', color: 'var(--accent)', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid var(--border)' }}>
                      AI · {aiMode}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                      {aiText}
                      {aiLoading && <span className="pulse" style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', marginLeft: '3px', verticalAlign: 'middle' }} />}
                    </p>
                  </div>
                )}
                {!aiText && !aiLoading && hasKey && (
                  <p style={{ fontSize: '11px', color: 'var(--t4)' }}>
                    {nodes.length === 0 ? 'Add nodes first.' : 'Choose an analysis above.'}
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            {rightTab === 'notes' && (
              <textarea value={board?.notes || ''} onChange={e => setBoardNotes(e.target.value)}
                placeholder="Analyst notes for this board…" className="inp"
                style={{ minHeight: '300px', resize: 'vertical', fontSize: '12px', lineHeight: 1.7 }} />
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Node Modal */}
      {(addModal || editModal) && (
        <NodeModal
          initial={editModal}
          onSave={data => {
            if (editModal) updateNode(editModal.id, data)
            else addNode({ ...data, x: 250 + Math.random() * 350, y: 150 + Math.random() * 300 })
            setAddModal(false); setEditModal(null)
          }}
          onClose={() => { setAddModal(false); setEditModal(null) }}
        />
      )}

      {/* Edge type modal */}
      {edgeModal && (
        <EdgeModal
          src={nodes.find(n => n.id === edgeModal.src)?.label || '?'}
          tgt={nodes.find(n => n.id === edgeModal.tgt)?.label || '?'}
          onConfirm={confirmEdge}
          onClose={() => setEdgeModal(null)}
        />
      )}
    </div>
  )
}

// ── Sub components ───────────────────────────────────────────────────────────
function NodeInspector({ node, nodes, edges, onConnect, onEdit, onDelete, onEnrich }) {
  const color = getNodeColor(node.type)
  const conns = edges.filter(e => e.src === node.id || e.tgt === node.id)
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* Identity */}
      <div style={{ padding: '8px 10px', background: 'var(--panel)', border: `1px solid ${color}33`, borderRadius: '3px', borderLeft: `3px solid ${color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '20px' }}>{getNodeIcon(node.type)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t1)', lineHeight: 1.3, wordBreak: 'break-word' }}>
              {node.label}
            </div>
            <div className="mono" style={{ fontSize: '8px', color, marginTop: '2px' }}>{node.type.toUpperCase()}</div>
          </div>
        </div>
      </div>

      {/* Detail / notes */}
      {node.detail && (
        <div>
          <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '3px', letterSpacing: '0.1em' }}>DETAIL / EVIDENCE</div>
          <p style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.7, background: 'var(--panel)', padding: '6px 8px', borderRadius: '3px', border: '1px solid var(--border)' }}>
            {node.detail}
          </p>
        </div>
      )}

      {/* Source + URL */}
      {(node.source || node.url) && (
        <div>
          <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '3px', letterSpacing: '0.1em' }}>SOURCE</div>
          <div style={{ fontSize: '10px', color: 'var(--accent)', marginBottom: '3px' }}>{node.source}</div>
          {node.url && node.url !== '#' && (
            <a href={node.url} target="_blank" rel="noopener noreferrer" className="btn"
              style={{ fontSize: '9px', padding: '3px 8px', justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>
              ↗ open source article
            </a>
          )}
        </div>
      )}

      {/* Connections */}
      <div>
        <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '4px', letterSpacing: '0.1em' }}>
          CONNECTIONS ({conns.length})
        </div>
        {conns.length === 0
          ? <div style={{ fontSize: '10px', color: 'var(--t4)', fontStyle: 'italic' }}>No connections yet — click "+ connect to…"</div>
          : conns.map(e => {
            const other = nodes.find(n => n.id === (e.src === node.id ? e.tgt : e.src))
            if (!other) return null
            const isOut = e.src === node.id
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px',
                padding: '4px 7px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                <span style={{ fontSize: '9px', color: 'var(--t4)' }}>{isOut ? '→' : '←'}</span>
                <span style={{ fontSize: '9px', color: e.color, flex: 1 }}>{e.label}</span>
                <span style={{ fontSize: '10px', color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90px' }}>
                  {other.label}
                </span>
              </div>
            )
          })}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {onEnrich && (
          <button className="btn" style={{ justifyContent: 'center', fontSize: '10px', background: 'rgba(45,212,191,0.08)', borderColor: 'rgba(45,212,191,0.3)', color: 'var(--accent)' }} onClick={onEnrich}>
            🔍 deep intel profile
          </button>
        )}
        <button className="btn btn-accent" style={{ justifyContent: 'center', fontSize: '10px' }} onClick={onConnect}>
          + connect to another node
        </button>
        <button className="btn" style={{ justifyContent: 'center', fontSize: '10px' }} onClick={onEdit}>
          <Edit3 size={10}/> edit details
        </button>
        <button className="btn btn-danger" style={{ justifyContent: 'center', fontSize: '10px' }} onClick={onDelete}>
          <Trash2 size={10}/> remove node
        </button>
      </div>
    </div>
  )
}

function EdgeInspector({ edge, nodes, onDelete }) {
  const src = nodes.find(n => n.id === edge.src)
  const tgt = nodes.find(n => n.id === edge.tgt)
  return (
    <div className="fade-in">
      <div style={{ fontSize: '13px', fontWeight: 600, color: edge.color, marginBottom: '6px' }}>{edge.label}</div>
      <div style={{ fontSize: '11px', color: 'var(--t2)', marginBottom: '12px' }}>{src?.label} → {tgt?.label}</div>
      <button className="btn btn-danger" style={{ justifyContent: 'center', fontSize: '10px', width: '100%' }} onClick={onDelete}>remove</button>
    </div>
  )
}

function BoardStats({ nodes, edges }) {
  const typeCounts = NODE_TYPES.map(t => ({ ...t, count: nodes.filter(n => n.type === t.type).length })).filter(t => t.count > 0)
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>{nodes.length}</div>
          <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>NODES</div>
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: '18px', fontWeight: 700, color: 'var(--orange)' }}>{edges.length}</div>
          <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>LINKS</div>
        </div>
      </div>
      {typeCounts.map(t => (
        <div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
          <span style={{ fontSize: '13px' }}>{t.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{ fontSize: '10px', color: 'var(--t2)' }}>{t.label}</span>
              <span className="mono" style={{ fontSize: '9px', color: t.color }}>{t.count}</span>
            </div>
            <div style={{ height: '2px', background: 'var(--border)', borderRadius: '1px' }}>
              <div style={{ height: '100%', borderRadius: '1px', background: t.color, width: `${(t.count / Math.max(nodes.length, 1)) * 100}%`, transition: 'width 0.5s' }} />
            </div>
          </div>
        </div>
      ))}
      {nodes.length === 0 && (
        <p style={{ fontSize: '11px', color: 'var(--t4)', lineHeight: 1.6 }}>
          Click "+ node" to add an entity, or click any article in the Feed and press "board" to import it here.
        </p>
      )}
    </div>
  )
}

function NodeModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ type: 'event', label: '', detail: '', source: '', ...initial })
  const nt = NODE_TYPES.find(t => t.type === form.type) || NODE_TYPES[0]
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ width: '380px', background: 'var(--raised)', border: '1px solid var(--border2)', borderRadius: '4px', boxShadow: '0 16px 48px rgba(0,0,0,0.7)' }} onClick={e => e.stopPropagation()} className="fade-in">
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Orbitron', fontSize: '11px', color: 'var(--accent)', letterSpacing: '0.1em' }}>{initial ? 'EDIT NODE' : 'ADD NODE'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}><X size={13}/></button>
        </div>
        <div style={{ padding: '14px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label className="mono" style={{ fontSize: '8px', color: 'var(--t4)', display: 'block', marginBottom: '5px' }}>TYPE</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
              {NODE_TYPES.map(t => (
                <button key={t.type} onClick={() => setForm(f => ({ ...f, type: t.type }))}
                  style={{ padding: '5px 4px', borderRadius: '3px', cursor: 'pointer', border: `1px solid ${form.type === t.type ? t.color + '66' : 'var(--border)'}`, background: form.type === t.type ? `${t.color}12` : 'var(--base)', fontFamily: 'Inter', fontSize: '10px', color: form.type === t.type ? t.color : 'var(--t3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label className="mono" style={{ fontSize: '8px', color: 'var(--t4)', display: 'block', marginBottom: '4px' }}>LABEL *</label>
            <input autoFocus value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && form.label.trim() && onSave(form)}
              placeholder="Entity name…" className="inp" />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label className="mono" style={{ fontSize: '8px', color: 'var(--t4)', display: 'block', marginBottom: '4px' }}>DETAIL</label>
            <textarea value={form.detail} onChange={e => setForm(f => ({ ...f, detail: e.target.value }))}
              placeholder="Context, notes, evidence…" className="inp" rows={3} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label className="mono" style={{ fontSize: '8px', color: 'var(--t4)', display: 'block', marginBottom: '4px' }}>SOURCE</label>
            <input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
              placeholder="Article, document, report…" className="inp" />
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="btn btn-accent" style={{ flex: 1, justifyContent: 'center', fontSize: '11px' }} onClick={() => form.label.trim() && onSave(form)}>
              {initial ? 'update' : 'add to board'}
            </button>
            <button className="btn" style={{ fontSize: '11px' }} onClick={onClose}>cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EdgeModal({ src, tgt, onConfirm, onClose }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ width: '260px', background: 'var(--raised)', border: '1px solid var(--border2)', borderRadius: '4px', boxShadow: '0 16px 48px rgba(0,0,0,0.7)' }} onClick={e => e.stopPropagation()} className="fade-in">
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: '10px', color: 'var(--orange)', letterSpacing: '0.1em', marginBottom: '3px' }}>RELATIONSHIP</div>
          <div className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>{src} → {tgt}</div>
        </div>
        <div style={{ padding: '8px' }}>
          {EDGE_TYPES.map(et => (
            <button key={et.type} onClick={() => onConfirm(et.type)}
              onMouseEnter={e => e.currentTarget.style.background = `${et.color}12`}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '7px 10px', borderRadius: '3px', cursor: 'pointer', border: `1px solid ${et.color}33`, fontFamily: 'Inter', fontSize: '11px', color: et.color, marginBottom: '3px', background: 'transparent', transition: 'background 0.1s' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: et.color, flexShrink: 0 }} />
              {et.label}
              {et.dash && <span className="mono" style={{ marginLeft: 'auto', fontSize: '8px', color: et.color, opacity: 0.6 }}>dashed</span>}
            </button>
          ))}
        </div>
        <div style={{ padding: '0 8px 8px' }}>
          <button className="btn" style={{ width: '100%', justifyContent: 'center', fontSize: '10px' }} onClick={onClose}>cancel</button>
        </div>
      </div>
    </div>
  )
}



// ── EntityIntelPanel ─────────────────────────────────────────────────────────
function EntityIntelPanel({ node, loading, progress, result, error, srcStatus = {}, onSearch, onClear, onAddNode }) {
  const [searchInput, setSearchInput] = React.useState('')
  const [activeSection, setActiveSection] = React.useState('sources')

  React.useEffect(() => { if (node?.label) setSearchInput(node.label) }, [node?.label])

  const tone = parseFloat(result?.gdelt?.avgTone || 0)
  const toneColor = tone > 1.5 ? '#4ade80' : tone < -1.5 ? '#f87171' : '#fbbf24'

  const hasFlags = result && (result.icij?.length || result.sanctions?.length || result.ofac?.length || result.occrp?.length)

  // Source status pills
  const SRC_LABELS = [
    'Wikipedia','Wikidata','DuckDuckGo',
    'GDELT','Google News','Bing News',
    'ICIJ OffshoreLeaks','OpenSanctions','OpenCorporates','OCCRP ALEPH',
    'Ahmia (Tor)','Wikipedia Links','Entity Extract','Groq AI',
  ]

  const totalArticles = (result?.gdelt?.articleCount||0)+(result?.newsapi?.length||0)+(result?.googleNews?.length||0)+(result?.bingNews?.length||0)+(result?.rssNews?.length||0)+(result?.reddit?.length||0)

  const SECTIONS = [
    { id: 'sources',  label: `◈ Sources` },
    { id: 'news',     label: `◉ News (${totalArticles})` },
    { id: 'ai',       label: '🧠 AI Profile' },
    { id: 'flags',    label: `⚠ Flags${hasFlags ? ' !' : ''}` },
    { id: 'facts',    label: '◎ Facts' },
    { id: 'corps',    label: '$ Corporate' },
    { id: 'cyber',    label: '💻 Cyber/OSINT' },
    { id: 'academic', label: '📚 Academic' },
    { id: 'dark',     label: '◆ Dark Web' },
  ]

  // Global intel from satData - surfaces without needing a search
  const ucdpHighFatality = (satData?.ucdpFull||[]).filter(e=>(e.deaths_best||0)>50).sort((a,b)=>(b.deaths_best||0)-(a.deaths_best||0)).slice(0,5)
  const topSanctioned = (satData?.openSanctions||[]).filter(e=>e.schema==='Vessel'||e.schema==='Person').slice(0,6)
  const activeWikiConflicts = (satData?.wikidataConflicts||[]).slice(0,5)
  const newArmsDeals = (satData?.armsTransferSignals||[]).slice(0,4)
  const [showGlobal, setShowGlobal] = React.useState(true)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Global Intel Discovery Panel ── */}
      <div style={{ flexShrink:0, borderBottom:'1px solid var(--border)', background:'rgba(45,212,191,0.02)' }}>
        <button onClick={()=>setShowGlobal(s=>!s)} style={{ width:'100%', padding:'4px 10px', background:'none', border:'none', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span className="mono" style={{ fontSize:'7px', color:'var(--accent)', letterSpacing:'0.12em' }}>
            ◈ GLOBAL INTEL FEEDS · {(satData?.ucdpFull?.length||0) + (satData?.openSanctions?.length||0) + (satData?.osmMilitary?.length||0) > 0 
              ? `${(satData?.ucdpFull?.length||0) + (satData?.openSanctions?.length||0) + (satData?.osmMilitary?.length||0)} records` 
              : '⟳ loading… (takes ~30s on first load)'}
          </span>
          <span style={{ fontSize:'8px', color:'var(--t4)' }}>{showGlobal?'▾':'▸'}</span>
        </button>
        {showGlobal && (
          <div style={{ padding:'0 0 6px 0', maxHeight:'280px', overflowY:'auto' }}>
            {(satData?.ucdpFull?.length||0) === 0 && (satData?.openSanctions?.length||0) === 0 && (
              <div style={{ padding:'12px 8px', textAlign:'center' }}>
                <div className="mono" style={{ fontSize:'8px', color:'var(--t4)', lineHeight:1.8 }}>
                  ⟳ Fetching intelligence sources…<br/>
                  UCDP · OpenSanctions · OSM Military<br/>
                  WikiData · Arms Transfers · EU CORDIS<br/>
                  <span style={{ color:'var(--t4)', fontSize:'7px' }}>Takes ~30s. Cached 2 hours after first load.</span>
                </div>
              </div>
            )}

            {ucdpHighFatality.length > 0 && (
              <div style={{ padding:'0 8px 4px' }}>
                <div className="mono" style={{ fontSize:'7px', color:'#ef4444', padding:'3px 0', letterSpacing:'0.1em' }}>
                  ☠ UCDP HIGH-FATALITY ({satData?.ucdpFull?.length||0} total events)
                </div>
                {ucdpHighFatality.map((e,i) => (
                  <a key={i} href={`https://ucdp.uu.se/event/${e.id}`} target="_blank" rel="noopener"
                    style={{ display:'flex', gap:'6px', padding:'2px 0', textDecoration:'none', alignItems:'flex-start', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontSize:'9px', color:'#ef4444', fontWeight:700, minWidth:'32px', flexShrink:0 }}>{e.deaths_best}☠</span>
                    <div>
                      <div style={{ fontSize:'9px', color:'var(--t1)', lineHeight:1.3 }}>{(e.dyad_name||e.title||'').slice(0,50)}</div>
                      <div className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{e.country} · {e.date?.slice(0,10)||''}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}

            {topSanctioned.length > 0 && (
              <div style={{ padding:'0 8px 4px' }}>
                <div className="mono" style={{ fontSize:'7px', color:'#a78bfa', padding:'3px 0', letterSpacing:'0.1em' }}>
                  🚫 SANCTIONED ENTITIES ({satData?.openSanctions?.length||0} total)
                </div>
                {topSanctioned.map((e,i) => (
                  <a key={i} href={e.url||'#'} target="_blank" rel="noopener"
                    style={{ display:'flex', gap:'5px', padding:'2px 0', textDecoration:'none', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontSize:'9px' }}>{e.schema==='Vessel'?'🚢':e.schema==='Aircraft'?'✈':'👤'}</span>
                    <div>
                      <div style={{ fontSize:'9px', color:'var(--t1)' }}>{(e.name||'').slice(0,45)}</div>
                      <div className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{e.schema} · {(e.program||e.datasets||'').slice(0,35)}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}

            {activeWikiConflicts.length > 0 && (
              <div style={{ padding:'0 8px 4px' }}>
                <div className="mono" style={{ fontSize:'7px', color:'#f97316', padding:'3px 0', letterSpacing:'0.1em' }}>
                  📖 WIKIDATA ACTIVE CONFLICTS ({satData?.wikidataConflicts?.length||0})
                </div>
                {activeWikiConflicts.map((c,i) => (
                  <a key={i} href={`https://www.wikidata.org/wiki/${c.id}`} target="_blank" rel="noopener"
                    style={{ display:'flex', gap:'5px', padding:'2px 0', textDecoration:'none', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontSize:'9px' }}>🌍</span>
                    <div>
                      <div style={{ fontSize:'9px', color:'var(--t1)' }}>{(c.name||'').slice(0,50)}</div>
                      <div className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{c.country}{c.start?' · since '+c.start.slice(0,10):''}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}

            {newArmsDeals.length > 0 && (
              <div style={{ padding:'0 8px' }}>
                <div className="mono" style={{ fontSize:'7px', color:'#f59e0b', padding:'3px 0', letterSpacing:'0.1em' }}>
                  ⚔ ARMS TRANSFER SIGNALS ({satData?.armsTransferSignals?.length||0})
                </div>
                {newArmsDeals.map((a,i) => (
                  <a key={i} href={a.url||'#'} target="_blank" rel="noopener"
                    style={{ display:'flex', gap:'5px', padding:'2px 0', textDecoration:'none', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontSize:'9px' }}>🔫</span>
                    <div style={{ fontSize:'9px', color:'var(--t1)', lineHeight:1.3 }}>{(a.title||'').slice(0,55)}</div>
                  </a>
                ))}
              </div>
            )}

            {topCordis.length > 0 && (
              <div style={{ padding:'0 8px' }}>
                <div className="mono" style={{ fontSize:'7px', color:'#6366f1', padding:'3px 0', letterSpacing:'0.1em' }}>🔬 EU DEFENCE R&D ({satData?.euCordis?.length||0} projects)</div>
                {topCordis.map((p,i) => (
                  <a key={i} href={`https://cordis.europa.eu/project/id/${p.id}`} target="_blank" rel="noopener"
                    style={{ display:'flex', gap:'5px', padding:'2px 0', textDecoration:'none', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontSize:'9px' }}>🔬</span>
                    <div>
                      <div style={{ fontSize:'9px', color:'var(--t1)' }}>{(p.title||'').slice(0,50)}</div>
                      <div className="mono" style={{ fontSize:'7px', color:'#6366f1' }}>€{((p.budget||0)/1e6).toFixed(1)}M · {p.acronym||''}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '5px' }}>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchInput.trim() && onSearch(searchInput.trim())}
            placeholder="Entity name, person, org, company…" className="inp"
            style={{ flex: 1, fontSize: '11px' }} />
          <button className="btn btn-accent" style={{ padding: '4px 8px' }}
            onClick={() => searchInput.trim() && onSearch(searchInput.trim())} disabled={loading}>
            {loading ? '…' : '⌕'}
          </button>
          {result && <button className="btn" style={{ padding: '4px 6px' }} onClick={onClear}>×</button>}
        </div>
        {loading && (
          <div style={{ marginTop: '5px', padding: '7px 10px', background: 'rgba(45,212,191,0.06)', border: '1px solid rgba(45,212,191,0.3)', borderRadius: '3px', borderLeft: '3px solid var(--accent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }}/>
              <span className="mono" style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 700 }}>SEARCHING — DO NOT CLOSE</span>
            </div>
            <div className="mono" style={{ fontSize: '8px', color: 'var(--t2)', lineHeight: 1.6 }}>{progress}</div>
            <div className="mono" style={{ fontSize: '7px', color: 'var(--orange)', marginTop: '3px' }}>
              ⏱ May take up to 2 minutes · Results appear progressively as each source returns
            </div>
            {Object.keys(srcStatus).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginTop: '5px' }}>
                {Object.entries(srcStatus).map(([src, hit]) => (
                  <span key={src} className="mono" style={{ fontSize: '7px', padding: '1px 4px', borderRadius: '2px',
                    background: hit ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.03)',
                    color: hit ? '#4ade80' : 'var(--t4)',
                    border: `1px solid ${hit ? 'rgba(74,222,128,0.25)' : 'var(--border)'}` }}>
                    {hit ? '✓' : '…'} {src}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {error && <div style={{ fontSize: '9px', color: 'var(--red)', marginTop: '3px', lineHeight: 1.5 }}>{error}</div>}
      </div>

      {!result && !loading && (
        <div style={{ padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', opacity: 0.1, marginBottom: '5px' }}>🔍</div>
          <div style={{ fontSize: '10px', color: 'var(--t4)', lineHeight: 1.7 }}>
            Search any entity — person, organization, company, country.
          </div>
          <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginTop: '5px', lineHeight: 1.8 }}>
            14 sources: Wikipedia · Wikidata · DuckDuckGo · GDELT · Google News · Bing News · ICIJ OffshoreLeaks · OpenSanctions · OpenCorporates · OCCRP Aleph · Ahmia (Tor) · Wikipedia Links · Entity Extract · Groq AI
          </div>
        </div>
      )}

      {result && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0' }}>

          {/* Source status grid */}
          <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
            <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginBottom: '4px', letterSpacing: '0.1em' }}>
              SOURCE COVERAGE — {Object.values(srcStatus).filter(Boolean).length}/{SRC_LABELS.length} HIT
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {SRC_LABELS.map(src => {
                const hit = srcStatus[src]
                return (
                  <span key={src} className="mono" style={{
                    fontSize: '7px', padding: '1px 5px', borderRadius: '2px',
                    background: hit ? 'rgba(45,212,191,0.1)' : 'rgba(0,0,0,0.2)',
                    color: hit ? 'var(--accent)' : 'var(--t4)',
                    border: `1px solid ${hit ? 'rgba(45,212,191,0.25)' : 'var(--border)'}`,
                  }}>
                    {hit ? '✓' : '○'} {src}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Flags alert if any */}
          {hasFlags && (
            <div style={{ marginBottom: '8px', padding: '6px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '3px', borderLeft: '3px solid #ef4444' }}>
              <div className="mono" style={{ fontSize: '8px', color: '#ef4444', fontWeight: 700, marginBottom: '2px', letterSpacing: '0.1em' }}>
                ⚠ FLAGS DETECTED
              </div>
              <div className="mono" style={{ fontSize: '8px', color: '#ef4444', opacity: 0.85 }}>
                {[result.icij?.length && `${result.icij.length} ICIJ leak hit(s)`, result.sanctions?.length && `${result.sanctions.length} sanctions match(es)`, result.ofac?.length && `${result.ofac.length} OFAC SDN entry`, result.occrp?.length && `${result.occrp.length} OCCRP corruption record(s)`].filter(Boolean).join(' · ')}
              </div>
            </div>
          )}

          {/* Section tabs */}
          <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)} className="mono"
                style={{ fontSize: '7px', padding: '2px 6px', border: 'none', cursor: 'pointer', borderRadius: '2px',
                  background: activeSection===s.id ? 'rgba(45,212,191,0.12)' : 'transparent',
                  color: s.id==='flags'&&hasFlags ? '#ef4444' : activeSection===s.id ? 'var(--accent)' : 'var(--t4)',
                  borderBottom: `2px solid ${activeSection===s.id ? 'var(--accent)' : 'transparent'}` }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* ── Sources ── */}
          {activeSection === 'sources' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', letterSpacing: '0.12em', marginBottom: '2px' }}>
                ALL INTELLIGENCE SOURCES — {Object.values(srcStatus).filter(Boolean).length} HIT / {Object.keys(srcStatus).length} QUERIED
              </div>

              {/* Each source with what it found */}
              {[
                { key: 'Wikipedia',         icon: '📖', found: result.wiki,          detail: result.wiki ? `${result.wiki.title} — ${result.wiki.summary?.slice(0,120)}` : null, url: result.wiki?.url },
                { key: 'Wikidata',          icon: '🔗', found: result.wikidata,       detail: result.wikidata ? [result.wikidata.description, result.wikidata.occupation, result.wikidata.nationality, result.wikidata.allPositions?.join(' → ')].filter(Boolean).join(' · ').slice(0,150) : null, url: result.wikidata?.wikidataUrl },
                { key: 'DuckDuckGo',        icon: '🦆', found: result.ddg,            detail: result.ddg?.text?.slice(0,120), url: result.ddg?.url },
                { key: 'GDELT',             icon: '🌐', found: result.gdelt?.articleCount>0, detail: result.gdelt ? `${result.gdelt.articleCount} articles · Tone: ${result.gdelt.avgTone} · Countries: ${result.gdelt.topCountries?.slice(0,4).join(', ')} · Themes: ${result.gdelt.topThemes?.slice(0,4).join(', ')}` : null, url: null },
                { key: 'NewsAPI',           icon: '📰', found: result.newsapi?.length>0, detail: result.newsapi?.length ? `${result.newsapi.length} articles — ${result.newsapi.slice(0,2).map(a=>'"'+a.title?.slice(0,50)+'"').join(' · ')}` : null },
                { key: 'Google News',       icon: '📰', found: result.googleNews?.length>0, detail: result.googleNews?.length ? `${result.googleNews.length} articles — ${result.googleNews.slice(0,2).map(a=>'"'+a.title?.slice(0,50)+'"').join(' · ')}` : null },
                { key: 'Bing News',         icon: '📰', found: result.bingNews?.length>0, detail: result.bingNews?.length ? `${result.bingNews.length} articles` : null },
                { key: 'RSS (AJ/BBC/AP)',   icon: '📡', found: result.rssNews?.length>0, detail: result.rssNews?.length ? `${result.rssNews.length} articles from Al Jazeera, BBC, AP, UN News` : null },
                { key: 'Reddit',            icon: '💬', found: result.reddit?.length>0, detail: result.reddit?.length ? `${result.reddit.length} posts from r/worldnews, r/geopolitics, r/news, r/CredibleDefense` : null },
                { key: 'ICIJ OffshoreLeaks',icon: '⚠', found: result.icij?.length>0, detail: result.icij?.length ? `${result.icij.length} records in Panama Papers, Pandora Papers, Paradise Papers` : null, url: `https://offshoreleaks.icij.org/search?q=${encodeURIComponent(result.name||'')}` },
                { key: 'OpenSanctions',     icon: '🚫', found: result.sanctions?.length>0, detail: result.sanctions?.length ? `${result.sanctions.length} matches in ${result.sanctions.map(s=>s.datasets).join(', ').slice(0,100)}` : null },
                { key: 'OpenCorporates',    icon: '🏢', found: result.opencorp?.length>0, detail: result.opencorp?.length ? `${result.opencorp.length} company records: ${result.opencorp.slice(0,2).map(c=>c.name).join(', ')}` : null },
                { key: 'OCCRP ALEPH',       icon: '🔍', found: result.occrp?.length>0, detail: result.occrp?.length ? `${result.occrp.length} records: ${result.occrp.slice(0,2).map(r=>r.caption).join(', ')}` : null },
                { key: 'ReliefWeb',         icon: '🏥', found: result.reliefweb?.length>0, detail: result.reliefweb?.length ? `${result.reliefweb.length} UN humanitarian reports` : null },
                { key: 'Semantic Scholar',  icon: '🎓', found: result.scholar?.length>0, detail: result.scholar?.length ? `${result.scholar.length} academic papers: "${result.scholar[0]?.title?.slice(0,60)}"` : null },
                { key: 'Ahmia (Tor)',        icon: '🕶', found: result.darkweb?.length>0, detail: result.darkweb?.length ? `${result.darkweb.length} dark web references` : null },
                { key: 'Wikipedia Links',   icon: '🔗', found: result.wikiLinks?.links?.length>0, detail: result.wikiLinks?.links?.length ? `${result.wikiLinks.links.length} linked entities: ${result.wikiLinks.links.slice(0,6).join(', ')}` : null },
                { key: 'Entity Extract',    icon: '🧩', found: result.extractedEntities?.length>0, detail: result.extractedEntities?.length ? `${result.extractedEntities.length} co-occurring entities extracted from all news` : null },
                { key: 'Groq AI',           icon: '🧠', found: !!result.aiProfile, detail: result.aiProfile ? 'AI analysis complete — see AI Profile tab' : 'Add Groq key in Settings' },
                { key: 'GreyNoise',         icon: '📡', found: !!result.greynoise, detail: result.greynoise ? `${result.greynoise.classification||'unknown'} · Noise: ${result.greynoise.noise} · RIOT: ${result.greynoise.riot}` : null },
                { key: 'ThreatFox',         icon: '🎯', found: result.threatfox?.length>0, detail: result.threatfox?.length ? `${result.threatfox.length} IOC matches — malware: ${result.threatfox.slice(0,2).map(t=>t.malware).join(', ')}` : null },
                { key: 'WHOIS/RDAP',        icon: '🌐', found: !!result.whois, detail: result.whois ? `Registrar: ${result.whois.registrar||'?'} · Created: ${result.whois.created||'?'} · NS: ${result.whois.nameservers?.join(', ')||'?'}` : null },
                { key: 'Shodan InternetDB', icon: '🔍', found: !!result.shodan, detail: result.shodan?.ports?.length ? `Ports: ${result.shodan.ports.slice(0,6).join(', ')}` : null },
                { key: 'VirusTotal',        icon: '🛡', found: !!result.virustotal, detail: result.virustotal ? `Malicious: ${result.virustotal.malicious} · Suspicious: ${result.virustotal.suspicious} · Rep: ${result.virustotal.reputation}` : null },
                { key: 'AbuseIPDB',         icon: '🚨', found: !!result.abuseipdb, detail: result.abuseipdb ? `Score: ${result.abuseipdb.score}% · Reports: ${result.abuseipdb.totalReports} · ISP: ${result.abuseipdb.isp}` : null },
                { key: 'Hunter.io',         icon: '📧', found: result.hunterEmails?.length>0, detail: result.hunterEmails?.length ? `${result.hunterEmails.length} emails found` : null },
                { key: 'LeakIX',            icon: '🔓', found: result.leakix?.length>0, detail: result.leakix?.length ? `${result.leakix.length} exposed services` : null },
              ].map(({ key, icon, found, detail, url }) => (
                <div key={key} style={{ padding: '5px 8px', background: found ? 'rgba(45,212,191,0.04)' : 'rgba(0,0,0,0.15)', border: `1px solid ${found ? 'rgba(45,212,191,0.2)' : 'var(--border)'}`, borderLeft: `3px solid ${found ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '2px' }}>
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginBottom: found && detail ? '3px' : 0 }}>
                    <span style={{ fontSize: '10px' }}>{icon}</span>
                    <span className="mono" style={{ fontSize: '8px', color: found ? 'var(--accent)' : 'var(--t4)', fontWeight: 700 }}>{key}</span>
                    <span className="mono" style={{ fontSize: '7px', color: found ? '#4ade80' : 'var(--t4)', marginLeft: 'auto' }}>{found ? '✓ HIT' : '○ MISS'}</span>
                    {url && found && <a href={url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: '7px', color: 'var(--accent)', opacity: 0.7 }}>↗</a>}
                  </div>
                  {found && detail && (
                    <div className="mono" style={{ fontSize: '8px', color: 'var(--t2)', lineHeight: 1.5, paddingLeft: '15px' }}>{detail}</div>
                  )}
                  {!found && (
                    <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', paddingLeft: '15px' }}>No results found</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── AI Profile ── */}
          {activeSection === 'ai' && (
            <div>
              {result.aiProfile ? (
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: '10px', lineHeight: 1.8, color: 'var(--t2)' }}>
                  <div className="mono" style={{ fontSize: '8px', color: 'var(--accent)', marginBottom: '8px', paddingBottom: '5px', borderBottom: '1px solid var(--border)', letterSpacing: '0.12em' }}>
                    ◈ AI INTELLIGENCE PROFILE · {result.name?.toUpperCase()} · {result.enrichedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {result.aiProfile.split('\n').map((line, i) => {
                    const t = line.trim()
                    if (!t) return <div key={i} style={{ height: '5px' }} />
                    if (/^[A-Z][A-Z\s&\/\-\(\)⚠]{3,}$/.test(t)) return (
                      <div key={i} style={{ marginTop: '12px', marginBottom: '4px', paddingBottom: '3px', borderBottom: '1px solid rgba(45,212,191,0.15)' }}>
                        <span className="mono" style={{ fontSize: '8px', letterSpacing: '0.13em', color: 'var(--accent)', fontWeight: 700 }}>{t}</span>
                      </div>
                    )
                    if (t.startsWith('✓') || t.startsWith('✗')) return <div key={i} style={{ color: 'var(--t4)', fontSize: '9px' }}>{t}</div>
                    if (t.startsWith('▸') || t.startsWith('•')) return (
                      <div key={i} style={{ display: 'flex', gap: '5px', marginBottom: '2px', paddingLeft: '2px' }}>
                        <span style={{ color: 'var(--accent)', flexShrink: 0 }}>{t[0]}</span>
                        <span style={{ color: 'var(--t1)', fontSize: '10px', lineHeight: 1.7 }}>{t.slice(1).trim()}</span>
                      </div>
                    )
                    if (t.includes('→') && t.includes('[')) return (
                      <div key={i} style={{ fontSize: '9px', color: 'var(--t2)', paddingLeft: '8px', marginBottom: '2px', fontFamily: 'JetBrains Mono' }}>{t}</div>
                    )
                    return <div key={i} style={{ color: 'var(--t2)', marginBottom: '1px' }}>{t}</div>
                  })}
                </div>
              ) : (
                <div style={{ padding: '12px', textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: '10px', color: 'var(--t4)' }}>
                    {!('groq' in (result.srcStatus || {})) ? 'Add Groq key in Settings for AI analysis' : 'AI synthesis failed — raw data available in other tabs'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── News ── */}
          {activeSection === 'news' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* GDELT summary */}
              {result.gdelt && (
                <div style={{ padding: '7px 9px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'Orbitron', fontSize: '16px', fontWeight: 700, color: 'var(--accent)' }}>{result.gdelt.articleCount}</div>
                      <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>GDELT arts</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'Orbitron', fontSize: '16px', fontWeight: 700, color: toneColor }}>{result.gdelt.avgTone}</div>
                      <div className="mono" style={{ fontSize: '7px', color: toneColor }}>{tone > 1.5 ? 'FAVORABLE' : tone < -1.5 ? 'HOSTILE' : 'NEUTRAL'}</div>
                    </div>
                  </div>
                  {result.gdelt.topThemes?.length > 0 && (
                    <div style={{ marginBottom: '5px' }}>
                      <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginBottom: '3px' }}>TOP THEMES</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                        {result.gdelt.topThemes.slice(0,10).map(t => (
                          <span key={t} className="mono" style={{ fontSize: '7px', padding: '1px 4px', background: 'rgba(45,212,191,0.07)', color: 'var(--accent)', borderRadius: '2px' }}>{t.slice(0,28)}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.gdelt.topCountries?.length > 0 && (
                    <div className="mono" style={{ fontSize: '8px', color: 'var(--t2)' }}>Coverage: {result.gdelt.topCountries.join(' · ')}</div>
                  )}
                </div>
              )}

              {/* All news articles merged */}
              {[
                ...(result.gdelt?.articles||[]).map(a=>({...a,_src:'GDELT',_srcColor:'#2dd4bf'})),
                ...(result.newsapi||[]).map(a=>({...a,_src:'NewsAPI',_srcColor:'#60a5fa'})),
                ...(result.googleNews||[]).map(a=>({...a,_src:'Google News',_srcColor:'#34d399'})),
                ...(result.bingNews||[]).map(a=>({...a,_src:'Bing',_srcColor:'#a78bfa'})),
                ...(result.rssNews||[]).map(a=>({...a,_src:a.source||'RSS',_srcColor:'#fbbf24'})),
                ...(result.reddit||[]).map(a=>({...a,_src:a.source||'Reddit',_srcColor:'#f97316'})),
              ].sort((a,b)=>new Date(b.date||b.pub||0)-new Date(a.date||a.pub||0)).slice(0, 100).map((a, i) => (
                <div key={i} style={{ padding: '5px 7px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '2px', borderLeft: `2px solid ${(a.tone||0)>0?'#4ade8050':(a.tone||0)<0?'#f8717150':'var(--border)'}` }}>
                  <a href={a.url!=='#'?a.url:undefined} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '10px', color: 'var(--t1)', textDecoration: 'none', lineHeight: 1.4, display: 'block', marginBottom: '2px' }}>
                    {a.title?.slice(0, 90)}{a.title?.length>90?'…':''}
                  </a>
                  {a.description && <div style={{ fontSize: '9px', color: 'var(--t3)', lineHeight: 1.4, marginBottom: '2px' }}>{a.description?.slice(0,120)}</div>}
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    <span className="mono" style={{ fontSize: '7px', color: a._srcColor || 'var(--accent)', background: (a._srcColor || 'var(--accent)') + '18', padding: '0 4px', borderRadius: '2px' }}>{a._src}</span>
                    <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>{a.domain||a.source}</span>
                    <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>{a.date}</span>
                    {a.tone!=null && <span className="mono" style={{ fontSize: '7px', color: a.tone>0?'#4ade80':'#f87171' }}>tone:{a.tone.toFixed?.(1)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Flags ── */}
          {activeSection === 'flags' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {!hasFlags && (
                <div style={{ padding: '10px', background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '9px', color: '#4ade80' }}>✓ No flags found in ICIJ, OpenSanctions, OFAC SDN, or OCCRP databases</div>
                </div>
              )}
              {result.icij?.length > 0 && (
                <div style={{ padding: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '8px', color: '#ef4444', marginBottom: '6px', letterSpacing: '0.1em' }}>⚠ ICIJ OFFSHORE LEAKS ({result.icij.length} records)</div>
                  <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginBottom: '5px' }}>Source: Panama Papers, Pandora Papers, Paradise Papers, Offshore Leaks, Swiss Leaks, Bahamas Leaks</div>
                  {result.icij.map((r,i) => (
                    <div key={i} style={{ padding: '4px 6px', background: 'var(--panel)', borderRadius: '2px', marginBottom: '3px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: '#ef4444' }}>{r.name}</div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {r.type && <span className="mono" style={{ fontSize: '8px', color: 'var(--t3)' }}>Type: {r.type}</span>}
                        {r.jurisdiction && <span className="mono" style={{ fontSize: '8px', color: 'var(--t3)' }}>Jurisdiction: {r.jurisdiction}</span>}
                        {r.dataset && <span className="mono" style={{ fontSize: '8px', color: 'var(--orange)' }}>Dataset: {r.dataset}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {result.sanctions?.length > 0 && (
                <div style={{ padding: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '8px', color: '#ef4444', marginBottom: '6px', letterSpacing: '0.1em' }}>⚠ INTERNATIONAL SANCTIONS (OpenSanctions — 30+ lists)</div>
                  {result.sanctions.map((s,i) => (
                    <div key={i} style={{ padding: '4px 6px', background: 'var(--panel)', borderRadius: '2px', marginBottom: '3px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: '#ef4444' }}>{s.name}</div>
                      <div className="mono" style={{ fontSize: '8px', color: 'var(--t3)' }}>Schema: {s.schema} | Topics: {s.topics}</div>
                      <div className="mono" style={{ fontSize: '8px', color: 'var(--orange)' }}>Lists: {s.datasets}</div>
                      <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>Match: {(s.score*100).toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
              )}
              {result.ofac?.length > 0 && (
                <div style={{ padding: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '8px', color: '#ef4444', marginBottom: '6px', letterSpacing: '0.1em' }}>⚠ US TREASURY OFAC SDN LIST</div>
                  {result.ofac.map((o,i) => (
                    <div key={i} style={{ padding: '4px 6px', background: 'var(--panel)', borderRadius: '2px', marginBottom: '3px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: '#ef4444' }}>{o.name}</div>
                      <div className="mono" style={{ fontSize: '8px', color: 'var(--t3)' }}>Type: {o.sdnType} | Programs: {o.programs}</div>
                    </div>
                  ))}
                </div>
              )}
              {result.occrp?.length > 0 && (
                <div style={{ padding: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '8px', color: '#ef4444', marginBottom: '6px', letterSpacing: '0.1em' }}>⚠ OCCRP ALEPH — ORGANIZED CRIME & CORRUPTION</div>
                  {result.occrp.map((r,i) => (
                    <div key={i} style={{ padding: '4px 6px', background: 'var(--panel)', borderRadius: '2px', marginBottom: '3px' }}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', fontWeight: 600, color: '#ef4444', textDecoration: 'none' }}>{r.caption}</a>
                      <div className="mono" style={{ fontSize: '8px', color: 'var(--t3)' }}>{r.schema} | {r.dataset}</div>
                      {r.country && <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>Countries: {r.country}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Facts ── */}
          {activeSection === 'facts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {result.wiki && (
                <div style={{ padding: '8px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px', borderLeft: '3px solid var(--accent)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--t1)' }}>{result.wiki.title}</div>
                    <a href={result.wiki.url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>WP ↗</a>
                  </div>
                  {result.wiki.description && <div className="mono" style={{ fontSize: '8px', color: 'var(--accent)', marginBottom: '5px' }}>{result.wiki.description}</div>}
                  <p style={{ fontSize: '10px', color: 'var(--t2)', lineHeight: 1.7, margin: 0, marginBottom: result.wiki.categories?.length ? '6px' : 0 }}>
                    {result.wiki.fullText?.slice(0, 600) || result.wiki.summary?.slice(0, 500)}…
                  </p>
                  {result.wiki.sections?.length > 0 && (
                    <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginBottom: '3px' }}>Sections: {result.wiki.sections.join(' · ')}</div>
                  )}
                  {result.wiki.categories?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                      {result.wiki.categories.slice(0,10).map(cat => (
                        <span key={cat} className="mono" style={{ fontSize: '7px', padding: '1px 4px', background: 'rgba(45,212,191,0.06)', color: 'var(--t4)', borderRadius: '2px' }}>{cat.replace(/_/g,' ')}</span>
                      ))}
                    </div>
                  )}
                  {result.wiki.inlinks?.length > 0 && (
                    <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginTop: '4px' }}>Referenced by: {result.wiki.inlinks.slice(0,8).join(', ')}</div>
                  )}
                </div>
              )}
              {result.ddg?.text && (
                <div style={{ padding: '8px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px', borderLeft: '3px solid #fbbf24' }}>
                  <div className="mono" style={{ fontSize: '8px', color: '#fbbf24', marginBottom: '4px' }}>DUCKDUCKGO</div>
                  <p style={{ fontSize: '10px', color: 'var(--t2)', lineHeight: 1.7, margin: 0 }}>{result.ddg.text}</p>
                  {result.ddg.infobox?.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', marginTop: '6px' }}>
                      {result.ddg.infobox.slice(0,10).map((item,i) => item?.label ? (
                        <div key={i} style={{ padding: '2px 5px', background: 'var(--base)', borderRadius: '2px' }}>
                          <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>{item.label}: </span>
                          <span style={{ fontSize: '9px', color: 'var(--t2)' }}>{String(item.value||'').slice(0,35)}</span>
                        </div>
                      ) : null)}
                    </div>
                  )}
                </div>
              )}
              {result.wikidata && (
                <div style={{ padding: '8px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '5px', letterSpacing: '0.1em' }}>WIKIDATA STRUCTURED FACTS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
                    {[
                      ['Born',          result.wikidata.birthDate],
                      ['Died',          result.wikidata.deathDate],
                      ['Birth place',   result.wikidata.birthPlace],
                      ['Nationality',   result.wikidata.nationality],
                      ['Type',          result.wikidata.instanceOf],
                      ['Occupation',    result.wikidata.occupation],
                      ['Position',      result.wikidata.position],
                      ['Employer',      result.wikidata.employer],
                      ['Country',       result.wikidata.country],
                      ['Founded',       result.wikidata.inception],
                      ['Dissolved',     result.wikidata.dissolved],
                      ['HQ',            result.wikidata.hq],
                      ['Net worth',     result.wikidata.netWorth],
                      ['Religion',      result.wikidata.religion],
                      ['Education',     result.wikidata.education],
                      ['Twitter',       result.wikidata.twitter && '@'+result.wikidata.twitter],
                      ['Website',       result.wikidata.website],
                    ].filter(([,v]) => v).map(([k,v]) => (
                      <div key={k} style={{ padding: '2px 5px', background: 'var(--base)', borderRadius: '2px' }}>
                        <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>{k}: </span>
                        <span style={{ fontSize: '9px', color: 'var(--t2)' }}>{String(v).slice(0,35)}</span>
                      </div>
                    ))}
                  </div>
                  {result.wikidata.aliases?.length > 0 && (
                    <div style={{ marginTop: '5px' }}>
                      <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>AKA: </span>
                      <span style={{ fontSize: '9px', color: 'var(--t2)' }}>{result.wikidata.aliases.join(', ')}</span>
                    </div>
                  )}
                  {result.wikidata.allPositions?.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>Positions: </span>
                      <span style={{ fontSize: '9px', color: 'var(--t2)' }}>{result.wikidata.allPositions.join(' | ')}</span>
                    </div>
                  )}
                  {result.wikidata.parties?.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>Party: </span>
                      <span style={{ fontSize: '9px', color: 'var(--t2)' }}>{result.wikidata.parties.join(', ')}</span>
                    </div>
                  )}
                  {result.wikidata.memberOf?.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>Member of: </span>
                      <span style={{ fontSize: '9px', color: 'var(--t2)' }}>{result.wikidata.memberOf.join(', ')}</span>
                    </div>
                  )}
                  <a href={result.wikidata.wikidataUrl} target="_blank" rel="noopener noreferrer"
                    className="mono" style={{ fontSize: '7px', color: 'var(--t4)', display: 'block', marginTop: '5px' }}>
                    {result.wikidata.id} ↗ Wikidata
                  </a>
                </div>
              )}
              {/* ReliefWeb UN reports */}
              {result.reliefweb?.length > 0 && (
                <div style={{ padding: '8px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '5px', letterSpacing: '0.1em' }}>UN RELIEFWEB REPORTS ({result.reliefweb.length})</div>
                  {result.reliefweb.map((r,i) => (
                    <div key={i} style={{ marginBottom: '4px', padding: '3px 5px', background: 'var(--base)', borderRadius: '2px' }}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', color: 'var(--t1)', textDecoration: 'none' }}>{r.title}</a>
                      <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>{r.date} · {r.source} · {r.country}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Corporate ── */}
          {activeSection === 'corps' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {!result.opencorp?.length && (
                <div style={{ padding: '10px', textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>No corporate registry matches found</div>
                </div>
              )}
              {result.opencorp?.length > 0 && (
                <div style={{ padding: '8px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '6px', letterSpacing: '0.1em' }}>
                    OPENCORPORATES — {result.opencorp.length} COMPANY RECORDS · {result.opencorpOfficers?.length||0} OFFICER RECORDS
                  </div>
                  {result.opencorp.map((c,i) => (
                    <div key={i} style={{ padding: '6px 8px', background: 'var(--base)', borderRadius: '3px', marginBottom: '6px', borderLeft: '3px solid var(--orange)' }}>
                      {/* Company header */}
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'4px' }}>
                        <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--orange)', textDecoration: 'none', lineHeight:1.3 }}>{c.name}</a>
                        {c.status && <span className="mono" style={{ fontSize:'7px', padding:'1px 5px', borderRadius:'2px', flexShrink:0, marginLeft:'6px',
                          background: /active/i.test(c.status)?'#4ade8022':'#ef444422',
                          color: /active/i.test(c.status)?'#4ade80':'#ef4444' }}>{c.status}</span>}
                      </div>
                      {/* Core fields */}
                      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'3px' }}>
                        {c.number      && <span className="mono" style={{ fontSize:'8px', color:'var(--t3)' }}>#{c.number}</span>}
                        {c.jurisdiction && <span className="mono" style={{ fontSize:'8px', color:'var(--accent)' }}>📍 {c.jurisdiction.toUpperCase()}</span>}
                        {c.type        && <span className="mono" style={{ fontSize:'8px', color:'var(--t3)' }}>🏢 {c.type}</span>}
                        {c.incorporated && <span className="mono" style={{ fontSize:'8px', color:'var(--t4)' }}>Inc: {c.incorporated}</span>}
                        {c.dissolved   && <span className="mono" style={{ fontSize:'8px', color:'#ef4444' }}>Dissolved: {c.dissolved}</span>}
                      </div>
                      {/* Address */}
                      {c.address && <div className="mono" style={{ fontSize:'8px', color:'var(--t4)', marginBottom:'3px' }}>📮 {c.address}</div>}
                      {/* Registered agent */}
                      {c.registered_agent && <div className="mono" style={{ fontSize:'8px', color:'var(--t3)', marginBottom:'3px' }}>Agent: {c.registered_agent}</div>}
                      {/* Industry codes */}
                      {c.industry_codes?.length > 0 && (
                        <div className="mono" style={{ fontSize:'7px', color:'var(--t4)', marginBottom:'3px' }}>
                          Industry: {c.industry_codes.map(ic=>`${ic.code||ic.industry_code||''} (${ic.code_scheme||ic.scheme||''})`).join(' · ')}
                        </div>
                      )}
                      {/* Officers inline */}
                      {c.officers?.length > 0 && (
                        <div style={{ marginTop:'5px', paddingTop:'5px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                          <div className="mono" style={{ fontSize:'7px', color:'var(--t4)', marginBottom:'3px', letterSpacing:'0.08em' }}>OFFICERS ({c.officers.length})</div>
                          {c.officers.map((o,oi) => {
                            const off = o.officer||o
                            return (
                              <div key={oi} style={{ fontSize:'8px', color:'var(--t2)', marginBottom:'2px', paddingLeft:'8px', borderLeft:'2px solid rgba(255,165,0,0.3)' }}>
                                <span style={{ fontWeight:600 }}>{off.name||'?'}</span>
                                <span className="mono" style={{ color:'var(--t4)', marginLeft:'6px' }}>{off.position||''}</span>
                                {off.start_date && <span className="mono" style={{ color:'var(--t4)', marginLeft:'4px' }}>from {off.start_date}</span>}
                                {off.end_date && <span className="mono" style={{ color:'#ef4444', marginLeft:'4px' }}>to {off.end_date}</span>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {/* Filings */}
                      {c.filings?.length > 0 && (
                        <div style={{ marginTop:'5px', paddingTop:'5px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                          <div className="mono" style={{ fontSize:'7px', color:'var(--t4)', marginBottom:'3px', letterSpacing:'0.08em' }}>RECENT FILINGS ({c.filings.length})</div>
                          {c.filings.slice(0,5).map((f,fi) => {
                            const fil = f.filing||f
                            return (
                              <div key={fi} className="mono" style={{ fontSize:'7px', color:'var(--t3)', marginBottom:'2px' }}>
                                {fil.date||fil.filing_date||''} — {fil.title||fil.description||fil.type||'Filing'}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {/* Identifiers */}
                      {c.identifiers?.length > 0 && (
                        <div style={{ marginTop:'4px' }}>
                          {c.identifiers.map((id,ii) => (
                            <span key={ii} className="mono" style={{ fontSize:'7px', color:'var(--t4)', marginRight:'6px' }}>
                              {id.identifier_system_name||id.scheme||''}: {id.uid||id.identifier||''}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Source & registry link */}
                      <div style={{ marginTop:'4px', display:'flex', gap:'8px' }}>
                        {c.registry_url && <a href={c.registry_url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>↗ Official Registry</a>}
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize:'7px', color:'var(--orange)' }}>↗ OpenCorporates</a>
                      </div>
                    </div>
                  ))}
                  {/* Officers search results (from officer search endpoint) */}
                  {result.opencorpOfficers?.length > 0 && (
                    <div style={{ marginTop:'8px', paddingTop:'8px', borderTop:'1px solid var(--border)' }}>
                      <div className="mono" style={{ fontSize:'7px', color:'var(--t4)', marginBottom:'5px', letterSpacing:'0.08em' }}>OFFICER RECORDS — {result.opencorpOfficers.length} entries</div>
                      {result.opencorpOfficers.map((o,i) => (
                        <div key={i} style={{ padding:'4px 6px', marginBottom:'3px', background:'var(--base)', borderRadius:'2px', borderLeft:'2px solid #8888ff' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'2px' }}>
                            <span style={{ fontSize:'9px', fontWeight:600, color:'var(--t1)' }}>{o.name}</span>
                            {o.position && <span className="mono" style={{ fontSize:'7px', color:'var(--accent)' }}>{o.position}</span>}
                          </div>
                          {o.company_name && (
                            <div className="mono" style={{ fontSize:'8px', color:'var(--t3)' }}>
                              @ <a href={o.company_url||'#'} target="_blank" rel="noopener noreferrer" style={{ color:'var(--orange)', textDecoration:'none' }}>{o.company_name}</a>
                              {o.company_jurisdiction && ` · ${o.company_jurisdiction.toUpperCase()}`}
                              {o.company_status && <span style={{ color:/active/i.test(o.company_status)?'#4ade80':'#ef4444', marginLeft:'4px' }}>{o.company_status}</span>}
                            </div>
                          )}
                          <div className="mono" style={{ fontSize:'7px', color:'var(--t4)', marginTop:'2px' }}>
                            {o.start_date&&`From: ${o.start_date}`}{o.end_date&&` → ${o.end_date}`}
                            {o.nationality&&` · ${o.nationality}`}
                            {o.occupation&&` · ${o.occupation}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Academic ── */}
          {activeSection === 'academic' && (
            <div>
              {!result.scholar?.length ? (
                <div style={{ padding: '10px', textAlign: 'center' }}><div className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>No academic papers found</div></div>
              ) : (
                <div style={{ padding: '8px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '5px', letterSpacing: '0.1em' }}>SEMANTIC SCHOLAR — {result.scholar.length} PAPERS</div>
                  {result.scholar.map((p,i) => (
                    <div key={i} style={{ marginBottom: '5px', padding: '4px 6px', background: 'var(--base)', borderRadius: '2px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--t1)', marginBottom: '2px', lineHeight: 1.4 }}>{p.title}</div>
                      <div className="mono" style={{ fontSize: '8px', color: 'var(--t3)' }}>{p.authors?.slice(0,60)} · {p.year} · {p.citations} citations</div>
                      {p.abstract && <div style={{ fontSize: '9px', color: 'var(--t4)', marginTop: '2px', lineHeight: 1.5 }}>{p.abstract}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Dark Web ── */}
          {activeSection === 'cyber' && (
            <div>
              {/* GreyNoise */}
              {result.greynoise && (
                <div style={{ marginBottom:'8px', padding:'8px', background:'rgba(45,212,191,0.05)', border:'1px solid rgba(45,212,191,0.2)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'var(--accent)', marginBottom:'5px', letterSpacing:'0.1em' }}>GREYNOISE — IP CONTEXT</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px' }}>
                    <div className="mono" style={{ fontSize:'9px', color:'var(--t2)' }}>Classification: <strong style={{ color: result.greynoise.classification==='malicious'?'#ef4444':result.greynoise.classification==='benign'?'#4ade80':'#fbbf24' }}>{result.greynoise.classification||'unknown'}</strong></div>
                    <div className="mono" style={{ fontSize:'9px', color:'var(--t2)' }}>Noise: <strong>{String(result.greynoise.noise)}</strong></div>
                    <div className="mono" style={{ fontSize:'9px', color:'var(--t2)' }}>RIOT: <strong>{String(result.greynoise.riot)}</strong></div>
                    {result.greynoise.name && <div className="mono" style={{ fontSize:'9px', color:'var(--t2)' }}>Name: <strong>{result.greynoise.name}</strong></div>}
                    {result.greynoise.lastSeen && <div className="mono" style={{ fontSize:'9px', color:'var(--t4)', gridColumn:'1/-1' }}>Last seen: {result.greynoise.lastSeen}</div>}
                  </div>
                </div>
              )}
              {/* ThreatFox IOCs */}
              {result.threatfox?.length > 0 && (
                <div style={{ marginBottom:'8px', padding:'8px', background:'rgba(239,68,68,0.05)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#ef4444', marginBottom:'5px', letterSpacing:'0.1em' }}>THREATFOX — IOC DATABASE ({result.threatfox.length} matches)</div>
                  {result.threatfox.map((t,i) => (
                    <div key={i} style={{ marginBottom:'4px', padding:'4px 6px', background:'var(--panel)', borderRadius:'2px', borderLeft:'2px solid #ef444460' }}>
                      <div style={{ fontSize:'9px', color:'var(--t1)', fontWeight:600 }}>{t.malware} <span style={{ color:'#ef4444', fontSize:'8px' }}>({t.type})</span></div>
                      <div className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{t.ioc?.slice(0,60)} · Confidence: {t.confidence}% · {t.firstSeen?.slice(0,10)}</div>
                    </div>
                  ))}
                </div>
              )}
              {/* WHOIS/RDAP */}
              {result.whois && (
                <div style={{ marginBottom:'8px', padding:'8px', background:'rgba(96,165,250,0.05)', border:'1px solid rgba(96,165,250,0.2)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#60a5fa', marginBottom:'5px', letterSpacing:'0.1em' }}>WHOIS / RDAP</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px' }}>
                    {result.whois.registrar && <div className="mono" style={{ fontSize:'9px', color:'var(--t2)', gridColumn:'1/-1' }}>Registrar: <strong>{result.whois.registrar}</strong></div>}
                    {result.whois.registrant && <div className="mono" style={{ fontSize:'9px', color:'var(--t2)', gridColumn:'1/-1' }}>Registrant: <strong>{result.whois.registrant}</strong></div>}
                    {result.whois.created && <div className="mono" style={{ fontSize:'9px', color:'var(--t4)' }}>Created: {result.whois.created}</div>}
                    {result.whois.expires && <div className="mono" style={{ fontSize:'9px', color:'var(--t4)' }}>Expires: {result.whois.expires}</div>}
                    {result.whois.nameservers?.length > 0 && <div className="mono" style={{ fontSize:'8px', color:'var(--t4)', gridColumn:'1/-1' }}>NS: {result.whois.nameservers.join(' · ')}</div>}
                  </div>
                </div>
              )}
              {/* Shodan */}
              {result.shodan && (
                <div style={{ marginBottom:'8px', padding:'8px', background:'rgba(249,115,22,0.05)', border:'1px solid rgba(249,115,22,0.2)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#f97316', marginBottom:'5px', letterSpacing:'0.1em' }}>SHODAN INTERNETDB</div>
                  {result.shodan.ports?.length > 0 && <div className="mono" style={{ fontSize:'9px', color:'var(--t2)', marginBottom:'3px' }}>Open ports: <strong>{result.shodan.ports.join(', ')}</strong></div>}
                  {result.shodan.vulns?.length > 0 && <div className="mono" style={{ fontSize:'9px', color:'#ef4444', marginBottom:'3px' }}>⚠ CVEs: {result.shodan.vulns.slice(0,6).join(', ')}</div>}
                  {result.shodan.tags?.length > 0 && <div className="mono" style={{ fontSize:'8px', color:'var(--t4)' }}>Tags: {result.shodan.tags.join(', ')}</div>}
                </div>
              )}
              {/* VirusTotal */}
              {result.virustotal && (
                <div style={{ marginBottom:'8px', padding:'8px', background:'rgba(167,139,250,0.05)', border:'1px solid rgba(167,139,250,0.2)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#a78bfa', marginBottom:'5px', letterSpacing:'0.1em' }}>VIRUSTOTAL</div>
                  <div style={{ display:'flex', gap:'12px' }}>
                    <div style={{ textAlign:'center' }}><div style={{ fontSize:'16px', fontWeight:700, color:'#ef4444' }}>{result.virustotal.malicious}</div><div className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>malicious</div></div>
                    <div style={{ textAlign:'center' }}><div style={{ fontSize:'16px', fontWeight:700, color:'#f97316' }}>{result.virustotal.suspicious}</div><div className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>suspicious</div></div>
                    <div style={{ textAlign:'center' }}><div style={{ fontSize:'16px', fontWeight:700, color:'#4ade80' }}>{result.virustotal.harmless}</div><div className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>harmless</div></div>
                    {result.virustotal.country && <div className="mono" style={{ fontSize:'9px', color:'var(--t4)', alignSelf:'center' }}>Country: {result.virustotal.country}</div>}
                  </div>
                  {result.virustotal.tags?.length > 0 && <div className="mono" style={{ fontSize:'8px', color:'#a78bfa', marginTop:'4px' }}>Tags: {result.virustotal.tags.join(', ')}</div>}
                </div>
              )}
              {/* AbuseIPDB */}
              {result.abuseipdb && (
                <div style={{ marginBottom:'8px', padding:'8px', background:'rgba(239,68,68,0.05)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#ef4444', marginBottom:'5px', letterSpacing:'0.1em' }}>ABUSEIPDB</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px' }}>
                    <div className="mono" style={{ fontSize:'9px', color: result.abuseipdb.score>50?'#ef4444':'#4ade80' }}>Abuse score: <strong>{result.abuseipdb.score}%</strong></div>
                    <div className="mono" style={{ fontSize:'9px', color:'var(--t2)' }}>Reports: {result.abuseipdb.totalReports}</div>
                    {result.abuseipdb.isp && <div className="mono" style={{ fontSize:'9px', color:'var(--t4)' }}>ISP: {result.abuseipdb.isp}</div>}
                    {result.abuseipdb.country && <div className="mono" style={{ fontSize:'9px', color:'var(--t4)' }}>Country: {result.abuseipdb.country}</div>}
                  </div>
                </div>
              )}
              {/* Hunter.io emails */}
              {result.hunterEmails?.length > 0 && (
                <div style={{ marginBottom:'8px', padding:'8px', background:'rgba(251,191,36,0.05)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#fbbf24', marginBottom:'5px', letterSpacing:'0.1em' }}>HUNTER.IO — EMAIL DISCOVERY ({result.hunterEmails.length})</div>
                  {result.hunterEmails.slice(0,8).map((e,i) => (
                    <div key={i} style={{ fontSize:'9px', color:'var(--t2)', marginBottom:'2px', fontFamily:'JetBrains Mono' }}>{e.email} <span style={{ color:'var(--t4)', fontSize:'8px' }}>{e.firstName} {e.lastName} · {e.position}</span></div>
                  ))}
                </div>
              )}
              {/* LeakIX */}
              {result.leakix?.length > 0 && (
                <div style={{ marginBottom:'8px', padding:'8px', background:'rgba(239,68,68,0.05)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#ef4444', marginBottom:'5px', letterSpacing:'0.1em' }}>LEAKIX — EXPOSED SERVICES ({result.leakix.length})</div>
                  {result.leakix.slice(0,5).map((l,i) => (
                    <div key={i} style={{ marginBottom:'3px', fontSize:'9px', color:'var(--t2)', fontFamily:'JetBrains Mono' }}>{l.ip}:{l.port} <span style={{ color:'var(--t4)', fontSize:'8px' }}>{l.protocol} · {l.summary?.slice(0,60)}</span></div>
                  ))}
                </div>
              )}
              {!result.greynoise && !result.threatfox?.length && !result.whois && !result.shodan && !result.virustotal && (
                <div style={{ padding:'20px', textAlign:'center' }}><div className="mono" style={{ fontSize:'9px', color:'var(--t4)' }}>No cyber/technical data — relevant for IP addresses, domains, and technical entities</div></div>
              )}
            </div>
          )}

          {activeSection === 'dark' && (
            <div>
              <div style={{ padding: '6px 8px', background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '3px', marginBottom: '8px' }}>
                <div className="mono" style={{ fontSize: '7px', color: '#a78bfa', lineHeight: 1.7 }}>
                  Source: Ahmia.fi — indexes ~14,000 .onion sites accessible via Tor network.<br/>
                  Results are clearnet-accessible index entries from dark web content.
                </div>
              </div>
              {!result.darkweb?.length ? (
                <div style={{ padding: '10px', textAlign: 'center' }}><div className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>No dark web index matches found</div></div>
              ) : (
                <div style={{ padding: '8px', background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '8px', color: '#a78bfa', marginBottom: '5px', letterSpacing: '0.1em' }}>AHMIA TOR INDEX ({result.darkweb.length} results)</div>
                  {result.darkweb.map((d,i) => (
                    <div key={i} style={{ marginBottom: '4px', padding: '4px 6px', background: 'var(--panel)', borderRadius: '2px', borderLeft: '2px solid rgba(167,139,250,0.4)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--t1)', marginBottom: '1px' }}>{d.title}</div>
                      <div className="mono" style={{ fontSize: '7px', color: '#a78bfa' }}>[{d.source}]</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add to board buttons */}
          {result && onAddNode && (
            <div style={{ marginTop: '8px', padding: '7px 8px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
              <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginBottom: '5px', letterSpacing: '0.1em' }}>ADD TO BOARD</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>

                {/* One-click full graph build */}
                <button className="btn btn-accent" style={{ justifyContent: 'center', fontSize: '10px', padding: '5px', fontWeight: 700, background: 'rgba(45,212,191,0.15)', borderColor: 'rgba(45,212,191,0.5)' }}
                  onClick={() => {
                    const nodes = []
                    // Central entity
                    nodes.push({ type: 'person', label: result.name, detail: result.wiki?.description || result.wikidata?.description || '', source: 'Entity Intel' })
                    // Wikidata relations
                    if (result.wikidata?.nationality) nodes.push({ type: 'location', label: result.wikidata.nationality, detail: 'Nationality', source: 'Wikidata' })
                    if (result.wikidata?.employer) nodes.push({ type: 'org', label: result.wikidata.employer, detail: 'Employer', source: 'Wikidata' })
                    if (result.wikidata?.parties?.length) result.wikidata.parties.slice(0,2).forEach(p => nodes.push({ type: 'org', label: p, detail: 'Political party', source: 'Wikidata' }))
                    if (result.wikidata?.memberOf?.length) result.wikidata.memberOf.slice(0,3).forEach(m => nodes.push({ type: 'org', label: m, detail: 'Member of', source: 'Wikidata' }))
                    if (result.wikidata?.spouse?.length) result.wikidata.spouse.forEach(s => nodes.push({ type: 'person', label: s, detail: 'Spouse', source: 'Wikidata' }))
                    if (result.wikidata?.country) nodes.push({ type: 'location', label: result.wikidata.country, detail: 'Country', source: 'Wikidata' })
                    // Top extracted entities from news
                    if (result.extractedEntities?.length) {
                      result.extractedEntities.slice(0, 10).forEach(e => {
                        if (e.name !== result.name && e.name.length > 3)
                          nodes.push({ type: 'entity', label: e.name, detail: `Mentioned ${e.count}x in news`, source: 'News analysis' })
                      })
                    }
                    // Companies from OpenCorporates
                    if (result.opencorp?.length) result.opencorp.slice(0,3).forEach(c => nodes.push({ type: 'org', label: c.name, detail: `${c.jurisdiction} | ${c.status}`, source: 'OpenCorporates' }))
                    // Dedup and add all
                    const seen = new Set()
                    nodes.forEach(n => { if (n.label && !seen.has(n.label)) { seen.add(n.label); onAddNode(n) } })
                  }}>
                  ◈ Build Full Graph ({(1 + (result.wikidata ? Object.values({a:result.wikidata.nationality,b:result.wikidata.employer,c:result.wikidata.country}).filter(Boolean).length + (result.wikidata.parties?.length||0) + (result.wikidata.memberOf?.length||0) + (result.wikidata.spouse?.length||0) : 0) + Math.min(result.extractedEntities?.length||0, 10) + Math.min(result.opencorp?.length||0, 3))} nodes)
                </button>

                <button className="btn" style={{ justifyContent: 'center', fontSize: '9px' }}
                  onClick={() => onAddNode({ type: 'person', label: result.name, detail: result.wiki?.description || result.wikidata?.description || '', source: 'Entity Intel' })}>
                  + add "{result.name.slice(0,28)}" as node only
                </button>

                {/* Extracted entities from news */}
                {result.extractedEntities?.length > 0 && (
                  <div style={{ marginTop: '5px' }}>
                    <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginBottom: '3px' }}>ENTITIES FOUND IN NEWS ({result.extractedEntities.length})</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                      {result.extractedEntities.slice(0, 20).map((e, i) => (
                        <button key={i} className="mono"
                          style={{ fontSize: '7px', padding: '1px 5px', borderRadius: '2px', cursor: 'pointer', background: 'var(--base)', border: '1px solid var(--border)', color: 'var(--t2)' }}
                          onClick={() => onAddNode({ type: 'entity', label: e.name, detail: `Mentioned ${e.count}× in news coverage`, source: 'News analysis' })}
                          title={`Mentioned ${e.count} times — click to add to board`}>
                          + {e.name} <span style={{ color: 'var(--t4)' }}>×{e.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Wiki linked entities */}
                {result.wikiLinks?.links?.length > 0 && (
                  <div style={{ marginTop: '5px' }}>
                    <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginBottom: '3px' }}>WIKIPEDIA LINKED ENTITIES</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                      {result.wikiLinks.links.slice(0, 15).map((l, i) => (
                        <button key={i} className="mono"
                          style={{ fontSize: '7px', padding: '1px 5px', borderRadius: '2px', cursor: 'pointer', background: 'var(--base)', border: '1px solid var(--border)', color: 'var(--accent)' }}
                          onClick={() => onAddNode({ type: 'entity', label: l, detail: 'Wikipedia linked article', source: 'Wikipedia' })}>
                          + {l.slice(0,25)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', textAlign: 'center', padding: '5px 0 8px' }}>
            {result.enrichedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · 15 sources
          </div>
        </div>
      )}
    </div>
  )
}
