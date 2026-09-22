/**
 * markerTextureCache.js
 * High-performance shared WebGL texture & material cache for NEXUS 3D Globe.
 * Eliminates thousands of per-frame canvas allocations and GPU texture uploads.
 */

const MATERIAL_CACHE = new Map()
const CLUSTER_CACHE = new Map()
let SHARED_PLANE_GEO = null
let SHARED_PLANE_GEO_LARGE = null
let SHARED_CLUSTER_GEO = null

export function getSharedPlaneGeo(THREE, large = false) {
  if (large) {
    if (!SHARED_PLANE_GEO_LARGE) SHARED_PLANE_GEO_LARGE = new THREE.PlaneGeometry(0.048, 0.048)
    return SHARED_PLANE_GEO_LARGE
  }
  if (!SHARED_PLANE_GEO) SHARED_PLANE_GEO = new THREE.PlaneGeometry(0.036, 0.036)
  return SHARED_PLANE_GEO
}

export function getSharedClusterGeo(THREE) {
  if (!SHARED_CLUSTER_GEO) SHARED_CLUSTER_GEO = new THREE.PlaneGeometry(0.088, 0.088)
  return SHARED_CLUSTER_GEO
}

function clr(cx, bg, alpha = 1) {
  cx.clearRect(0, 0, 64, 64)
  if (bg) {
    cx.globalAlpha = alpha
    cx.fillStyle = bg
    cx.beginPath()
    cx.arc(32, 32, 30, 0, Math.PI * 2)
    cx.fill()
    cx.globalAlpha = 1
  }
}

export function getMarkerMaterial(THREE, pt) {
  const type = pt.type || 'default'
  const sev = pt.severity || 'medium'
  const isMil = /^(RCH|JAKE|KNIFE|REACH|NATO|RRR|USAF|THUD|BART|TOPOL|SPAR|SAM|VENUS|VIPER|ATLAS)/i.test(pt.meta?.callsign || pt.callsign || '')
  const shipType = (pt.meta?.shipType || pt.meta?.vesselType || pt.type || '').toLowerCase()
  const isWarship = type === 'warship' || shipType.includes('naval') || shipType.includes('destroyer') || shipType.includes('carrier')

  // Generate cache key
  let cacheKey = `${type}_${sev}`
  if (type === 'aircraft') cacheKey += isMil ? '_mil' : '_civ'
  if (type === 'ship') cacheKey += isWarship ? '_war' : '_com'
  if (type === 'earthquake') cacheKey += `_m${Math.min(8, Math.max(3, Math.round(pt.meta?.mag || pt.mag || 4)))}`

  if (MATERIAL_CACHE.has(cacheKey)) {
    return MATERIAL_CACHE.get(cacheKey)
  }

  // Create canvas once
  const cv = document.createElement('canvas')
  cv.width = cv.height = 64
  const cx = cv.getContext('2d')

  // Draw icon based on type
  if (type === 'hotspot') {
    clr(cx)
    cx.strokeStyle = '#ff2222'; cx.lineWidth = 3; cx.beginPath(); cx.arc(32, 32, 26, 0, Math.PI * 2); cx.stroke()
    cx.strokeStyle = '#ff4444'; cx.lineWidth = 2; cx.beginPath(); cx.arc(32, 32, 14, 0, Math.PI * 2); cx.stroke()
    cx.strokeStyle = '#ff2222'; cx.lineWidth = 2.5
    ;[[32,4,32,18],[32,46,32,60],[4,32,18,32],[46,32,60,32]].forEach(([x1,y1,x2,y2])=>{cx.beginPath();cx.moveTo(x1,y1);cx.lineTo(x2,y2);cx.stroke()})
    cx.fillStyle = '#ffffff'; cx.beginPath(); cx.arc(32, 32, 3, 0, Math.PI * 2); cx.fill()

  } else if (type === 'news') {
    clr(cx, '#1a2a3a', 0.85)
    cx.fillStyle = '#2dd4bf'; cx.fillRect(14, 14, 36, 36)
    cx.fillStyle = '#0a1a2a'
    ;[[16,19,44,21],[16,24,44,26],[16,29,30,31],[16,34,30,36],[16,39,44,41]].forEach(([x1,y1,x2,y2])=>{cx.fillRect(x1,y1,x2-x1,y2-y1)})
    cx.fillStyle = '#ef4444'; cx.fillRect(14, 14, 36, 7)

  } else if (type === 'acled') {
    clr(cx, '#1a0505', 0.85)
    cx.strokeStyle = '#ff2222'; cx.lineWidth = 4; cx.lineCap = 'round'
    cx.beginPath(); cx.moveTo(12, 12); cx.lineTo(52, 52); cx.stroke()
    cx.beginPath(); cx.moveTo(52, 12); cx.lineTo(12, 52); cx.stroke()
    cx.strokeStyle = '#ff8888'; cx.lineWidth = 5
    ;[[12,22,22,12],[42,52,52,42]].forEach(([x1,y1,x2,y2])=>{cx.beginPath();cx.moveTo(x1,y1);cx.lineTo(x2,y2);cx.stroke()})
    cx.fillStyle = '#ff2222'; cx.beginPath(); cx.arc(32, 32, 5, 0, Math.PI * 2); cx.fill()

  } else if (type === 'firms' || type === 'eonet_wildfire') {
    clr(cx)
    cx.fillStyle = '#ff8800'
    cx.beginPath()
    cx.moveTo(32,58); cx.bezierCurveTo(14,50,12,36,20,26); cx.bezierCurveTo(18,34,26,36,28,30)
    cx.bezierCurveTo(28,22,34,16,32,8); cx.bezierCurveTo(40,18,42,28,38,34); cx.bezierCurveTo(44,28,46,20,42,14)
    cx.bezierCurveTo(52,26,52,44,32,58); cx.fill()
    cx.fillStyle = '#ffdd00'
    cx.beginPath()
    cx.moveTo(32,52); cx.bezierCurveTo(22,44,20,34,26,28); cx.bezierCurveTo(26,36,32,36,32,28)
    cx.bezierCurveTo(36,34,40,40,32,52); cx.fill()
    cx.fillStyle = '#ffffff'; cx.globalAlpha = 0.7
    cx.beginPath(); cx.ellipse(32, 42, 5, 8, 0, 0, Math.PI * 2); cx.fill()
    cx.globalAlpha = 1

  } else if (type === 'earthquake') {
    const m = pt.meta?.mag || pt.mag || 4
    const clrE = m >= 7 ? '#ff0000' : m >= 6 ? '#ff4400' : m >= 5 ? '#ff8800' : m >= 4 ? '#ffaa00' : '#ffcc44'
    clr(cx)
    cx.fillStyle = clrE
    cx.beginPath(); cx.moveTo(32,4); cx.lineTo(58,32); cx.lineTo(32,60); cx.lineTo(6,32); cx.closePath(); cx.fill()
    cx.strokeStyle = 'rgba(0,0,0,0.4)'; cx.lineWidth = 2; cx.beginPath()
    cx.moveTo(14,32); cx.lineTo(20,20); cx.lineTo(26,44); cx.lineTo(32,28); cx.lineTo(38,40); cx.lineTo(44,22); cx.lineTo(50,32); cx.stroke()
    if (m >= 5) {
      cx.fillStyle = '#ffffff'; cx.font = 'bold 16px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'
      cx.fillText(`${m.toFixed(1)}`, 32, 32)
    }

  } else if (type === 'hurricane' || type === 'eonet_severe_storms' || type === 'storm') {
    clr(cx, '#1a0030', 0.8)
    cx.strokeStyle = '#cc44ff'; cx.lineWidth = 3
    ;[22,16,10].forEach((r,i)=>{ cx.globalAlpha = 1 - i * 0.25; cx.beginPath(); cx.arc(32, 32, r, 0, Math.PI * 1.7); cx.stroke() })
    cx.globalAlpha = 1
    cx.strokeStyle = '#dd66ff'; cx.lineWidth = 2; cx.beginPath(); cx.arc(32, 32, 28, 0, Math.PI * 2); cx.stroke()
    cx.fillStyle = '#ffffff'; cx.beginPath(); cx.arc(32, 32, 5, 0, Math.PI * 2); cx.fill()
    cx.fillStyle = '#cc44ff'; cx.beginPath(); cx.arc(32, 32, 3, 0, Math.PI * 2); cx.fill()

  } else if (type === 'volcano' || type === 'eonet_volcanoes') {
    clr(cx)
    cx.fillStyle = '#ff4400'; cx.beginPath(); cx.ellipse(32, 56, 20, 8, 0, 0, Math.PI * 2); cx.fill()
    cx.fillStyle = '#882200'; cx.beginPath(); cx.moveTo(32, 10); cx.lineTo(56, 56); cx.lineTo(8, 56); cx.closePath(); cx.fill()
    cx.fillStyle = '#884422'; cx.beginPath(); cx.moveTo(32, 10); cx.lineTo(40, 28); cx.lineTo(24, 28); cx.closePath(); cx.fill()
    cx.fillStyle = '#ff2200'; cx.beginPath(); cx.ellipse(32, 13, 5, 3, 0, 0, Math.PI * 2); cx.fill()
    cx.fillStyle = '#ff8800'; cx.globalAlpha = 0.9
    ;[[32,8,4,14],[26,6,3,10],[38,7,3,10]].forEach(([x,y,rx,ry])=>{ cx.beginPath(); cx.ellipse(x,y,rx,ry,-0.3,0,Math.PI*2); cx.fill() })
    cx.globalAlpha = 1

  } else if (type === 'gpsjam') {
    clr(cx, '#241400', 0.85)
    cx.strokeStyle = '#f59e0b'; cx.lineWidth = 3
    ;[26, 18, 10].forEach((r, i) => {
      cx.globalAlpha = 1 - i * 0.2
      cx.beginPath(); cx.arc(32, 32, r, 0, Math.PI * 2); cx.stroke()
    })
    cx.globalAlpha = 1
    // Lightning bolt in center
    cx.fillStyle = '#ffdd00'
    cx.beginPath(); cx.moveTo(34, 18); cx.lineTo(26, 32); cx.lineTo(32, 32); cx.lineTo(28, 46); cx.lineTo(38, 30); cx.lineTo(32, 30); cx.closePath(); cx.fill()

  } else if (type === 'darkfleet') {
    clr(cx, '#1a0525', 0.9)
    cx.strokeStyle = '#c084fc'; cx.lineWidth = 2.5
    cx.strokeRect(10, 10, 44, 44)
    // Stealth ship silhouette
    cx.fillStyle = '#c084fc'
    cx.beginPath(); cx.moveTo(32, 16); cx.lineTo(44, 44); cx.lineTo(20, 44); cx.closePath(); cx.fill()
    // Warning dot
    cx.fillStyle = '#ff4444'; cx.beginPath(); cx.arc(32, 32, 4, 0, Math.PI * 2); cx.fill()

  } else if (type === 'sarRadar' || type === 'sar') {
    clr(cx, '#001a2c', 0.9)
    // Radar grid
    cx.strokeStyle = '#38bdf8'; cx.lineWidth = 2
    cx.beginPath(); cx.arc(32, 32, 26, 0, Math.PI * 2); cx.stroke()
    cx.beginPath(); cx.moveTo(6, 32); cx.lineTo(58, 32); cx.stroke()
    cx.beginPath(); cx.moveTo(32, 6); cx.lineTo(32, 58); cx.stroke()
    // Sweep line
    cx.strokeStyle = '#7dd3fc'; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(32, 32); cx.lineTo(52, 16); cx.stroke()
    cx.fillStyle = '#38bdf8'; cx.beginPath(); cx.arc(42, 24, 3, 0, Math.PI * 2); cx.fill()

  } else if (type === 'bgp') {
    clr(cx, '#261000', 0.9)
    cx.strokeStyle = '#ff6600'; cx.lineWidth = 3
    cx.beginPath(); cx.arc(32, 32, 24, 0, Math.PI * 2); cx.stroke()
    // Slashed network node
    cx.strokeStyle = '#ffffff'; cx.lineWidth = 2.5
    cx.beginPath(); cx.moveTo(18, 46); cx.lineTo(46, 18); cx.stroke()
    cx.fillStyle = '#ff6600'; cx.beginPath(); cx.arc(22, 22, 4, 0, Math.PI * 2); cx.fill()
    cx.beginPath(); cx.arc(42, 42, 4, 0, Math.PI * 2); cx.fill()

  } else if (type === 'nuclear') {
    clr(cx, '#262600', 0.9)
    cx.fillStyle = '#ffff00'
    // Radiation trefoil
    ;[0, 120, 240].forEach(deg => {
      const rad = deg * Math.PI / 180
      cx.beginPath()
      cx.arc(32, 32, 24, rad - 0.5, rad + 0.5)
      cx.lineTo(32, 32)
      cx.closePath()
      cx.fill()
    })
    cx.fillStyle = '#000000'; cx.beginPath(); cx.arc(32, 32, 10, 0, Math.PI * 2); cx.fill()
    cx.fillStyle = '#ffff00'; cx.beginPath(); cx.arc(32, 32, 4, 0, Math.PI * 2); cx.fill()

  } else if (type === 'cyber') {
    clr(cx, '#240024', 0.9)
    cx.strokeStyle = '#ff00ff'; cx.lineWidth = 2.5
    cx.strokeRect(12, 14, 40, 32)
    cx.fillStyle = '#ff00ff'; cx.font = 'bold 16px monospace'; cx.textAlign = 'center'; cx.textBaseline = 'middle'
    cx.fillText('>_', 32, 30)

  } else if (type === 'aircraft' || type === 'milaircraft') {
    clr(cx)
    const isM = type === 'milaircraft' || isMil
    const bodyClr = isM ? '#ff4444' : '#00ffcc'
    const wingClr = isM ? '#ff8888' : '#88ffee'
    // Pointing UP (0°) — rotation handled by mesh.rotation.z
    cx.fillStyle = bodyClr; cx.beginPath(); cx.ellipse(32, 32, 5, 22, 0, 0, Math.PI * 2); cx.fill()
    cx.fillStyle = wingClr
    cx.beginPath(); cx.moveTo(32, 28); cx.lineTo(6, 40); cx.lineTo(10, 46); cx.lineTo(32, 38); cx.closePath(); cx.fill()
    cx.beginPath(); cx.moveTo(32, 28); cx.lineTo(58, 40); cx.lineTo(54, 46); cx.lineTo(32, 38); cx.closePath(); cx.fill()
    cx.fillStyle = bodyClr
    cx.beginPath(); cx.moveTo(32, 50); cx.lineTo(22, 58); cx.lineTo(25, 60); cx.lineTo(32, 54); cx.closePath(); cx.fill()
    cx.beginPath(); cx.moveTo(32, 50); cx.lineTo(42, 58); cx.lineTo(39, 60); cx.lineTo(32, 54); cx.closePath(); cx.fill()
    cx.fillStyle = '#ffffff'; cx.globalAlpha = 0.8
    cx.beginPath(); cx.arc(32, 12, 3, 0, Math.PI * 2); cx.fill()
    cx.globalAlpha = 1

  } else if (type === 'ship' || type === 'warship') {
    clr(cx)
    const hullClr = isWarship ? '#8888ff' : '#0088ff'
    const deckClr = isWarship ? '#aaaaff' : '#44aaff'
    // Pointing UP (0°) — bow at top, stern at bottom
    cx.fillStyle = hullClr
    cx.beginPath()
    cx.moveTo(32, 6)
    cx.bezierCurveTo(42, 12, 44, 32, 43, 52)
    cx.lineTo(43, 56); cx.lineTo(21, 56)
    cx.lineTo(21, 52)
    cx.bezierCurveTo(20, 32, 22, 12, 32, 6)
    cx.closePath(); cx.fill()
    cx.fillStyle = deckClr; cx.fillRect(26, 20, 12, 20)
    cx.fillStyle = '#ffffff'; cx.globalAlpha = 0.6; cx.fillRect(29, 14, 6, 6); cx.globalAlpha = 1

  } else if (type === 'gdacs') {
    clr(cx)
    const gdacsC = pt.meta?.alertlevel === 'red' ? '#ff1111' : '#ff7700'
    cx.fillStyle = gdacsC
    cx.beginPath(); cx.moveTo(32, 6); cx.lineTo(58, 54); cx.lineTo(6, 54); cx.closePath(); cx.fill()
    cx.strokeStyle = '#ffffff'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(32, 6); cx.lineTo(58, 54); cx.lineTo(6, 54); cx.closePath(); cx.stroke()
    cx.fillStyle = '#ffffff'; cx.font = 'bold 22px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'
    cx.fillText('!', 32, 38)

  } else {
    // Default circular pin
    clr(cx)
    const sevClr = sev === 'critical' ? '#ff2222' : sev === 'high' ? '#ff8800' : sev === 'medium' ? '#ffdd00' : '#2dd4bf'
    cx.fillStyle = sevClr; cx.beginPath(); cx.arc(32, 32, 22, 0, Math.PI * 2); cx.fill()
    cx.strokeStyle = '#ffffff'; cx.lineWidth = 2; cx.globalAlpha = 0.6; cx.beginPath(); cx.arc(32, 32, 26, 0, Math.PI * 2); cx.stroke(); cx.globalAlpha = 1
  }

  const tex = new THREE.CanvasTexture(cv)
  tex.minFilter = THREE.LinearFilter
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  })

  MATERIAL_CACHE.set(cacheKey, mat)
  return mat
}

export function getClusterMaterial(THREE, clusterType, count) {
  const cntStr = count >= 1000 ? `${Math.round(count / 1000)}k` : String(count)
  const key = `${clusterType}_${cntStr}`
  if (CLUSTER_CACHE.has(key)) return CLUSTER_CACHE.get(key)

  const cv = document.createElement('canvas')
  cv.width = cv.height = 96
  const cx = cv.getContext('2d')

  const TYPE_CLR = {
    aircraft: '#00ffcc', milaircraft: '#ff4444', ship: '#0088ff', warship: '#8888ff',
    acled: '#ff1111', hotspot: '#ff3333', cyber: '#ff00ff', disease: '#22cc88',
    nuclear: '#ffff00', gpsjam: '#f59e0b', firms: '#ff4400', news: '#2dd4bf',
    notam: '#ff8844', wikiEdit: '#aaaaff', bgp: '#ff6600', viirs: '#ffffff',
    gdacs: '#ffaa00', eonet_wildfire: '#ff3300', darkfleet: '#c084fc', sarRadar: '#38bdf8',
  }
  const TYPE_ICON = {
    aircraft: '✈', milaircraft: '✈', ship: '🚢', warship: '⚔',
    acled: '⚔', hotspot: '🎯', cyber: '💻', disease: '🦠',
    nuclear: '☢', gpsjam: '📡', firms: '🔥', news: '📰',
    notam: '🚫', wikiEdit: '📝', bgp: '🌐', viirs: '🛰',
    gdacs: '⚠', eonet_wildfire: '🔥', darkfleet: '🏴‍☠️', sarRadar: '🛰',
  }

  const clr = TYPE_CLR[clusterType] || '#2dd4bf'
  const icon = TYPE_ICON[clusterType] || '◉'

  cx.font = '50px sans-serif'
  cx.textAlign = 'center'; cx.textBaseline = 'middle'
  cx.fillText(icon, 48, 40)

  const pillW = cntStr.length > 2 ? 22 : 18
  cx.fillStyle = clr + 'ee'
  cx.beginPath(); cx.roundRect(48 - pillW, 70, pillW * 2, 18, 8); cx.fill()
  cx.fillStyle = '#000000'
  cx.font = 'bold 11px monospace'
  cx.textAlign = 'center'; cx.textBaseline = 'middle'
  cx.fillText(cntStr, 48, 79)

  const tex = new THREE.CanvasTexture(cv)
  tex.minFilter = THREE.LinearFilter
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  })

  CLUSTER_CACHE.set(key, mat)
  return mat
}
