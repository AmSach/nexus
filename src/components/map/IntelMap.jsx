/**
 * IntelMap — 3D WebGL Globe
 *
 * Three.js loaded from CDN script tag (no package needed, no Rollup issues).
 * Country borders from Natural Earth GeoJSON via CDN.
 * Real ACLED conflict events + NASA FIRMS thermal anomalies + news article markers.
 * Auto-rotate, drag orbit, scroll zoom, click markers for detail panel.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useStore } from '../../store'
import { fetchACLED } from '../../hooks/useACLED'
import { fetchFIRMSGlobal } from '../../hooks/useFIRMS'
import { cacheRead, cacheWrite } from '../../utils/cache'
import { useSatellite, satelliteToPoints, SAT_COLORS } from '../../hooks/useSatellite'
import { useLiveAlerts } from '../../hooks/useLiveAlerts'
import { RefreshCw, X, ExternalLink, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

const SEV_COLORS_HEX = { critical: 0xef4444, high: 0xf97316, medium: 0xeab308, low: 0x2dd4bf }
const SEV_COLORS_CSS = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#2dd4bf' }

// Emoji icons per event type — shown in hover tooltip
const TYPE_ICONS = {
  hotspot:             '◎',
  news:                '◉',
  acled:               '⚔',
  firms:               '🔥',
  earthquake:          '⚡',
  hurricane:           '🌀',
  volcano:             '🌋',
  eonet_wildfire:      '🔥',
  eonet_severe_storms: '⛈',
  eonet_volcanoes:     '🌋',
  eonet_sea_and_lake_ice: '🧊',
  eonet_other:         '🛰',
  gdacs:               '⚠',
  copernicus:          '🛰',
  sigmet:              '✈',
  aircraft:            '✈',
  ship:                '🚢',
  disease:             '🦠',
  cyber:               '💻',
  nuclear:             '☢️',
  maritime:            '⚓',
  humanitarian:        '🆘',
  social:              '📡',
  // New types
  milaircraft:         '✈',
  warship:             '⚔',
  gpsjam:              '📡',
  vuln:                '🔓',
  cve:                 '⚠️',
  iss:                 '🛸',
  launch:              '🚀',
  flood:               '🌊',
  weather:             '⛈',
  notam:               '🚫',
  wikiEdit:            '📝',
  bgp:                 '🌐',
  viirs:               '🛰️',
  telegram:            '📡',
  preaction:           '⚡',
}

function latLngToVec3(lat, lng, r = 1) {
  const phi   = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return {
    x: -r * Math.sin(phi) * Math.cos(theta),
    y:  r * Math.cos(phi),
    z:  r * Math.sin(phi) * Math.sin(theta),
  }
}

// Static monitoring hotspots
const HOTSPOTS = [
  { lat: 48.5,  lng: 35.0,  name: 'Ukraine Frontline',   sev: 'critical', desc: 'Active war zone. Russian offensive operations ongoing.' },
  { lat: 31.5,  lng: 34.5,  name: 'Gaza Strip',          sev: 'critical', desc: 'Active conflict zone. IDF operations in Gaza.' },
  { lat: 34.9,  lng: 50.5,  name: 'Iran — Fordow',       sev: 'high',     desc: 'IAEA nuclear monitoring site. Enrichment activity.' },
  { lat: 24.0,  lng: 121.5, name: 'Taiwan Strait',       sev: 'high',     desc: 'PLA activity. Cross-strait tension monitoring zone.' },
  { lat: 18.0,  lng: 39.0,  name: 'Red Sea / Houthi',    sev: 'high',     desc: 'Houthi shipping attacks. US/UK naval operations.' },
  { lat: 33.7,  lng: 74.8,  name: 'Kashmir LoC',         sev: 'medium',   desc: 'India-Pakistan Line of Control. Skirmish monitoring.' },
  { lat: 15.0,  lng: 2.0,   name: 'Sahel Region',        sev: 'medium',   desc: 'Instability across Mali, Niger, Burkina Faso.' },
  { lat: 13.6,  lng: 25.4,  name: 'Sudan — Darfur',      sev: 'high',     desc: 'RSF-SAF civil war. Humanitarian crisis.' },
  { lat: 38.0,  lng: 127.0, name: 'Korean DMZ',          sev: 'medium',   desc: 'DPRK military activity. Missile monitoring.' },
  { lat: -1.5,  lng: 29.5,  name: 'DRC — Eastern Congo', sev: 'high',     desc: 'M23 / Rwanda conflict. Active combat zone.' },
  { lat: 19.7,  lng: 96.1,  name: 'Myanmar',             sev: 'high',     desc: 'Junta vs resistance. Civil war ongoing.' },
  { lat: 57.5,  lng: 19.5,  name: 'Baltic Sea',          sev: 'medium',   desc: 'NATO-Russia tension corridor.' },
  { lat: 26.6,  lng: 56.3,  name: 'Strait of Hormuz',    sev: 'high',     desc: 'Critical oil choke point. Iran proximity.' },
]

export default function IntelMap({ articles }) {
  const { keys, addNode } = useStore()
  const mountRef  = useRef(null)
  const threeRef  = useRef({})
  const frameRef  = useRef(null)
  const isDragging = useRef(false)
  const prevMouse  = useRef({ x: 0, y: 0 })
  const rotVel     = useRef({ x: 0, y: 0 })
  const autoRotateRef = useRef(true)  // ref so animation loop always reads current value

  const [threeReady, setThreeReady] = useState(false)
  const [geoReady,   setGeoReady]   = useState(false)
  const [acledData,  setAcledData]  = useState([])
  const [firmsData,  setFirmsData]  = useState([])
  const [loading,    setLoading]    = useState(false)
  const [lastFetch,  setLastFetch]  = useState(null)
  const [selected,   setSelected]   = useState(null)
  const [expandedCluster, setExpandedCluster] = useState(null) // for cluster expand panel
  const [hovered,    setHovered]    = useState(null)   // hover tooltip data
  const [hovPos,     setHovPos]     = useState({x:0,y:0}) // cursor position
  const { data: satData, loading: satLoading, lastFetch: satLastFetch, refresh: satRefresh } = useSatellite()
  const { alerts: liveAlerts } = useLiveAlerts()
  const [showCategories, setShowCategories] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState(null)
  const [layers,     setLayers]     = useState({
    // ENV mode defaults — matches what the mapMode effect sets for 'environment'
    aircraft:true, ships:true, gdacs:true, firms:true, eonet:true,
    iss:true, launches:true, copernicus:true, sigmets:true, disease:true,
    // Everything else off by default
    hotspots:false, acled:false, milaircraft:false, warships:false, news:false,
    cyber:false, gpsjam:false, nuclear:false, humanitarian:false,
    vuln:false, cve:false, crowds:false, maritime:false,
    iris:false, redditSignals:false, globalFires:false,
    earthquakes:false, volcanoes:false, hurricanes:false, floods:false, weatherAlerts:false,
    notams:false, wikiEdits:false, bgp:false, viirs:false,
    telegram:false, preaction:false,
    ucdp:true, sanctions:false, osmMilitary:false, wikiConflicts:true, arms:false,
  })
  const [autoRotate, setAutoRotate] = useState(true)
  const [mapMode,    setMapMode]    = useState('environment') // 'environment' | 'intelligence'
  // Timeline removed — these are kept to avoid refactoring all deps
  // eslint-disable-next-line
  const [timePreset, setTimePreset] = useState('all')
  // eslint-disable-next-line
  const [customFrom, setCustomFrom] = useState('')
  // eslint-disable-next-line
  const [customTo, setCustomTo] = useState('')
  // eslint-disable-next-line
  const [showCustom, setShowCustom] = useState(false)
  // Switch layer defaults when mapMode changes
  React.useEffect(() => {
    if (mapMode === 'intelligence') {
      setLayers(l => ({ ...l,
        hotspots:true, acled:true, milaircraft:true, warships:true, news:true,
        cyber:true, gpsjam:true, nuclear:true, maritime:true, vuln:true,
        cve:true, firms:true, disease:true, notams:true, wikiEdits:true, bgp:true, viirs:true,
        telegram:true, preaction:true, crowds:true, humanitarian:true, iris:true,
        ucdp:true, wikiConflicts:true, osmMilitary:false, sanctions:false, arms:false,
        aircraft:false, ships:false, gdacs:false, eonet:false,
        iss:false, launches:false, copernicus:false, sigmets:false,
        redditSignals:false, earthquakes:false, volcanoes:false, hurricanes:false,
        floods:false, weatherAlerts:false, globalFires:false,
      }))
    } else {
      setLayers(l => ({ ...l,
        aircraft:true, ships:true, gdacs:true, firms:true, eonet:true,
        iss:true, launches:true, copernicus:true, sigmets:true, disease:true,
        hotspots:false, acled:false, milaircraft:false, warships:false, news:false,
        cyber:false, gpsjam:false, nuclear:false, maritime:false, vuln:false, cve:false,
        humanitarian:false, crowds:false, redditSignals:false, notams:false, wikiEdits:false, bgp:false, viirs:false,
        telegram:false, preaction:false,
        earthquakes:false, volcanoes:false, hurricanes:false, floods:false, weatherAlerts:false,
      }))
    }
  }, [mapMode])

  // Time filtering helpers
  const TIME_PRESETS = [
    { id:'1h',    label:'1h',     ms: 60*60*1000 },
    { id:'6h',    label:'6h',     ms: 6*60*60*1000 },
    { id:'24h',   label:'24h',    ms: 24*60*60*1000 },
    { id:'3d',    label:'3d',     ms: 3*24*60*60*1000 },
    { id:'7d',    label:'7d',     ms: 7*24*60*60*1000 },
    { id:'30d',   label:'30d',    ms: 30*24*60*60*1000 },
    { id:'all',   label:'All',    ms: null },
    { id:'custom',label:'Custom', ms: null },
  ]
  const activePreset = TIME_PRESETS.find(p => p.id === timePreset) || TIME_PRESETS[2]

  // Filter a point by timestamp — returns true if it should show
  const inTimeRange = React.useCallback((pt) => {
    if (timePreset === 'all') return true
    // Get point timestamp
    const rawTs = pt.date || pt.time || pt.pub || pt.ts || pt._fetchedAt
    if (!rawTs) return true  // no timestamp = always show
    const ts = new Date(rawTs).getTime()
    if (isNaN(ts)) return true
    const now = Date.now()
    if (timePreset === 'custom') {
      const from = customFrom ? new Date(customFrom).getTime() : 0
      const to   = customTo   ? new Date(customTo + 'T23:59:59').getTime() : now
      return ts >= from && ts <= to
    }
    return ts >= (now - activePreset.ms)
  }, [timePreset, customFrom, customTo, activePreset])

  // Keep ref in sync with state for animation loop
  useEffect(() => { autoRotateRef.current = autoRotate }, [autoRotate])

  // ── Alert Watchers — localStorage-persisted ───────────────────────────
  const [watchers, setWatchers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus-watchers') || '[]') } catch { return [] }
  })
  const [watcherAlerts, setWatcherAlerts] = useState([])
  const [showWatchers, setShowWatchers] = useState(false)
  const [newWatcher, setNewWatcher] = useState({ type:'earthquake', minMag:5.5, region:'', label:'' })
  useEffect(() => { localStorage.setItem('nexus-watchers', JSON.stringify(watchers)) }, [watchers])

  // ── Geofence ──────────────────────────────────────────────────────────
  const [geofenceMode, setGeofenceMode] = useState(false)
  const [geofencePoints, setGeofencePoints] = useState([])  // [{lat,lng}]
  const geofenceRef = useRef([])

  // ── ISS orbital trail (next 92min predicted ground track) ─────────────
  const issTrailPoints = useMemo(() => {
    if (!satData?.iss) return []
    const { lat, lng } = satData.iss
    // ISS orbital params: period ~92min, inclination ~51.6°, speed ~7.66km/s
    // Simplified propagation: advance longitude by Earth-rotation + ISS-orbit per step
    const steps = 60  // one point per ~1.5 min
    const periodMin = 92
    const inclinationDeg = 51.6
    const trail = []
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * periodMin  // minutes ahead
      const orbitFrac = t / periodMin    // fraction of one orbit completed
      const earthRotDeg = t * (360 / (24 * 60))  // Earth rotation during that time
      // Simplified ground track: lat oscillates with orbital inclination
      const phase = orbitFrac * 2 * Math.PI
      const trackLat = inclinationDeg * Math.sin(phase + Math.asin(lat / inclinationDeg))
      const trackLng = ((lng + orbitFrac * 360 - earthRotDeg) % 360 + 540) % 360 - 180
      trail.push({ lat: Math.max(-inclinationDeg, Math.min(inclinationDeg, trackLat)), lng: trackLng })
    }
    return trail
  }, [satData?.iss])

  // ── Draw ISS orbital trail on globe ───────────────────────────────────
  useEffect(() => {
    const { THREE, globe } = threeRef.current
    if (!THREE || !globe || !layers.iss) return
    // Remove old trail
    const old = globe.getObjectByName('iss-trail')
    if (old) globe.remove(old)
    if (issTrailPoints.length < 2) return
    const pts = issTrailPoints.map(p => {
      const v = latLngToVec3(p.lat, p.lng, 1.012)
      return new THREE.Vector3(v.x, v.y, v.z)
    })
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.45, linewidth: 1 })
    const line = new THREE.Line(geo, mat)
    line.name = 'iss-trail'
    globe.add(line)
    return () => { if (globe) { const t = globe.getObjectByName('iss-trail'); if (t) globe.remove(t) } }
  }, [issTrailPoints, layers.iss, threeRef.current.globe])

  // ── Load Three.js from CDN via script tag ─────────────────────────────
  useEffect(() => {
    if (window.THREE) { setThreeReady(true); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
    script.onload = () => setThreeReady(true)
    script.onerror = () => console.error('Three.js CDN failed')
    document.head.appendChild(script)
    return () => {}
  }, [])

  // ── Fetch live ACLED + FIRMS — cache-first, 10min TTL ─────────────────
  const fetchLive = useCallback(async (force = false) => {
    // Serve from cache instantly on mount
    if (!force) {
      const cachedAcled = cacheRead('acled', 10 * 60 * 1000)
      const cachedFirms = cacheRead('firms', 10 * 60 * 1000)
      if (cachedAcled?.data) setAcledData(cachedAcled.data)
      if (cachedFirms?.data) setFirmsData(cachedFirms.data)
      // If both caches are fresh, skip network fetch
      if (cachedAcled?.age < 5 * 60 * 1000 && cachedFirms?.age < 5 * 60 * 1000) return
    }
    setLoading(true)
    try {
      const [acled, firms] = await Promise.allSettled([
        fetchACLED('', keys.acled_key, keys.acled_email, keys.acled_pass),
        fetchFIRMSGlobal('08be3187f8c1526e0fd30249ee2c3374'),
      ])
      if (acled.status === 'fulfilled' && acled.value?.length) {
        setAcledData(acled.value)
        cacheWrite('acled', acled.value, 500)
      }
      if (firms.status === 'fulfilled' && firms.value?.length) {
        setFirmsData(firms.value)
        cacheWrite('firms', firms.value, 1000)
      }
      setLastFetch(new Date())
    } finally { setLoading(false) }
  }, [keys.acled_key, keys.acled_email, keys.acled_pass])

  useEffect(() => { fetchLive() }, [fetchLive])

  // ── Init Three.js globe once Three is ready ───────────────────────────
  useEffect(() => {
    if (!threeReady || !mountRef.current) return
    const THREE = window.THREE
    const el = mountRef.current
    const W = el.clientWidth || 800
    const H = el.clientHeight || 500

    // Scene
    const scene    = new THREE.Scene()
    const camera   = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000)
    camera.position.z = 2.8

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x020810, 1)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    el.appendChild(renderer.domElement)

    // Stars
    const starGeo = new THREE.BufferGeometry()
    const starArr = new Float32Array(6000)
    for (let i = 0; i < 6000; i++) starArr[i] = (Math.random() - 0.5) * 800
    starGeo.setAttribute('position', new THREE.BufferAttribute(starArr, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, transparent: true, opacity: 0.5 })))

    // Globe — ocean base
    const globeGeo = new THREE.SphereGeometry(1, 64, 64)
    const globeMat = new THREE.MeshPhongMaterial({ color: 0x030d1f, specular: 0x112244, shininess: 12 })
    const globe    = new THREE.Mesh(globeGeo, globeMat)
    scene.add(globe)

    // Graticule lines (lat/lng grid)
    const lineGroup = new THREE.Group()
    const lineMat   = new THREE.LineBasicMaterial({ color: 0x1a3050, transparent: true, opacity: 0.4 })
    for (let lat = -75; lat <= 75; lat += 15) {
      const pts = []
      for (let lng = 0; lng <= 360; lng += 3) {
        const v = latLngToVec3(lat, lng - 180, 1.001)
        pts.push(new THREE.Vector3(v.x, v.y, v.z))
      }
      lineGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat))
    }
    for (let lng = -180; lng <= 180; lng += 15) {
      const pts = []
      for (let lat = -90; lat <= 90; lat += 3) {
        const v = latLngToVec3(lat, lng, 1.001)
        pts.push(new THREE.Vector3(v.x, v.y, v.z))
      }
      lineGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat))
    }
    globe.add(lineGroup)

    // Atmosphere glow
    const atmGeo = new THREE.SphereGeometry(1.08, 64, 64)
    const atmMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vNormal; void main() { float i = pow(0.55 - dot(vNormal, vec3(0,0,1.0)), 3.5); gl_FragColor = vec4(0.1,0.5,0.9,1.0) * i * 0.8; }`,
      blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true,
    })
    scene.add(new THREE.Mesh(atmGeo, atmMat))

    // Lighting
    scene.add(new THREE.AmbientLight(0x223355, 0.9))
    const sun = new THREE.DirectionalLight(0xffffff, 0.8)
    sun.position.set(5, 3, 5)
    scene.add(sun)
    const rim = new THREE.DirectionalLight(0x2244aa, 0.3)
    rim.position.set(-5, -2, -3)
    scene.add(rim)

    // Country border lines from GeoJSON
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(topo => {
        const borders = drawCountryBorders(THREE, topo)
        if (borders) globe.add(borders)
        setGeoReady(true)
      })
      .catch(() => setGeoReady(true))

    // Raycaster for click detection
    const raycaster = new THREE.Raycaster()

    // Animation loop — reads autoRotateRef.current so state changes propagate instantly
    let frameTimeSamples = []
    let lastFrameTime = performance.now()
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)
      // Measure frame time for adaptive quality
      const now = performance.now()
      const ft = now - lastFrameTime
      lastFrameTime = now
      frameTimeSamples.push(ft)
      if (frameTimeSamples.length > 30) frameTimeSamples.shift()
      const avgFT = frameTimeSamples.reduce((a,b)=>a+b,0) / frameTimeSamples.length
      // Expose avg frame time so safePoints memo can adapt
      threeRef.current._avgFrameMs = avgFT
      const _t = Date.now() * 0.001
      // Pulse glow on hotspots, hurricanes, ISS, critical markers
      if (threeRef.current?.markerMeshes) {
        threeRef.current.markerMeshes.forEach((mesh, i) => {
          const pt = threeRef.current.markerData?.[i]
          if (!pt || pt._trail) return
          if (['hotspot','hurricane','iss'].includes(pt.type) || pt.severity==='critical') {
            if (mesh.material?.opacity !== undefined && !mesh.geometry?.isRingGeometry) {
              mesh.material.opacity = 0.60 + 0.40 * Math.abs(Math.sin(_t * 2.2 + i * 0.5))
              mesh.material.needsUpdate = true
            }
          }
          // Navigation glow: pulse the marker we just flew to from categories
          const nav = threeRef.current._navigatedTo
          if (nav && pt.lat && pt.lng &&
              Math.abs(pt.lat - nav.lat) < 0.01 && Math.abs(pt.lng - nav.lng) < 0.01) {
            const glow = 1 + 0.6 * Math.abs(Math.sin(_t * 4))
            mesh.scale.set(glow, glow, glow)
            if (mesh.material) {
              mesh.material.opacity = 0.7 + 0.3 * Math.abs(Math.sin(_t * 4))
              mesh.material.needsUpdate = true
            }
          }
        })
      }
      if (autoRotateRef.current && !isDragging.current) globe.rotation.y += 0.0012
      if (!isDragging.current) {
        if (Math.abs(rotVel.current.x) > 0.0001 || Math.abs(rotVel.current.y) > 0.0001) {
          globe.rotation.x += rotVel.current.x
          globe.rotation.y += rotVel.current.y
          rotVel.current.x *= 0.93
          rotVel.current.y *= 0.93
        }
      }
      // Pulse critical markers
      const t = Date.now() * 0.003
      ;(threeRef.current.markerMeshes || []).forEach((m, i) => {
        const d = (threeRef.current.markerData || [])[i]
        if (!d) return
        if (d.severity === 'critical') {
          const s = 1 + 0.35 * Math.sin(t * 2.2 + i)
          m.scale.set(s, s, s)
          if (m.material) m.material.opacity = 0.7 + 0.3 * Math.sin(t * 2.2 + i)
        } else if (d.severity === 'high') {
          const s = 1 + 0.15 * Math.sin(t + i * 0.7)
          m.scale.set(s, s, s)
        }
      })
      renderer.render(scene, camera)
    }
    animate()

    // Resize — watch the mount element itself with ResizeObserver
    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(onResize)
    ro.observe(el)

    threeRef.current = { THREE, scene, camera, renderer, globe, raycaster, markerMeshes: [], markerData: [] }

    return () => {
      cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      try { renderer.dispose(); el.removeChild(renderer.domElement) } catch {}
    }
  }, [threeReady])

  // ── Update markers when data or layers change ─────────────────────────
  const newsPoints = useMemo(() => {
    if (!layers.news) return []
    return articles.filter(a => a.title || a.summary).map(a => {
      // Try precise country extraction from article text first
      let c = extractCountryCoords(a)
      if (!c) c = regionToLatLng(a.region)
      if (!c) return null
      // Jitter scaled to precision: small for city-level, medium for country-level
      const isCity = extractCountryCoords(a) !== null
      const jScale = isCity ? 1.5 : 5.0
      const j = () => (Math.random() - 0.5) * jScale
      return {
        type: 'news',
        lat: Math.max(-85, Math.min(85, c[0] + j())),
        lng: c[1] + j(),
        severity: a.severity || 'low',
        title: a.title, summary: a.summary,
        source: a.source, url: a.url, pub: a.pub
      }
    }).filter(Boolean)
  }, [articles, layers.news])

  // Also include ISS as special single point if active
  const issPoint = useMemo(() => {
    if (!layers.iss || !satData?.iss) return []
    return [{ ...satData.iss, type:'iss', name:'🛸 ISS', severity:'low' }]
  }, [satData?.iss, layers.iss])

  const allPoints = useMemo(() => {
    const alertPoints = (liveAlerts || [])
      .filter(a => a.lat && a.lng && !isNaN(parseFloat(a.lat)) && !isNaN(parseFloat(a.lng)))
      .filter(a => {
        if (a.type === 'gps_jam')   return layers.gpsjam
        if (a.type === 'conflict')  return layers.acled
        if (a.type === 'nuclear')   return layers.nuclear
        if (a.type === 'maritime')  return layers.maritime
        if (a.type === 'disease')   return layers.disease
        if (a.type === 'cyber')     return layers.cyber
        if (a.type === 'notam')     return layers.notams
        if (a.type === 'red_alert') return layers.acled
        if (a.type === 'naval')     return layers.warships
        if (a.type === 'news')      return layers.news
        return layers.gdacs || true  // weather/disasters always show
      })
      .map(a => ({
        lat: parseFloat(a.lat), lng: parseFloat(a.lng),
        type: a.type === 'gps_jam'   ? 'gpsjam'
            : a.type === 'conflict'  ? 'acled'
            : a.type === 'nuclear'   ? 'nuclear'
            : a.type === 'maritime'  ? 'maritime'
            : a.type === 'disease'   ? 'disease'
            : a.type === 'cyber'     ? 'cyber'
            : a.type === 'notam'     ? 'notam'
            : a.type === 'red_alert' ? 'acled'
            : a.type === 'naval'     ? 'warship'
            : a.type === 'weather'   ? 'gdacs'
            : a.type === 'news'      ? 'news'
            : 'gdacs',
        severity: a.severity || 'medium',
        title: a.title, name: a.title, desc: a.detail,
        source: a.source, url: a.url, pub: a.ts,
        icon: a.icon || (a.type === 'gps_jam' ? '📡' : a.type === 'conflict' ? '⚔️' : '⚠️'),
      }))
    return [
      ...(layers.hotspots ? HOTSPOTS.map(h => ({ ...h, type: 'hotspot' })) : []),
      ...newsPoints,
      ...(layers.acled ? acledData.map(e => ({ ...e, type: 'conflict' })).slice(0, 400) : []),
      ...(layers.firms ? firmsData.map(f => ({ ...f, type: 'firms', severity: f.severity || 'medium' })).slice(0, 200) : []),
      ...issPoint,
      ...(satelliteToPoints(satData, layers)),
      ...alertPoints,
    ]
  }, [newsPoints, acledData, firmsData, satData, layers, issPoint, liveAlerts])

  // ── All points regardless of layer state — for CategoriesSidebar + Export ──
  // Categories should show ALL data even if the layer toggle is off
  const ALL_LAYERS_ON = React.useMemo(() => 
    Object.fromEntries(Object.keys(layers).map(k => [k, true]))
  , []) // stable reference — all keys, all true

  const allPointsUnfiltered = React.useMemo(() => {
    const alertPoints = (liveAlerts || [])
      .filter(a => a.lat && a.lng && !isNaN(parseFloat(a.lat)) && !isNaN(parseFloat(a.lng)))
      .map(a => ({
        lat: parseFloat(a.lat), lng: parseFloat(a.lng),
        type: a.type === 'gps_jam' ? 'gpsjam' : a.type === 'conflict' ? 'conflict'
            : a.type === 'nuclear' ? 'nuclear' : a.type === 'maritime' ? 'maritime'
            : a.type === 'disease' ? 'disease' : a.type === 'cyber' ? 'cyber'
            : a.type === 'notam' ? 'notam' : a.type === 'red_alert' ? 'acled'
            : a.type === 'naval' ? 'warship' : a.type === 'news' ? 'news'
            : a.type === 'weather' ? 'gdacs' : 'gdacs',
        severity: a.severity || 'medium', title: a.title, name: a.title,
        desc: a.detail, source: a.source, url: a.url, pub: a.ts,
      }))
    return [
      ...HOTSPOTS.map(h => ({ ...h, type: 'hotspot' })),
      ...newsPoints,
      ...acledData.map(e => ({ ...e, type: 'conflict' })).slice(0, 400),
      ...firmsData.map(f => ({ ...f, type: 'firms', severity: f.severity || 'medium' })).slice(0, 200),
      ...issPoint,
      ...satelliteToPoints(satData, ALL_LAYERS_ON),
      ...alertPoints,
    ]
  }, [newsPoints, acledData, firmsData, satData, liveAlerts, issPoint])

  // ── Adaptive render budget — re-evaluates every 5s to pick up new frame times ──
  const [frameTick, setFrameTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setFrameTick(n => n + 1), 10000)
    return () => clearInterval(t)
  }, [])

  const safePoints = useMemo(() => {
    // Read measured avg frame time from animation loop (set by threeRef._avgFrameMs)
    const avgFT = threeRef.current?._avgFrameMs || 16
    // Adaptive limit: 60fps=16ms→8000pts, 30fps=33ms→4000pts, 15fps=66ms→2000pts, <10fps→1000pts
    const MAX_RENDER = avgFT < 20 ? 8000 : avgFT < 35 ? 5000 : avgFT < 60 ? 3000 : avgFT < 100 ? 1500 : 800
    
    // Filter stale ships (speed=0 AND near shore = moored, not useful on map)
    const filtered = allPoints.filter(p => {
      if (p.type === 'ship') {
        const speed = p.meta?.speed ?? p.speed ?? -1
        // Keep if: speed > 0 (moving) OR no speed data (unknown) OR warship
        if (speed === 0 || speed < 0.3) return false  // moored/stale
      }
      return true
    })
    
    if (filtered.length <= MAX_RENDER) return filtered
    
    // Prioritize rendering by intelligence value:
    // critical/high events first, then medium, then ships/aircraft last
    const sevScore = { critical:4, high:3, medium:2, low:1 }
    const typeScore = (t) => 
      t==='acled'||t==='hotspot'||t==='nuclear' ? 10 :
      t==='milaircraft'||t==='warship' ? 8 :
      t==='gdacs'||t==='disease'||t==='maritime' ? 7 :
      t==='cyber'||t==='gpsjam' ? 6 :
      t==='firms'||t==='viirs' ? 5 :
      t==='aircraft' ? 3 : t==='ship' ? 2 : 4
    
    // Always include a baseline of aircraft and ships regardless of priority
    // so the map never appears empty even on slow GPUs
    const critical = filtered.filter(p => p.type==='milaircraft'||p.type==='warship'||p.severity==='critical')
    const aircraft = filtered.filter(p => p.type==='aircraft')
    const ships    = filtered.filter(p => p.type==='ship')
    const rest     = filtered.filter(p => p.type!=='aircraft'&&p.type!=='ship'&&p.type!=='milaircraft'&&p.type!=='warship'&&p.severity!=='critical')

    // Allocate render budget: critical events always first, then aircraft, then ships, then rest
    const aircraftSlot = Math.min(aircraft.length, Math.floor(MAX_RENDER * 0.35))  // 35% for aircraft
    const shipsSlot    = Math.min(ships.length,    Math.floor(MAX_RENDER * 0.30))  // 30% for ships (pre-filtered live only)
    const critSlot     = Math.min(critical.length, Math.floor(MAX_RENDER * 0.15))  // 15% for critical
    const restSlot     = MAX_RENDER - aircraftSlot - shipsSlot - critSlot           // rest gets remainder

    return [
      ...critical.slice(0, critSlot),
      ...aircraft.slice(0, aircraftSlot),
      ...ships.slice(0, shipsSlot),
      ...rest.sort((a,b) => (sevScore[b.severity]||0)-(sevScore[a.severity]||0)).slice(0, restSlot),
    ]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPoints, frameTick])  // frameTick forces re-eval every 5s to pick up new frame times

  // ── Signal clustering — bucket markers into grid cells at zoom-out ───
  const [cameraZ, setCameraZ] = useState(2.8)
  // Quantize cameraZ to 5 breakpoints — clusters only recompute when crossing thresholds
  // Prevents re-clustering on every pixel of scroll (was causing constant jitter)
  const clusterLevel = cameraZ > 5 ? 5 : cameraZ > 4 ? 4 : cameraZ > 3 ? 3 : cameraZ > 2.3 ? 2 : 1

  const clusteredPoints = useMemo(() => {
    const workingPoints = safePoints  // uses overload-safe version
    // Skip clustering when extremely zoomed in
    if (clusterLevel === 1 && cameraZ < 1.6) return workingPoints
    const cellDeg = clusterLevel === 5 ? 25 : clusterLevel === 4 ? 15 : clusterLevel === 3 ? 10 : clusterLevel === 2 ? 6 : 3
    const sevOrder = { critical: 4, high: 3, medium: 2, low: 1 }

    // Types that should cluster WITHIN their own type (not mixed)
    // Each type gets its own cell grid so milaircraft clusters separately from aircraft
    const TYPED_CLUSTER = new Set(['aircraft','milaircraft','ship','warship'])

    // Separate typed points from everything else
    const typedByType = new Map()  // type -> Map(cell -> [pts])
    const mixed = []

    workingPoints.forEach(pt => {
      if (TYPED_CLUSTER.has(pt.type)) {
        if (!typedByType.has(pt.type)) typedByType.set(pt.type, new Map())
        const cells = typedByType.get(pt.type)
        const ck = `${Math.round(pt.lat / cellDeg) * cellDeg},${Math.round(pt.lng / cellDeg) * cellDeg}`
        if (!cells.has(ck)) cells.set(ck, [])
        cells.get(ck).push(pt)
      } else {
        // Mixed cluster cell for other types
        mixed.push(pt)
      }
    })

    const result = []

    // Cluster each type independently
    typedByType.forEach((cells, type) => {
      cells.forEach(group => {
        if (group.length === 1) { result.push(group[0]); return }
        const lead = group.reduce((a, b) => (sevOrder[a.severity]||0) >= (sevOrder[b.severity]||0) ? a : b)
        result.push({
          ...lead, _cluster: true, _clusterCount: group.length,
          _clusterType: type,  // homogeneous cluster — all same type
          _clusterMembers: group,  // keep for expand-on-click
          _clusterTypes: [type],
          name: `${type === 'milaircraft' ? '✈[MIL]' : type === 'warship' ? '⚔[WARSHIP]' : type === 'aircraft' ? '✈' : '🚢'} ×${group.length}`,
        })
      })
    })

    // Mixed cluster for remaining types
    const mixedCells = new Map()
    mixed.forEach(pt => {
      const ck = `${Math.round(pt.lat / cellDeg) * cellDeg},${Math.round(pt.lng / cellDeg) * cellDeg}`
      if (!mixedCells.has(ck)) mixedCells.set(ck, [])
      mixedCells.get(ck).push(pt)
    })
    mixedCells.forEach(group => {
      if (group.length === 1) { result.push(group[0]); return }
      // Lead = newest item (by pub date if available, else first in array)
      // NOT severity-based — user decides what's important, we just cluster by proximity
      const lead = group.reduce((a, b) => {
        const aTime = a.pub ? new Date(a.pub).getTime() : 0
        const bTime = b.pub ? new Date(b.pub).getTime() : 0
        return bTime > aTime ? b : a
      })
      result.push({ ...lead, _cluster: true, _clusterCount: group.length, _clusterTypes: [...new Set(group.map(p => p.type))], _clusterMembers: group })
    })

    return result
  // eslint-disable-next-line
  }, [safePoints, clusterLevel])
  useEffect(() => {
    if (!watchers.length || !allPoints.length) return
    const newAlerts = []
    watchers.forEach(w => {
      const matches = allPoints.filter(pt => {
        if (w.type === 'earthquake' && pt.type === 'earthquake') {
          return (pt.meta?.mag || 0) >= (w.minMag || 5)
        }
        if (w.type === 'hurricane' && pt.type === 'hurricane') return true
        if (w.type === 'conflict' && (pt.type === 'acled' || pt.type === 'hotspot')) {
          if (!w.region) return true
          const name = (pt.title || pt.name || '').toLowerCase()
          return name.includes(w.region.toLowerCase())
        }
        if (w.type === 'aircraft_emergency' && pt.type === 'aircraft' && pt.severity === 'critical') return true
        if (w.type === 'gdacs' && pt.type === 'gdacs' && pt.meta?.alertlevel === 'red') return true
        return false
      })
      if (matches.length) {
        newAlerts.push({ watcher: w, count: matches.length, sample: matches[0], time: new Date() })
      }
    })
    setWatcherAlerts(newAlerts)
  }, [allPoints, watchers])

  const lastMarkerUpdate = React.useRef({ count: 0, time: 0 })
  useEffect(() => {
    const { THREE, scene, globe, markerMeshes, markerData } = threeRef.current
    if (!THREE || !scene || !globe) return

    // Throttle: only full redraw if count changed significantly OR 30s have passed
    const now = Date.now()
    const countDiff = Math.abs(clusteredPoints.length - lastMarkerUpdate.current.count)
    const timeSince = now - lastMarkerUpdate.current.time
    if (countDiff < 15 && timeSince < 30000 && lastMarkerUpdate.current.time > 0) return
    lastMarkerUpdate.current = { count: clusteredPoints.length, time: now }

    // Clear old markers
    ;(markerMeshes || []).forEach(m => globe.remove(m))
    threeRef.current.markerMeshes = []
    threeRef.current.markerData   = []

    clusteredPoints.forEach(pt => {
      const { x, y, z } = latLngToVec3(pt.lat, pt.lng, 1.015)
      let geo, mat, mesh, continue_ = false

      const hexColor = SAT_COLORS[pt.type] || SEV_COLORS_HEX[pt.severity] || 0x2dd4bf

      // ── Cluster — big floating emoji icon + count pill, no background circle ──
      if (pt._cluster && pt._clusterCount > 1) {
        const cv = document.createElement('canvas')
        cv.width = cv.height = 96
        const cx = cv.getContext('2d')
        const TYPE_CLR = {
          aircraft:'#00ffcc', milaircraft:'#ff4444', ship:'#0088ff', warship:'#8888ff',
          acled:'#ff1111', hotspot:'#ff3333', cyber:'#ff00ff', disease:'#22cc88',
          nuclear:'#ffff00', gpsjam:'#f59e0b', firms:'#ff4400', news:'#2dd4bf',
          notam:'#ff8844', wikiEdit:'#aaaaff', bgp:'#ff6600', viirs:'#ffffff',
          gdacs:'#ffaa00', eonet_wildfire:'#ff3300',
        }
        const TYPE_ICON = {
          aircraft:'✈', milaircraft:'✈', ship:'🚢', warship:'⚔',
          acled:'⚔', hotspot:'🎯', cyber:'💻', disease:'🦠',
          nuclear:'☢', gpsjam:'📡', firms:'🔥', news:'📰',
          notam:'🚫', wikiEdit:'📝', bgp:'🌐', viirs:'🛰',
          gdacs:'⚠', eonet_wildfire:'🔥',
        }
        const clrKey = pt._clusterType || pt.type
        const clr = TYPE_CLR[clrKey] || '#2dd4bf'
        const icon = TYPE_ICON[clrKey] || '◉'
        // Big emoji — no circle, no background, transparent canvas
        cx.font = '52px sans-serif'
        cx.textAlign = 'center'; cx.textBaseline = 'middle'
        cx.fillText(icon, 48, 40)
        // Count pill below the icon
        const cnt = pt._clusterCount >= 1000 ? `${Math.round(pt._clusterCount/1000)}k` : String(pt._clusterCount)
        const pillW = cnt.length > 2 ? 22 : 18
        cx.fillStyle = clr + 'ee'
        cx.beginPath(); cx.roundRect(48-pillW, 70, pillW*2, 17, 8); cx.fill()
        cx.fillStyle = '#000000'
        cx.font = 'bold 10px monospace'
        cx.textAlign = 'center'; cx.textBaseline = 'middle'
        cx.fillText(cnt, 48, 79)
        geo = new THREE.PlaneGeometry(0.09, 0.09)
        mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, side: THREE.DoubleSide })
        mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(x, y, z)
        mesh.lookAt(0, 0, 0)
        mesh.rotateX(Math.PI)
        globe.add(mesh)
        threeRef.current.markerMeshes.push(mesh)
        threeRef.current.markerData.push(pt)
        return
      }

      // ══════════════════════════════════════════════════════════════════
      // ICON RENDERER — canvas-drawn asset-quality markers
      // Each type draws a distinct recognizable symbol onto a 64×64 canvas
      // then maps it to a billboard PlaneGeometry facing outward from globe
      // Aircraft and ships fall through to their own heading-oriented meshes below
      // ══════════════════════════════════════════════════════════════════

      const drawIcon = (drawFn, size = 0.036) => {
        const cv = document.createElement('canvas')
        cv.width = cv.height = 64
        const cx = cv.getContext('2d')
        drawFn(cx, 64)
        geo = new THREE.PlaneGeometry(size, size)
        mat = new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(cv),
          transparent: true, depthWrite: false, side: THREE.DoubleSide,
        })
      }

      // Helper: clear canvas
      const clr = (cx, bg, alpha=1) => {
        cx.clearRect(0,0,64,64)
        if (bg) { cx.globalAlpha=alpha; cx.fillStyle=bg; cx.beginPath(); cx.arc(32,32,30,0,Math.PI*2); cx.fill(); cx.globalAlpha=1 }
      }

      if (pt.type === 'hotspot') {
        // 🎯 TARGET CROSSHAIR — red/white targeting reticle
        drawIcon((cx) => {
          clr(cx)
          // Outer ring
          cx.strokeStyle='#ff2222'; cx.lineWidth=3; cx.beginPath(); cx.arc(32,32,26,0,Math.PI*2); cx.stroke()
          // Inner ring
          cx.strokeStyle='#ff4444'; cx.lineWidth=2; cx.beginPath(); cx.arc(32,32,14,0,Math.PI*2); cx.stroke()
          // Crosshair lines (four short lines, gap in center)
          cx.strokeStyle='#ff2222'; cx.lineWidth=2.5
          ;[[32,4,32,18],[32,46,32,60],[4,32,18,32],[46,32,60,32]].forEach(([x1,y1,x2,y2])=>{cx.beginPath();cx.moveTo(x1,y1);cx.lineTo(x2,y2);cx.stroke()})
          // Center dot
          cx.fillStyle='#ffffff'; cx.beginPath(); cx.arc(32,32,3,0,Math.PI*2); cx.fill()
        }, 0.042)

      } else if (pt.type === 'news') {
        // 📰 NEWSPAPER icon
        drawIcon((cx) => {
          clr(cx,'#1a2a3a',0.85)
          cx.fillStyle='#2dd4bf'; cx.fillRect(14,14,36,36)
          cx.fillStyle='#0a1a2a'
          // Newspaper lines
          ;[[16,19,44,21],[16,24,44,26],[16,29,30,31],[16,34,30,36],[16,39,44,41]].forEach(([x1,y1,x2,y2])=>{cx.fillRect(x1,y1,x2-x1,y2-y1)})
          // Red banner top
          cx.fillStyle='#ef4444'; cx.fillRect(14,14,36,7)
        }, 0.034)

      } else if (pt.type === 'acled') {
        // ⚔️ CROSSED SWORDS — conflict marker
        drawIcon((cx) => {
          clr(cx,'#1a0505',0.85)
          cx.strokeStyle='#ff2222'; cx.lineWidth=4; cx.lineCap='round'
          // Sword 1: top-left to bottom-right
          cx.beginPath(); cx.moveTo(12,12); cx.lineTo(52,52); cx.stroke()
          // Sword 2: top-right to bottom-left
          cx.beginPath(); cx.moveTo(52,12); cx.lineTo(12,52); cx.stroke()
          // Hilts
          cx.strokeStyle='#ff8888'; cx.lineWidth=5
          ;[[12,22,22,12],[42,52,52,42]].forEach(([x1,y1,x2,y2])=>{cx.beginPath();cx.moveTo(x1,y1);cx.lineTo(x2,y2);cx.stroke()})
          // Center circle
          cx.fillStyle='#ff2222'; cx.beginPath(); cx.arc(32,32,5,0,Math.PI*2); cx.fill()
        }, 0.040)

      } else if (pt.type === 'firms' || pt.type === 'eonet_wildfire') {
        // 🔥 FLAME — fire/thermal
        drawIcon((cx) => {
          clr(cx)
          // Draw a flame shape using bezier curves
          cx.fillStyle='#ff8800'
          cx.beginPath()
          cx.moveTo(32,58)
          cx.bezierCurveTo(14,50,12,36,20,26)
          cx.bezierCurveTo(18,34,26,36,28,30)
          cx.bezierCurveTo(28,22,34,16,32,8)
          cx.bezierCurveTo(40,18,42,28,38,34)
          cx.bezierCurveTo(44,28,46,20,42,14)
          cx.bezierCurveTo(52,26,52,44,32,58)
          cx.fill()
          // Inner flame
          cx.fillStyle='#ffdd00'
          cx.beginPath()
          cx.moveTo(32,52)
          cx.bezierCurveTo(22,44,20,34,26,28)
          cx.bezierCurveTo(26,36,32,36,32,28)
          cx.bezierCurveTo(36,34,40,40,32,52)
          cx.fill()
          // Core
          cx.fillStyle='#ffffff'; cx.globalAlpha=0.7
          cx.beginPath(); cx.ellipse(32,42,5,8,0,0,Math.PI*2); cx.fill()
          cx.globalAlpha=1
        }, 0.034)

      } else if (pt.type === 'earthquake') {
        // 💎 SEISMIC WAVE DIAMOND — size by magnitude
        const m = pt.meta?.mag || 3
        const sz = m >= 7.5 ? 0.052 : m >= 7 ? 0.044 : m >= 6 ? 0.036 : m >= 5 ? 0.028 : m >= 4 ? 0.022 : 0.018
        const clrE = m >= 7 ? '#ff0000' : m >= 6 ? '#ff4400' : m >= 5 ? '#ff8800' : m >= 4 ? '#ffaa00' : '#ffcc44'
        drawIcon((cx) => {
          clr(cx)
          // Diamond shape
          cx.fillStyle = clrE
          cx.beginPath(); cx.moveTo(32,4); cx.lineTo(58,32); cx.lineTo(32,60); cx.lineTo(6,32); cx.closePath(); cx.fill()
          // Seismic wave inside
          cx.strokeStyle='rgba(0,0,0,0.4)'; cx.lineWidth=2; cx.beginPath()
          cx.moveTo(14,32); cx.lineTo(20,20); cx.lineTo(26,44); cx.lineTo(32,28); cx.lineTo(38,40); cx.lineTo(44,22); cx.lineTo(50,32)
          cx.stroke()
          // Magnitude label for big quakes
          if (m >= 5) {
            cx.fillStyle='#ffffff'; cx.font='bold 16px sans-serif'; cx.textAlign='center'; cx.textBaseline='middle'
            cx.fillText(`${m.toFixed(1)}`, 32, 32)
          }
        }, sz)

      } else if (pt.type === 'hurricane' || pt.type === 'eonet_severe_storms') {
        // 🌀 HURRICANE SPIRAL — rotating storm eye
        drawIcon((cx) => {
          clr(cx,'#1a0030',0.8)
          // Draw spiral rings
          cx.strokeStyle='#cc44ff'; cx.lineWidth=3
          ;[22,16,10].forEach((r,i)=>{
            cx.globalAlpha=1-i*0.25
            cx.beginPath(); cx.arc(32,32,r,0,Math.PI*1.7); cx.stroke()
          })
          cx.globalAlpha=1
          // Outer ring
          cx.strokeStyle='#dd66ff'; cx.lineWidth=2; cx.beginPath(); cx.arc(32,32,28,0,Math.PI*2); cx.stroke()
          // Eye
          cx.fillStyle='#ffffff'; cx.beginPath(); cx.arc(32,32,5,0,Math.PI*2); cx.fill()
          cx.fillStyle='#cc44ff'; cx.beginPath(); cx.arc(32,32,3,0,Math.PI*2); cx.fill()
        }, 0.048)

      } else if (pt.type === 'volcano' || pt.type === 'eonet_volcanoes') {
        // 🌋 VOLCANO — mountain with eruption plume
        drawIcon((cx) => {
          clr(cx)
          // Lava glow base
          cx.fillStyle='#ff4400'
          cx.beginPath(); cx.ellipse(32,56,20,8,0,0,Math.PI*2); cx.fill()
          // Mountain triangle
          cx.fillStyle='#882200'
          cx.beginPath(); cx.moveTo(32,10); cx.lineTo(56,56); cx.lineTo(8,56); cx.closePath(); cx.fill()
          // Snow/rock top
          cx.fillStyle='#884422'
          cx.beginPath(); cx.moveTo(32,10); cx.lineTo(40,28); cx.lineTo(24,28); cx.closePath(); cx.fill()
          // Crater
          cx.fillStyle='#ff2200'
          cx.beginPath(); cx.ellipse(32,13,5,3,0,0,Math.PI*2); cx.fill()
          // Eruption plume
          cx.fillStyle='#ff8800'; cx.globalAlpha=0.9
          ;[[32,8,4,14],[26,6,3,10],[38,7,3,10]].forEach(([x,y,rx,ry])=>{
            cx.beginPath(); cx.ellipse(x,y,rx,ry,-0.3,0,Math.PI*2); cx.fill()
          })
          cx.globalAlpha=1
        }, 0.042)

      } else if (pt.type === 'flood') {
        // 🌊 FLOOD WAVES — water surge
        drawIcon((cx) => {
          clr(cx,'#001155',0.85)
          cx.fillStyle='#0055ff'; cx.fillRect(8,36,48,20)
          // Wave layers
          ;['#0077ff','#0099ff','#00bbff'].forEach((col,i)=>{
            cx.fillStyle=col; cx.beginPath()
            cx.moveTo(8,36-i*5)
            cx.bezierCurveTo(18,28-i*5,26,38-i*5,32,34-i*5)
            cx.bezierCurveTo(38,30-i*5,48,40-i*5,56,32-i*5)
            cx.lineTo(56,36-i*5+8); cx.lineTo(8,36-i*5+8); cx.closePath(); cx.fill()
          })
          // House/building being flooded
          cx.fillStyle='#cc4400'; cx.beginPath()
          cx.moveTo(28,8); cx.lineTo(36,8); cx.lineTo(40,16); cx.lineTo(24,16); cx.closePath(); cx.fill()
          cx.fillStyle='#aa3300'; cx.fillRect(26,16,12,16)
        }, 0.038)

      } else if (pt.type === 'weather') {
        // ⛈ THUNDERSTORM
        drawIcon((cx) => {
          clr(cx)
          // Cloud
          cx.fillStyle='#334466'
          ;[[32,28,16],[22,32,12],[42,32,12],[32,36,14]].forEach(([x,y,r])=>{cx.beginPath();cx.arc(x,y,r,0,Math.PI*2);cx.fill()})
          // Lightning bolt
          cx.fillStyle='#ffee00'
          cx.beginPath(); cx.moveTo(35,20); cx.lineTo(28,36); cx.lineTo(33,36); cx.lineTo(26,54); cx.lineTo(38,34); cx.lineTo(33,34); cx.closePath(); cx.fill()
          // Rain drops
          cx.fillStyle='#6699cc'; cx.globalAlpha=0.8
          ;[[20,50,2,5],[28,54,2,5],[44,48,2,5]].forEach(([x,y,rx,ry])=>{cx.beginPath();cx.ellipse(x,y,rx,ry,0,0,Math.PI*2);cx.fill()})
          cx.globalAlpha=1
        }, 0.034)

      } else if (pt.type === 'gdacs') {
        // ⚠️ ALERT TRIANGLE — color by severity
        const gdacsC = pt.meta?.alertlevel==='red'?'#ff1111':pt.meta?.alertlevel==='orange'?'#ff7700':'#22cc44'
        drawIcon((cx) => {
          clr(cx)
          // Triangle
          cx.fillStyle = gdacsC
          cx.beginPath(); cx.moveTo(32,6); cx.lineTo(58,54); cx.lineTo(6,54); cx.closePath(); cx.fill()
          // Border
          cx.strokeStyle='#ffffff'; cx.lineWidth=2; cx.beginPath(); cx.moveTo(32,6); cx.lineTo(58,54); cx.lineTo(6,54); cx.closePath(); cx.stroke()
          // Exclamation mark
          cx.fillStyle='#ffffff'; cx.font='bold 22px sans-serif'; cx.textAlign='center'; cx.textBaseline='middle'
          cx.fillText('!', 32, 38)
        }, 0.038)

      } else if (pt.type === 'copernicus') {
        // 🛰️ SATELLITE
        drawIcon((cx) => {
          clr(cx)
          // Solar panels
          cx.fillStyle='#3388ff'
          cx.fillRect(4,26,18,12); cx.fillRect(42,26,18,12)
          // Panel grid lines
          cx.strokeStyle='#0044aa'; cx.lineWidth=1
          ;[10,16].forEach(x=>{ cx.beginPath(); cx.moveTo(x,26); cx.lineTo(x,38); cx.stroke() })
          ;[30,32].forEach(y=>{ cx.beginPath(); cx.moveTo(4,y); cx.lineTo(22,y); cx.stroke() })
          ;[48,54].forEach(x=>{ cx.beginPath(); cx.moveTo(x,26); cx.lineTo(x,38); cx.stroke() })
          // Satellite body
          cx.fillStyle='#aaaaaa'; cx.fillRect(22,22,20,20)
          cx.fillStyle='#cccccc'; cx.fillRect(24,24,16,16)
          // Antenna dish
          cx.strokeStyle='#00ddff'; cx.lineWidth=2; cx.beginPath()
          cx.arc(32,18,8,Math.PI,0); cx.stroke()
          cx.beginPath(); cx.moveTo(32,10); cx.lineTo(32,22); cx.stroke()
          // Signal dot
          cx.fillStyle='#00ffff'; cx.beginPath(); cx.arc(32,22,3,0,Math.PI*2); cx.fill()
        }, 0.038)

      } else if (pt.type === 'sigmet') {
        // ⚡ AVIATION HAZARD hexagon
        drawIcon((cx) => {
          clr(cx)
          // Hexagon
          cx.fillStyle='#ffee00'
          cx.beginPath()
          for(let i=0;i<6;i++){const a=i*Math.PI/3-Math.PI/6;cx.lineTo(32+28*Math.cos(a),32+28*Math.sin(a))}
          cx.closePath(); cx.fill()
          // Inner hexagon border
          cx.strokeStyle='#aa9900'; cx.lineWidth=2; cx.beginPath()
          for(let i=0;i<6;i++){const a=i*Math.PI/3-Math.PI/6;cx.lineTo(32+24*Math.cos(a),32+24*Math.sin(a))}
          cx.closePath(); cx.stroke()
          // Lightning bolt
          cx.fillStyle='#333300'
          cx.beginPath(); cx.moveTo(35,12); cx.lineTo(28,32); cx.lineTo(33,32); cx.lineTo(26,52); cx.lineTo(38,28); cx.lineTo(33,28); cx.closePath(); cx.fill()
        }, 0.032)

      } else if (pt.type === 'iss') {
        // 🛸 ISS — stylized space station
        drawIcon((cx) => {
          clr(cx,'#000828',0.9)
          // Solar panel arrays (horizontal bars)
          cx.fillStyle='#2255cc'
          cx.fillRect(4,26,20,12); cx.fillRect(40,26,20,12)
          // Panel detail
          cx.strokeStyle='#113399'; cx.lineWidth=1
          ;[8,12,16].forEach(x=>{ cx.beginPath(); cx.moveTo(x,26); cx.lineTo(x,38); cx.stroke() })
          ;[44,48,52,56].forEach(x=>{ cx.beginPath(); cx.moveTo(x,26); cx.lineTo(x,38); cx.stroke() })
          // Main truss
          cx.fillStyle='#888888'; cx.fillRect(22,30,20,4)
          // Habitat modules
          cx.fillStyle='#aaaaaa'
          cx.beginPath(); cx.arc(32,32,10,0,Math.PI*2); cx.fill()
          cx.fillStyle='#999999'
          cx.beginPath(); cx.ellipse(32,32,8,6,0,0,Math.PI*2); cx.fill()
          // Glow
          cx.strokeStyle='#00aaff'; cx.lineWidth=2; cx.globalAlpha=0.7
          cx.beginPath(); cx.arc(32,32,14,0,Math.PI*2); cx.stroke()
          cx.globalAlpha=1
          // Orbit dot trail
          cx.fillStyle='#00ccff'; cx.beginPath(); cx.arc(32,32,3,0,Math.PI*2); cx.fill()
        }, 0.048)

      } else if (pt.type === 'launch') {
        // 🚀 ROCKET
        drawIcon((cx) => {
          clr(cx)
          // Exhaust plume
          cx.fillStyle='#ff5500'; cx.globalAlpha=0.8
          cx.beginPath(); cx.moveTo(26,54); cx.bezierCurveTo(20,62,32,58,32,58); cx.bezierCurveTo(32,58,44,62,38,54); cx.closePath(); cx.fill()
          cx.globalAlpha=1
          cx.fillStyle='#ffaa00'; cx.beginPath(); cx.ellipse(32,56,5,4,0,0,Math.PI*2); cx.fill()
          // Rocket body
          cx.fillStyle='#dddddd'
          cx.beginPath(); cx.moveTo(32,6); cx.bezierCurveTo(22,16,20,36,20,48); cx.lineTo(44,48); cx.bezierCurveTo(44,36,42,16,32,6); cx.closePath(); cx.fill()
          // Nose cone
          cx.fillStyle='#ff2222'
          cx.beginPath(); cx.moveTo(32,6); cx.bezierCurveTo(26,14,20,24,20,28); cx.lineTo(44,28); cx.bezierCurveTo(44,24,38,14,32,6); cx.closePath(); cx.fill()
          // Window
          cx.fillStyle='#88ddff'; cx.strokeStyle='#555555'; cx.lineWidth=1.5
          cx.beginPath(); cx.arc(32,34,5,0,Math.PI*2); cx.fill(); cx.stroke()
          // Fins
          cx.fillStyle='#ff2222'
          cx.beginPath(); cx.moveTo(20,42); cx.lineTo(12,52); cx.lineTo(20,48); cx.closePath(); cx.fill()
          cx.beginPath(); cx.moveTo(44,42); cx.lineTo(52,52); cx.lineTo(44,48); cx.closePath(); cx.fill()
        }, 0.042)

      } else if (pt.type === 'eonet_sea_and_lake_ice') {
        // 🧊 ICE CRYSTAL
        drawIcon((cx) => {
          clr(cx,'#002244',0.8)
          cx.strokeStyle='#88ddff'; cx.lineWidth=3
          // 6-pointed snowflake
          for(let i=0;i<6;i++){
            const a=i*Math.PI/3; cx.beginPath()
            cx.moveTo(32,32); cx.lineTo(32+24*Math.cos(a),32+24*Math.sin(a)); cx.stroke()
          }
          // Cross bars
          for(let i=0;i<6;i++){
            const a=i*Math.PI/3; const d=14
            ;[-1,1].forEach(s=>{
              const ba=a+s*Math.PI/6
              cx.beginPath()
              cx.moveTo(32+d*Math.cos(a)-5*Math.cos(ba),32+d*Math.sin(a)-5*Math.sin(ba))
              cx.lineTo(32+d*Math.cos(a)+5*Math.cos(ba),32+d*Math.sin(a)+5*Math.sin(ba))
              cx.stroke()
            })
          }
          cx.fillStyle='#aaeeff'; cx.beginPath(); cx.arc(32,32,4,0,Math.PI*2); cx.fill()
        }, 0.032)

      } else if (pt.type === 'aircraft') {
        // ✈ AIRCRAFT SILHOUETTE — top-down view, oriented by heading
        const heading = (pt.meta?.heading || pt.heading || 0) * Math.PI / 180
        drawIcon((cx) => {
          clr(cx)
          cx.save()
          cx.translate(32, 32)
          cx.rotate(heading)
          // Military = red tint, civil = cyan
          const isMil = /^(RCH|JAKE|KNIFE|REACH|NATO|RRR|USAF|THUD|BART|TOPOL|SPAR|SAM|VENUS|VIPER|ATLAS)/i.test(pt.meta?.callsign || '')
          const bodyClr = isMil ? '#ff4444' : '#00ffcc'
          const wingClr = isMil ? '#ff8888' : '#88ffee'
          // Fuselage
          cx.fillStyle = bodyClr
          cx.beginPath(); cx.ellipse(0, 0, 5, 22, 0, 0, Math.PI*2); cx.fill()
          // Wings
          cx.fillStyle = wingClr
          cx.beginPath(); cx.moveTo(0,-4); cx.lineTo(-26,8); cx.lineTo(-22,14); cx.lineTo(0,6); cx.closePath(); cx.fill()
          cx.beginPath(); cx.moveTo(0,-4); cx.lineTo(26,8); cx.lineTo(22,14); cx.lineTo(0,6); cx.closePath(); cx.fill()
          // Tail fins
          cx.fillStyle = bodyClr
          cx.beginPath(); cx.moveTo(0,18); cx.lineTo(-10,26); cx.lineTo(-7,28); cx.lineTo(0,22); cx.closePath(); cx.fill()
          cx.beginPath(); cx.moveTo(0,18); cx.lineTo(10,26); cx.lineTo(7,28); cx.lineTo(0,22); cx.closePath(); cx.fill()
          // Nose dot
          cx.fillStyle = '#ffffff'; cx.globalAlpha = 0.8
          cx.beginPath(); cx.arc(0,-20,3,0,Math.PI*2); cx.fill()
          cx.globalAlpha = 1
          cx.restore()
          // Severity pulse ring for emergencies
          if (pt.severity === 'critical') {
            cx.strokeStyle = '#ff2222'; cx.lineWidth = 3; cx.globalAlpha = 0.7
            cx.beginPath(); cx.arc(32,32,29,0,Math.PI*2); cx.stroke()
            cx.globalAlpha = 1
          }
        }, pt.severity==='critical' ? 0.048 : 0.036)

      } else if (pt.type === 'ship') {
        // 🚢 SHIP HULL — top-down vessel silhouette
        drawIcon((cx) => {
          clr(cx)
          cx.save()
          cx.translate(32, 32)
          const shipType = (pt.meta?.shipType || pt.meta?.vesselType || '').toLowerCase()
          const isTanker = shipType.includes('tanker') || shipType.includes('cargo')
          const isWarship = shipType.includes('naval') || shipType.includes('destroyer') || shipType.includes('carrier')
          const hullClr = isWarship ? '#8888ff' : isTanker ? '#ff8800' : '#0088ff'
          const deckClr = isWarship ? '#aaaaff' : isTanker ? '#ffaa44' : '#44aaff'
          // Hull - pointed bow, flat stern
          cx.fillStyle = hullClr
          cx.beginPath()
          cx.moveTo(0, -26)      // bow
          cx.bezierCurveTo(10,-20, 12,0, 11,20)   // starboard
          cx.lineTo(11, 24); cx.lineTo(-11, 24)    // stern
          cx.lineTo(-11, 20)
          cx.bezierCurveTo(-12,0, -10,-20, 0,-26)  // port
          cx.closePath(); cx.fill()
          // Deck structures
          cx.fillStyle = deckClr
          cx.fillRect(-6, -16, 12, 20)  // main deck house
          cx.fillStyle = '#ffffff'; cx.globalAlpha = 0.6
          cx.fillRect(-3, -20, 6, 6)    // bridge
          cx.globalAlpha = 1
          // Wake (movement indicator)
          if (pt.meta?.speed > 2) {
            cx.strokeStyle = '#ffffff'; cx.lineWidth = 1.5; cx.globalAlpha = 0.3
            cx.beginPath(); cx.moveTo(-8,24); cx.lineTo(-16,32); cx.stroke()
            cx.beginPath(); cx.moveTo(8,24); cx.lineTo(16,32); cx.stroke()
            cx.globalAlpha = 1
          }
          cx.restore()
        }, 0.038)

      } else {
        // DEFAULT: colored dot with severity ring
        const r = pt.severity==='critical'?0.016:pt.severity==='high'?0.012:0.009
        drawIcon((cx) => {
          clr(cx)
          const sevClr = pt.severity==='critical'?'#ff2222':pt.severity==='high'?'#ff8800':pt.severity==='medium'?'#ffdd00':'#2dd4bf'
          cx.fillStyle=sevClr; cx.beginPath(); cx.arc(32,32,22,0,Math.PI*2); cx.fill()
          cx.strokeStyle='#ffffff'; cx.lineWidth=2; cx.globalAlpha=0.5
          cx.beginPath(); cx.arc(32,32,26,0,Math.PI*2); cx.stroke()
          cx.globalAlpha=1
        }, r*2.5)
      }

      if (!continue_) {
        mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(x, y, z)
        // Billboard: face outward from globe center (lookAt center then flip)
        mesh.lookAt(0, 0, 0)
        mesh.rotateX(Math.PI)
        globe.add(mesh)
        threeRef.current.markerMeshes.push(mesh)
        threeRef.current.markerData.push(pt)
      }
      continue_ = false
    })
  }, [clusteredPoints, threeReady])

  // ── Mouse interactions ────────────────────────────────────────────────
  const onMouseDown = useCallback(e => {
    isDragging.current = true
    prevMouse.current = { x: e.clientX, y: e.clientY }
    rotVel.current = { x: 0, y: 0 }
    autoRotateRef.current = false
    setAutoRotate(false)
  }, [])

  const onMouseMove = useCallback(e => {
    // Always update hover position for tooltip
    if (mountRef.current) {
      const rect = mountRef.current.getBoundingClientRect()
      setHovPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }

    if (isDragging.current && threeRef.current.globe) {
      const dx = (e.clientX - prevMouse.current.x) * 0.005
      const dy = (e.clientY - prevMouse.current.y) * 0.005
      threeRef.current.globe.rotation.y += dx
      threeRef.current.globe.rotation.x += dy
      rotVel.current = { x: dy, y: dx }
      prevMouse.current = { x: e.clientX, y: e.clientY }
      setHovered(null) // clear hover while dragging
      return
    }

    // Hover detection — raycast on mouse move (not click)
    const { THREE, camera, raycaster, markerMeshes, markerData, globe } = threeRef.current
    if (!THREE || !mountRef.current || !globe || !markerMeshes?.length) return
    const rect = mountRef.current.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
    globe.updateMatrixWorld(true)
    raycaster.setFromCamera(mouse, camera)
    const hits = raycaster.intersectObjects(markerMeshes, false)
    if (hits.length > 0) {
      for (const hit of hits) {
        const idx = markerMeshes.indexOf(hit.object)
        const data = markerData?.[idx]
        if (data && !data._trail) {
          setHovered(data)
          threeRef.current._hovered = data
          mountRef.current.style.cursor = 'pointer'
          return
        }
      }
    }
    setHovered(null)
    threeRef.current._hovered = null
    mountRef.current.style.cursor = isDragging.current ? 'grabbing' : 'grab'
  }, [])

  const onMouseUp = useCallback(e => {
    if (!isDragging.current) return
    const dx = e.clientX - prevMouse.current.x
    const dy = e.clientY - prevMouse.current.y
    isDragging.current = false
    // Click = pin whatever is currently hovered
    if (Math.sqrt(dx * dx + dy * dy) < 8) {
      const h = threeRef.current._hovered
      if (h?._cluster && h?._clusterMembers?.length) {
        setExpandedCluster(h)
        setSelected(null)
      } else {
        setExpandedCluster(null)
        const hov = threeRef.current._hovered
        if (hov && !hov._trail) {
          // Fly globe to clicked point AND open detail panel simultaneously
          if (hov.lat != null && hov.lng != null && threeRef.current?.globe) {
            const theta = (hov.lng + 180) * (Math.PI / 180)
            threeRef.current.globe.rotation.y = Math.PI / 2 - theta
            const phi = (90 - hov.lat) * (Math.PI / 180)
            threeRef.current.globe.rotation.x = Math.max(-0.65, Math.min(0.65, -(phi - Math.PI / 2)))
            autoRotateRef.current = false
            setAutoRotate(false)
            threeRef.current._navigatedTo = hov
            setTimeout(() => { if (threeRef.current) threeRef.current._navigatedTo = null }, 4000)
            if (threeRef.current.camera) setCameraZ(threeRef.current.camera.position.z)
          }
          setSelected(hov)
        } else {
          setSelected(null)
        }
      }
    }
  }, [])

  const onWheel = useCallback(e => {
    e.preventDefault()
    const { camera } = threeRef.current
    if (!camera) return
    const newZ = Math.max(1.3, Math.min(7, camera.position.z + e.deltaY * 0.003))
    camera.position.z = newZ
    // Throttle state update to avoid re-clustering on every scroll tick
    clearTimeout(onWheel._t)
    onWheel._t = setTimeout(() => setCameraZ(newZ), 600)
  }, [])

  useEffect(() => {
    const el = mountRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  const resetView = () => {
    if (threeRef.current.camera) threeRef.current.camera.position.z = 2.8
    if (threeRef.current.globe) { threeRef.current.globe.rotation.x = 0; threeRef.current.globe.rotation.y = 0 }
    autoRotateRef.current = true
    setAutoRotate(true)
  }

  // Stats: ALWAYS show real counts regardless of layer state
  // Toolbar button shows "BGP (12)" even when BGP layer is off — user knows data is available
  const stats = React.useMemo(() => ({
    news:        newsPoints.length,
    acled:       acledData.length,
    firms:       firmsData.length,
    quakes:      satData?.earthquakes?.length||0,
    eonet:       satData?.eonet?.length||0,
    gdacs:       satData?.gdacs?.length||0,
    storms:      satData?.hurricanes?.length||0,
    volcanoes:   satData?.volcanoes?.length||0,
    floods:      satData?.floods?.length||0,
    weather:     satData?.weatherAlerts?.length||0,
    aircraft:    (satData?.aircraft?.length||0)+(satData?.acarsPositions?.length||0),
    ships:       (satData?.ships?.length||0)+(satData?.aisStream?.length||0),
    fires:       satData?.globalFires?.length||0,
    iss:         satData?.iss ? 1 : 0,
    launches:    (satData?.launches?.length||0)+(satData?.neos?.length||0)+(satData?.spaceDebris?.length||0)+(satData?.satelliteConjunctions?.length||0)+(satData?.nasaSatellitePasses?.length||0),
    disease:     (satData?.diseaseOutbreaks?.length||0)+(satData?.promed?.length||0)+(satData?.airQuality?.length||0),
    nuclear:     satData?.nuclear?.length||0,
    cyber:       (satData?.cyber?.length||0)+(satData?.botnetC2?.length||0)+(satData?.shodanLatest?.length||0)+(satData?.recentCVEs?.length||0),
    vuln:        (satData?.shodanLatest?.length||0)+(satData?.censysAnomalous?.length||0),
    cve:         (satData?.recentCVEs?.length||0)+(satData?.kev?.length||0),
    maritime:    satData?.maritime?.length||0,
    humanitarian:satData?.reliefweb?.length||0,
    gpsjam:      (liveAlerts||[]).filter(a=>a.type==='gps_jam').length,
    ucdp:        satData?.ucdpFull?.length||0,
    sanctions:   satData?.openSanctions?.length||0,
    osmBases:    satData?.osmMilitary?.length||0,
    wikiConflicts: satData?.wikidataConflicts?.length||0,
    arms:        satData?.armsTransferSignals?.length||0,
    notams:      satData?.notams?.length||0,
    wikiEdits:   satData?.wikiEdits?.length||0,
    bgp:         satData?.bgpAnomalies?.length||0,
    viirs:       (satData?.viirsNightlights?.length||0)+(satData?.globalViirs?.length||0),
    warships:    satData?.warships?.length||0,
    milaircraft: satData?.milaircraft?.length||0,
    copernicus:  (satData?.copernicus?.length||0)+(satData?.copernicusActivations?.length||0),
    sigmets:     satData?.sigmets?.length||0,
    crowds:      satData?.crowds?.filter(c=>c.lat&&c.lng).length||0,
    iris:        satData?.iris?.length||0,
    live_alerts: (liveAlerts||[]).filter(a=>a.lat&&a.lng).length,
    telegram:    satData?.telegramPosts?.length||0,
    preaction:   satData?.preActionIndicators?.length||0,
    conflict:    satData?.conflictEvents?.length||0,
    warships_live: (satData?.warships||[]).filter(w=>w._livePos).length,
  }), [newsPoints, acledData, firmsData, satData, layers, liveAlerts])

  const hasApiKeys = keys.acled_key && keys.acled_email

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--void)' }}>

      {/* Toolbar */}
      <div style={{ flexShrink: 0, padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--void)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Orbitron', fontSize: '11px', color: 'var(--t3)', letterSpacing: '0.14em' }}>
          {mapMode === 'intelligence' ? '🔭 INTEL MAP' : '🌍 ENV MAP'}
        </span>
        <button
          onClick={() => setMapMode(m => m === 'environment' ? 'intelligence' : 'environment')}
          style={{ padding:'2px 10px', fontSize:'8px', fontWeight:700, border:'none', borderRadius:'4px', cursor:'pointer',
            background: mapMode === 'intelligence' ? 'rgba(167,139,250,0.2)' : 'rgba(45,212,191,0.15)',
            color: mapMode === 'intelligence' ? '#a78bfa' : 'var(--accent)',
            fontFamily:'JetBrains Mono,monospace', letterSpacing:'0.05em' }}>
          {mapMode === 'intelligence' ? '🔭 INTEL MAP' : '🌍 ENV MAP'} ⇄
        </button>
        <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>
          {mapMode === 'intelligence' ? 'MIL.AIR · WARSHIPS · CONFLICT · CYBER · BNO' : 'CIVIL AIR · SHIPS · GDACS · FIRMS · SPACE'}
        </span>
        <button onClick={()=>setShowCategories(s=>!s)} className="btn" style={{ fontSize:'8px', padding:'2px 7px', background: showCategories ? 'rgba(45,212,191,0.1)' : 'transparent', borderColor: showCategories ? 'var(--accent)' : 'var(--border)', color: showCategories ? 'var(--accent)' : 'var(--t4)' }}>
          ☰ Categories
        </button>
        {(mapMode === 'environment' ? [
          { k:'aircraft',    label:`Air Patterns (${loading && !stats.aircraft ? '…' : stats.aircraft})`,  color:'#00ffcc' },
          { k:'ships',       label:`Maritime Intel (${loading && !stats.ships ? '…' : stats.ships})`,          color:'#0088ff' },
          { k:'gdacs',       label:`GDACS (${loading && !stats.gdacs ? '…' : stats.gdacs})`,                   color:'#ff7700' },
          { k:'firms',       label:`FIRMS (${loading && !stats.firms ? '…' : stats.firms})`,                   color:'#ffdd00' },
          { k:'eonet',       label:`EONET (${loading && !stats.eonet ? '…' : stats.eonet})`,                   color:'#ff3300' },
          { k:'earthquakes', label:`Quakes (${loading && !stats.quakes ? '…' : stats.quakes})`,                color:'#ff9900' },
          { k:'volcanoes',   label:`Volcanoes (${loading && !stats.volcanoes ? '…' : stats.volcanoes})`,       color:'#ff4400' },
          { k:'hurricanes',  label:`Storms (${loading && !stats.storms ? '…' : stats.storms})`,               color:'#aaddff' },
          { k:'floods',      label:`Floods (${loading && !stats.floods ? '…' : stats.floods})`,               color:'#0088cc' },
          { k:'globalFires', label:`Fires (${loading && !stats.fires ? '…' : stats.fires})`,                  color:'#ff6600' },
          { k:'weatherAlerts',label:`Weather (${stats.weather})`,       color:'#ffee44' },
          { k:'disease',     label:`Disease (${stats.disease})`,        color:'#22cc88' },
          { k:'iss',         label:`ISS`,                               color:'#aaddff' },
          { k:'launches',    label:`Launches (${stats.launches})`,      color:'#ff8800' },
          { k:'copernicus',  label:`Copernicus (${stats.copernicus})`,  color:'#00ddff' },
          { k:'sigmets',     label:`SIGMETs (${stats.sigmets})`,        color:'#ffee00' },
        ] : [
          { k:'hotspots',    label:`Hotspots`,                          color:'#ff3333' },
          { k:'acled',       label:`ACLED (${stats.acled})`,            color:'#ff1111' },
          { k:'milaircraft', label:`Mil.Air (${stats.milaircraft||0})`, color:'#ff4444' },
          { k:'warships',    label:`Warships (${stats.warships||0})`,   color:'#8888ff' },
          { k:'ucdp',        label:`UCDP (${stats.ucdp||0})`,           color:'#dc2626' },
          { k:'wikiConflicts',label:`WikiConfl (${stats.wikiConflicts||0})`, color:'#ea580c' },
          { k:'osmMilitary', label:`Mil.Bases (${stats.osmBases||0})`,  color:'#6b7280' },
          { k:'firms',       label:`FIRMS (${stats.firms})`,            color:'#ffdd00' },
          { k:'gpsjam',      label:`GPS Jam (${stats.gpsjam||0})`,      color:'#f59e0b' },
          { k:'nuclear',     label:`Nuclear (${stats.nuclear})`,        color:'#ffff00' },
          { k:'disease',     label:`Disease (${stats.disease})`,        color:'#22cc88' },
          { k:'maritime',    label:`Maritime (${stats.maritime})`,      color:'#0055cc' },
          { k:'cyber',       label:`Cyber (${stats.cyber})`,            color:'#ff00ff' },
          { k:'vuln',        label:`Vuln (${stats.vuln})`,              color:'#ff6600' },
          { k:'cve',         label:`CVEs (${stats.cve})`,               color:'#ffaa00' },
          { k:'news',        label:`BNO News (${stats.news})`,          color:'#2dd4bf' },
          { k:'notams',      label:`NOTAMs (${stats.notams||0})`,           color:'#ff8844' },
          { k:'wikiEdits',   label:`Wiki Edits (${stats.wikiEdits||0})`,    color:'#aaaaff' },
          { k:'bgp',         label:`BGP (${stats.bgp||0})`,                 color:'#ff6600' },
          { k:'viirs',       label:`VIIRS (${stats.viirs||0})`,             color:'#ffffff' },
          { k:'telegram',    label:`Telegram (${stats.telegram||0})`,       color:'#2dd4bf' },
          { k:'preaction',   label:`Pre-Action (${stats.preaction||0})`,    color:'#f59e0b' },
          { k:'crowds',      label:`Crowds (${stats.crowds||0})`,           color:'#f472b6' },
          { k:'humanitarian',label:`Humanitarian (${stats.humanitarian||0})`,color:'#fb923c' },
          { k:'iris',        label:`IRIS (${stats.iris||0})`,               color:'#818cf8' },
        ]).map(({ k, label, color }) => (
          <button key={k} className="mono"
            onClick={() => setLayers(l => ({ ...l, [k]: !l[k] }))}
            style={{ fontSize: '8px', padding: '2px 8px', borderRadius: '2px', cursor: 'pointer', border: 'none',
              background: layers[k] ? color + '20' : 'transparent',
              color: layers[k] ? color : 'var(--t4)',
              borderBottom: `2px solid ${layers[k] ? color : 'transparent'}` }}>
            {label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Severity legend */}
        {Object.entries(SEV_COLORS_CSS).map(([sev, color]) => (
          <span key={sev} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 4px ${color}` }} />
            <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>{sev}</span>
          </span>
        ))}

        {!hasApiKeys && (
          <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>
            Add ACLED + FIRMS keys in Settings for live conflict data
          </span>
        )}

        {loading && <RefreshCw size={10} className="spin" style={{ color: 'var(--accent)' }} />}
        {lastFetch && !loading && (
          <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>
            {lastFetch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

                <button className="btn" style={{ padding: '3px 7px', fontSize: '9px' }} onClick={fetchLive} disabled={loading}>
          <RefreshCw size={10} /> refresh
        </button>
        <button className="btn" title="Force refresh — bypasses all cache, re-fetches everything from APIs" style={{ padding: '3px 7px', fontSize: '9px', color:'#f97316', borderColor:'#f97316' }} onClick={() => {
          // Clear satellite cache then force refresh
          try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const k = localStorage.key(i)
              if (k?.startsWith('nexus-cache-v1-satellite') || k?.startsWith('nexus-cache-v1-alerts')) localStorage.removeItem(k)
            }
          } catch {}
          satRefresh(true)
        }} disabled={satLoading}>
          ⚡ force
        </button>
        <button className="btn" style={{ padding: '3px 7px', fontSize: '9px' }} onClick={resetView} title="Reset view + resume auto-rotate">
          <Maximize2 size={10} />
        </button>
        <button className="btn" style={{ padding: '3px 7px', fontSize: '9px' }}
          onClick={() => { const c = threeRef.current.camera; if (c) { c.position.z = Math.max(1.3, c.position.z * 0.85); setCameraZ(c.position.z) } }}>
          <ZoomIn size={10} />
        </button>
        <button className="btn" style={{ padding: '3px 7px', fontSize: '9px' }}
          onClick={() => { const c = threeRef.current.camera; if (c) { c.position.z = Math.min(7, c.position.z * 1.2); setCameraZ(c.position.z) } }}>
          <ZoomOut size={10} />
        </button>
      </div>

      {/* Globe + sidebars — globe fills full space, panels overlay */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Globe canvas — always full size */}
        <div ref={mountRef}
          style={{ position: 'absolute', inset: 0, cursor: isDragging.current ? 'grabbing' : 'grab' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {!threeReady && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px' }}>
              <RefreshCw size={20} className="spin" style={{ color: 'var(--accent)' }} />
              <span className="mono" style={{ fontSize: '10px', color: 'var(--t3)' }}>Loading 3D globe…</span>
            </div>
          )}

          {/* Signal count */}
          <div style={{ position: 'absolute', bottom: '10px', left: '12px', background: 'var(--void)', border: '1px solid var(--border)', borderRadius: '3px', padding: '4px 10px', pointerEvents: 'none' }}>
            <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>
              {loading ? '⟳ fetching…' : ''}{allPointsUnfiltered.length} total · {safePoints.length} rendered · ✈{loading && !stats.aircraft ? '…' : stats.aircraft} air · 🚢{loading && !stats.ships ? '…' : stats.ships} ships · ⚔{loading && !stats.milaircraft ? '…(loading)' : stats.milaircraft} mil · 🔥{stats.firms} fires · 🦠{stats.disease} disease · ☢️{stats.nuclear} nuke
            </span>
          </div>

          {/* ── Hover tooltip — INSIDE mountRef so position:absolute works ── */}
          {hovered && (
          <div className="fade-in" style={{
            position: 'absolute',
            left: Math.min(hovPos.x + 14, (mountRef.current?.clientWidth||800) - 280),
            top: Math.max(8, hovPos.y - 10),
            width: '260px', zIndex: 40, pointerEvents: 'none',
            background: 'rgba(4,12,28,0.97)',
            border: `1px solid ${SEV_COLORS_CSS[hovered.severity] || 'var(--border)'}55`,
            borderLeft: `3px solid ${SEV_COLORS_CSS[hovered.severity] || '#2dd4bf'}`,
            borderRadius: '4px', padding: '10px 12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px' }}>{TYPE_ICONS[hovered.type] || '◉'}</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--t1)', lineHeight: 1.3, flex: 1 }}>
                {hovered.name || hovered.title}
              </span>
              <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', borderRadius: '2px',
                background: (SEV_COLORS_CSS[hovered.severity]||'#2dd4bf') + '22',
                color: SEV_COLORS_CSS[hovered.severity]||'#2dd4bf' }}>
                {hovered.severity?.toUpperCase()}
              </span>
            </div>
            {hovered.lat && hovered.lng && (
              <div className="mono" style={{ fontSize: '8px', color: 'var(--accent)', marginBottom: '4px' }}>
                {Number(hovered.lat).toFixed(3)}° / {Number(hovered.lng).toFixed(3)}°
              </div>
            )}
            {hovered.desc && (
              <div style={{ fontSize: '10px', color: 'var(--t3)', lineHeight: 1.6, marginBottom: '4px' }}>
                {hovered.desc.slice(0, 180)}{hovered.desc.length > 180 ? '…' : ''}
              </div>
            )}
            {hovered.meta?.mag && (
              <div className="mono" style={{ fontSize: '9px', color: '#ff6600' }}>M{hovered.meta.mag?.toFixed(1)} · depth {hovered.meta.depth?.toFixed(0)}km{hovered.meta.tsunami ? ' ⚠ TSUNAMI' : ''}</div>
            )}
            {hovered.type === 'aircraft' && hovered.meta && (
              <div className="mono" style={{ fontSize: '9px', color: '#00ffcc' }}>
                {hovered.meta.callsign && `✈ ${hovered.meta.callsign}  `}
                {hovered.meta.alt != null && `Alt ${(hovered.meta.alt/1000).toFixed(1)}km  `}
                {hovered.meta.spd != null && `${(hovered.meta.spd*1.944).toFixed(0)}kt  `}
                {hovered.meta.heading != null && `Hdg ${hovered.meta.heading?.toFixed(0)}°`}
              </div>
            )}
            {(hovered.type === 'ship' || hovered.type === 'warship') && hovered.meta && (
              <div style={{ fontSize: '9px', color: hovered.type==='warship'?'#8888ff':'#0088ff' }}>
                <div className="mono" style={{ fontWeight:700 }}>{hovered.type==='warship'?'⚔':'🚢'} {hovered.meta.name || hovered.meta.mmsi || 'Unknown'}</div>
                <div className="mono" style={{ fontSize:'8px', color:'var(--t3)', marginTop:'2px' }}>
                  {hovered.meta.flag ? hovered.meta.flag+' · ' : ''}
                  {hovered.meta.shipType || ''}
                  {hovered.meta.speed != null ? ' · '+hovered.meta.speed+'kn' : ''}
                  {hovered.meta.heading != null ? ' · '+Math.round(hovered.meta.heading)+'°' : ''}
                </div>
                {hovered.meta.destination && <div className="mono" style={{ fontSize:'8px', color:'var(--t4)' }}>→ {hovered.meta.destination}</div>}
                {hovered.type==='warship' && <div className="mono" style={{ fontSize:'7px', color: hovered.meta._livePos?'#4ade80':'#f97316' }}>{hovered.meta._livePos?'🟢 Live AIS':'🔴 Home Port'}</div>}
              </div>
            )}
            {/* Cluster preview — show first 5 members on hover */}
            {hovered._cluster && hovered._clusterMembers?.length > 0 && (
              <div style={{ marginTop:'6px', borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:'5px' }}>
                <div className="mono" style={{ fontSize:'7px', color:'var(--t4)', marginBottom:'3px' }}>
                  CLUSTER · {hovered._clusterCount} items · click to expand
                </div>
                {hovered._clusterMembers.slice(0,5).map((m,i) => (
                  <div key={i} style={{ fontSize:'8px', color:'var(--t2)', marginBottom:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {TYPE_ICONS[m.type]||'◉'} {(m.name||m.title||'').slice(0,38)}
                  </div>
                ))}
                {hovered._clusterCount > 5 && (
                  <div className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>+ {hovered._clusterCount - 5} more…</div>
                )}
              </div>
            )}
            <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginTop: '4px' }}>
              {hovered._cluster ? 'Click to expand cluster' : 'Click to pin details'} · scroll to zoom
            </div>
          </div>
          )}
        </div>

        {/* ── CATEGORIES SIDEBAR — expandable dropdowns with item list ── */}
        {showCategories && (
          <CategoriesSidebar
            allPoints={allPointsUnfiltered}
            layers={layers}
            mapMode={mapMode}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            threeRef={threeRef}
            setSelected={setSelected}
            autoRotateRef={autoRotateRef}
            setAutoRotate={setAutoRotate}
            setExpandedCluster={setExpandedCluster}
            setCameraZ={setCameraZ}
          />
        )}

        {/* ── Cluster expand panel — shows all members of a typed cluster ── */}
        {expandedCluster && !selected && (
          <div style={{ position:'absolute', top:0, right:0, bottom:0, width:'280px', zIndex:20, borderLeft:'1px solid var(--border)', background:'var(--void)', display:'flex', flexDirection:'column', overflow:'hidden', backdropFilter:'blur(4px)' }} className="fade-in">
            <div style={{ padding:'8px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'6px', flexShrink:0 }}>
              <span className="mono" style={{ fontSize:'8px', color:'var(--accent)', flex:1, letterSpacing:'0.1em' }}>
                {expandedCluster._clusterType === 'milaircraft' ? '✈ MILITARY AIRCRAFT' :
                 expandedCluster._clusterType === 'warship'     ? '⚔ WARSHIPS' :
                 expandedCluster._clusterType === 'aircraft'    ? '✈ CIVIL AIRCRAFT' :
                 expandedCluster._clusterType === 'ship'        ? '🚢 VESSELS' : '◉ CLUSTER'}
                <span style={{ marginLeft:'6px', opacity:0.6 }}>×{expandedCluster._clusterCount}</span>
              </span>
              <button onClick={() => setExpandedCluster(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t3)' }}>
                <X size={12}/>
              </button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'6px 8px' }}>
              {(expandedCluster._clusterMembers || []).map((pt, i) => (
                <div key={i}
                  onClick={() => {
                    // Fly to location + open detail panel at once
                    if (pt.lat && pt.lng && threeRef.current?.globe) {
                      const theta = (pt.lng + 180) * (Math.PI / 180)
                      threeRef.current.globe.rotation.y = Math.PI / 2 - theta
                      const phi = (90 - pt.lat) * (Math.PI / 180)
                      threeRef.current.globe.rotation.x = Math.max(-0.65, Math.min(0.65, -(phi - Math.PI/2)))
                      autoRotateRef.current = false
                      setAutoRotate(false)
                    }
                    setSelected(pt)
                    setExpandedCluster(null)
                  }}
                  style={{ padding:'6px 8px', marginBottom:'3px', borderRadius:'3px', cursor:'pointer',
                    background:'var(--panel)', border:'1px solid var(--border)',
                    borderLeft:`3px solid ${SEV_COLORS_CSS[pt.severity]||'#2dd4bf'}` }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--surface)'}
                  onMouseLeave={e => e.currentTarget.style.background='var(--panel)'}
                >
                  <div style={{ fontSize:'9px', fontWeight:600, color:'var(--t1)', marginBottom:'2px', lineHeight:1.3 }}>
                    {pt.name || pt.title || pt.callsign || pt.mmsi || 'Unknown'}
                  </div>
                  <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                    {pt.meta?.country && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{pt.meta.country}</span>}
                    {pt.meta?.callsign && <span className="mono" style={{ fontSize:'7px', color:'var(--accent)' }}>{pt.meta.callsign}</span>}
                    {pt.meta?.alt && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{Math.round(pt.meta.alt).toLocaleString()}ft</span>}
                    {pt.meta?.speed && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{Math.round(pt.meta.speed)}kt</span>}
                    {pt.meta?.shipType && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{pt.meta.shipType}</span>}
                    <span className="mono" style={{ fontSize:'7px', padding:'1px 4px', borderRadius:'2px',
                      background:(SEV_COLORS_CSS[pt.severity]||'#2dd4bf')+'22',
                      color:SEV_COLORS_CSS[pt.severity]||'#2dd4bf' }}>
                      {pt.severity?.toUpperCase()||'LOW'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selected && (
          <div style={{ position:'absolute', top:0, right:0, bottom:0, width:'280px', zIndex:20, borderLeft:'1px solid var(--border)', background:'var(--void)', display:'flex', flexDirection:'column', overflow:'hidden', backdropFilter:'blur(4px)' }} className="fade-in">
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '2px', background: (SEV_COLORS_CSS[selected.severity||'low'] || '#2dd4bf') + '20', color: SEV_COLORS_CSS[selected.severity||'low'] || '#2dd4bf', fontWeight: 700 }}>
                {(selected.severity || 'info').toUpperCase()}
              </span>
              {selected.type === 'acled'   && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ef444420', color: '#ef4444', borderRadius: '2px' }}>◆ ACLED</span>}
              {selected.type === 'firms'   && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#fbbf2420', color: '#fbbf24', borderRadius: '2px' }}>🔥 FIRMS</span>}
              {selected.type === 'hotspot' && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: 'rgba(249,115,22,0.1)', color: 'var(--orange)', borderRadius: '2px' }}>◎ HOTSPOT</span>}
              {selected.type === 'news'    && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: 'rgba(45,212,191,0.1)', color: 'var(--accent)', borderRadius: '2px' }}>◉ NEWS</span>}
              {selected.type === 'earthquake' && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ff660020', color: '#ff6600', borderRadius: '2px' }}>⚡ USGS QUAKE</span>}
              {selected.type === 'hurricane' && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#cc44ff20', color: '#cc44ff', borderRadius: '2px' }}>🌀 NOAA STORM</span>}
              {selected.type === 'volcano'   && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ff220020', color: '#ff2200', borderRadius: '2px' }}>🌋 VOLCANO</span>}
              {selected.type === 'gdacs'     && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ffaa0020', color: '#ffaa00', borderRadius: '2px' }}>⚠ GDACS</span>}
              {selected.type === 'aircraft'  && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#00ffcc20', color: '#00ffcc', borderRadius: '2px' }}>✈ ADS-B</span>}
              {selected.type === 'ship'      && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#0088ff20', color: '#0088ff', borderRadius: '2px' }}>🚢 AIS</span>}
              {selected.type === 'copernicus' && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#00ccff20', color: '#00ccff', borderRadius: '2px' }}>🛰 COPERNICUS</span>}
              {selected.type?.startsWith('eonet') && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ff330020', color: '#ff3300', borderRadius: '2px' }}>🛰 NASA EONET</span>}
              {selected.type === 'flood'    && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#0044ff20', color: '#4488ff', borderRadius: '2px' }}>🌊 DFO FLOOD</span>}
              {selected.type === 'weather'  && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#4488ff20', color: '#88aaff', borderRadius: '2px' }}>⛈ NOAA WEATHER</span>}
              {selected.type === 'iss'      && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ffffff20', color: '#cccccc', borderRadius: '2px' }}>🛸 ISS LIVE</span>}
              {selected.type === 'launch'   && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ff880020', color: '#ff8800', borderRadius: '2px' }}>🚀 LAUNCH</span>}
              {selected.type === 'sigmet'    && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ffff0020', color: '#ffff00', borderRadius: '2px' }}>✈ SIGMET</span>}
              {selected.type === 'disease'   && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#22cc8820', color: '#22cc88', borderRadius: '2px' }}>🦠 DISEASE</span>}
              {selected.type === 'cyber'     && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ff00ff20', color: '#ff00ff', borderRadius: '2px' }}>💻 CYBER</span>}
              {selected.type === 'gpsjam'    && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#f59e0b20', color: '#f59e0b', borderRadius: '2px' }}>📡 GPS JAM</span>}
              {selected.type === 'notam'     && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ff884420', color: '#ff8844', borderRadius: '2px' }}>✈ NOTAM</span>}
              {selected.type === 'telegram'  && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#2dd4bf20', color: '#2dd4bf', borderRadius: '2px' }}>📡 TELEGRAM</span>}
              {selected.type === 'wikiEdit'  && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#aaaaff20', color: '#aaaaff', borderRadius: '2px' }}>📝 WIKI EDIT</span>}
              {selected.type === 'bgp'       && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ff660020', color: '#ff6600', borderRadius: '2px' }}>🌐 BGP</span>}
              {selected.type === 'maritime'  && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#0055cc20', color: '#0055cc', borderRadius: '2px' }}>⚓ MARITIME</span>}
              {selected.type === 'nuclear'   && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ffff0020', color: '#ffff00', borderRadius: '2px' }}>☢️ NUCLEAR</span>}
              {selected.type === 'crowd'     && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#f472b620', color: '#f472b6', borderRadius: '2px' }}>👥 CROWD</span>}
              {selected.type === 'viirs'     && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ffffff20', color: '#cccccc', borderRadius: '2px' }}>🛰 VIIRS</span>}
              {selected.type === 'milaircraft' && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ff444420', color: '#ff4444', borderRadius: '2px' }}>✈ MILITARY</span>}
              {selected.type === 'warship'   && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#8888ff20', color: '#8888ff', borderRadius: '2px' }}>⚔ WARSHIP</span>}
              {selected.type === 'acled'     && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ef444420', color: '#ef4444', borderRadius: '2px' }}>⚔️ CONFLICT</span>}
              {selected.type === 'hotspot'   && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ff333320', color: '#ff3333', borderRadius: '2px' }}>🎯 HOTSPOT</span>}
              {selected.type === 'vuln'      && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ff660020', color: '#ff6600', borderRadius: '2px' }}>🔓 EXPOSED INFRA</span>}
              {selected.type === 'cve'       && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ffaa0020', color: '#ffaa00', borderRadius: '2px' }}>⚠️ CVE</span>}
              {selected.type === 'nuclear'   && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ffff0020', color: '#ffff00', borderRadius: '2px' }}>☢️ NUCLEAR</span>}
              {selected.type === 'maritime'  && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#0055cc20', color: '#4488ff', borderRadius: '2px' }}>⚓ MARITIME</span>}
              {selected.type === 'humanitarian' && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ff880020', color: '#ff8800', borderRadius: '2px' }}>🆘 CRISIS</span>}
              {selected.type === 'social'    && <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', background: '#ff660020', color: '#ff6600', borderRadius: '2px' }}>📡 SIGNAL</span>}
              <button onClick={() => setSelected(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}><X size={12}/></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', lineHeight: 1.4, marginBottom: '8px' }}>{selected.title || selected.name || selected.desc?.slice(0,80) || 'Signal'}</div>

              {/* Coordinates + quick map links */}
              {(selected.lat && selected.lng) && (
                <div style={{ marginBottom: '8px', padding: '5px 8px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginBottom: '3px', letterSpacing: '0.1em' }}>COORDINATES</div>
                  <div className="mono" style={{ fontSize: '10px', color: 'var(--accent)', marginBottom: '3px' }}>
                    {Number(selected.lat).toFixed(4)}°&nbsp;&nbsp;{Number(selected.lng).toFixed(4)}°
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    <a href={`https://www.google.com/maps?q=${selected.lat},${selected.lng}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '8px', color: 'var(--t3)', textDecoration: 'none' }}>↗ Google Maps</a>
                    <a href={`https://www.openstreetmap.org/?mlat=${selected.lat}&mlon=${selected.lng}&zoom=10`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '8px', color: 'var(--t3)', textDecoration: 'none' }}>↗ OpenStreetMap</a>
                    <a href={`https://zoom.earth/#view=${selected.lat},${selected.lng},12z`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '8px', color: 'var(--t3)', textDecoration: 'none' }}>↗ Zoom.Earth (satellite)</a>
                  </div>
                </div>
              )}

              {/* Data source + last snapshot timestamp */}
              {(() => {
                // Per-event date from the data itself
                const eventDate = selected.date || selected.time || selected.pub
                  || selected.meta?.date || selected.meta?.time || null
                // Source label by type
                const SOURCE_LABELS = {
                  aircraft:'ADS-B (adsb.fi / OpenSky)', ship:'AIS (AISStream / MarineTraffic)',
                  earthquake:'USGS Earthquake Hazards', gdacs:'GDACS UN Disaster Alerts',
                  hurricane:'NOAA National Hurricane Center', volcano:'GVP Smithsonian Institution',
                  flood:'DFO Flood Observatory', eonet_wildfire:'NASA EONET', eonet_severe_storms:'NASA EONET',
                  eonet_other:'NASA EONET', copernicus:'Copernicus EMS (ESA)', sigmet:'NOAA Aviation Weather',
                  firms:'NASA FIRMS (VIIRS/MODIS)', iss:'NASA Open Notify', launch:'Launch Library 2',
                  disease:'WHO Disease Outbreak News / ProMED', nuclear:'IAEA Nuclear Events',
                  maritime:'EMSA SafeSeaNet', humanitarian:'UN ReliefWeb',
                  cyber:'CISA US-CERT / Abuse.ch Feodo', social:'Reddit (OSINTed)',
                  news:'GDELT Project', acled:'ACLED Conflict Monitor',
                  hotspot:'NEXUS Intelligence Database',
                }
                const src = SOURCE_LABELS[selected.type] || (selected.meta?.source) || 'Satellite API'
                // Snapshot time — either per-event or global fetch time
                const snapTime = selected._fetchedAt || satData?.summary?.fetchedAt
                const snapStr = snapTime ? new Date(snapTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + ' ' + new Date(snapTime).toLocaleDateString([], {month:'short',day:'numeric'}) : null
                return (
                  <div style={{ marginBottom:'8px', padding:'4px 8px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'3px', display:'flex', flexDirection:'column', gap:'2px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span className="mono" style={{ fontSize:'7px', color:'var(--t4)', letterSpacing:'0.08em' }}>SOURCE</span>
                      {snapStr && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>snapshot {snapStr}</span>}
                    </div>
                    <span className="mono" style={{ fontSize:'8px', color:'var(--t3)' }}>{src}</span>
                    {eventDate && (
                      <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>
                        event: {typeof eventDate === 'number' ? new Date(eventDate).toLocaleString() : String(eventDate).slice(0,19).replace('T',' ')}
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* Description — shown for all types */}
              {(selected.desc || selected.callsign || selected.mmsi || selected.altitude != null) && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'var(--panel)', border: `1px solid ${SEV_COLORS_CSS[selected.severity||'low']||'var(--border)'}30`, borderRadius: '3px' }}>
                  {selected.desc && <div style={{ fontSize: '10px', color: 'var(--t2)', lineHeight: 1.7, marginBottom: selected.callsign||selected.mmsi ? '4px' : 0 }}>{selected.desc}</div>}
                  {(selected.callsign||selected.mmsi) && <div className="mono" style={{ fontSize:'9px', color:'var(--accent)' }}>ID: {selected.callsign||selected.mmsi||''}</div>}
                  {selected.altitude != null && <div className="mono" style={{ fontSize:'9px', color:'var(--t3)' }}>Alt: {Math.round(selected.altitude).toLocaleString()} ft{selected.velocity ? ` · ${Math.round(selected.velocity)} kts` : ''}{selected.heading != null ? ` · hdg ${Math.round(selected.heading)}°` : ''}</div>}
                  {selected.speed != null && !selected.altitude && <div className="mono" style={{ fontSize:'9px', color:'var(--t3)' }}>Speed: {selected.speed} kn{selected.heading != null ? ` · hdg ${Math.round(selected.heading)}°` : ''}</div>}
                </div>
              )}

              {/* Type-specific metadata */}
              {selected.type === 'earthquake' && selected.meta && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(255,102,0,0.06)', border: '1px solid rgba(255,102,0,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#ff6600', marginBottom: '4px', letterSpacing: '0.1em' }}>⚡ USGS EARTHQUAKE DATA</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>Magnitude: <strong style={{ color: '#ff6600' }}>M{selected.meta.mag?.toFixed(1)}</strong></div>
                    <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>Depth: {selected.meta.depth?.toFixed(0)}km</div>
                    {selected.meta.tsunami && <div className="mono" style={{ fontSize: '9px', color: '#ef4444', fontWeight: 700, gridColumn: 'span 2' }}>⚠ TSUNAMI WARNING ISSUED</div>}
                  </div>
                </div>
              )}

              {selected.type === 'hurricane' && selected.meta && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(204,68,255,0.06)', border: '1px solid rgba(204,68,255,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#cc44ff', marginBottom: '4px', letterSpacing: '0.1em' }}>🌀 NOAA NHC TROPICAL STORM</div>
                  <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>Wind: {selected.meta.intensity} kt &nbsp;|&nbsp; Pressure: {selected.meta.pressure} mb</div>
                </div>
              )}

              {selected.type === 'aircraft' && selected.meta && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(0,255,204,0.06)', border: '1px solid rgba(0,255,204,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#00ffcc', marginBottom: '4px', letterSpacing: '0.1em' }}>✈ OPENSKY NETWORK — ADS-B</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px' }}>
                    {selected.meta.callsign && <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>Flight: <strong>{selected.meta.callsign}</strong></div>}
                    {selected.meta.icao24 && <div className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>ICAO24: {selected.meta.icao24}</div>}
                    {selected.meta.alt != null && <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>Alt: {(selected.meta.alt/1000).toFixed(1)}km</div>}
                    {selected.meta.spd != null && <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>Speed: {(selected.meta.spd*1.944).toFixed(0)} kt</div>}
                  </div>
                </div>
              )}

              {selected.type === 'ship' && selected.meta && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(0,136,255,0.06)', border: '1px solid rgba(0,136,255,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#0088ff', marginBottom: '4px', letterSpacing: '0.1em' }}>🚢 AIS VESSEL DATA</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px' }}>
                    {selected.meta.mmsi && <div className="mono" style={{ fontSize: '9px', color: 'var(--t4)', gridColumn:'1/-1' }}>MMSI: {selected.meta.mmsi}</div>}
                    {selected.meta.name && <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)', gridColumn:'1/-1', fontWeight:700 }}>{selected.meta.name}</div>}
                    {selected.meta.speed != null && <div className="mono" style={{ fontSize: '9px', color: '#0088ff' }}>⚡ {selected.meta.speed} kn</div>}
                    {selected.meta.heading != null && <div className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>↗ {Math.round(selected.meta.heading)}°</div>}
                    {selected.meta.shipType && <div className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>Type: {selected.meta.shipType}</div>}
                    {selected.meta.flag && <div className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>Flag: {selected.meta.flag}</div>}
                    {selected.meta.destination && <div className="mono" style={{ fontSize: '9px', color: 'var(--t3)', gridColumn:'1/-1' }}>→ {selected.meta.destination}</div>}
                    {selected.meta.zone && <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', gridColumn:'1/-1' }}>Zone: {selected.meta.zone}</div>}
                    {selected.meta.length && <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>{selected.meta.length}m LOA</div>}
                  </div>
                  <a href={selected.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:'8px', color:'#0088ff', display:'block', marginTop:'4px' }}>→ Track on MarineTraffic</a>
                </div>
              )}

              {selected.type === 'warship' && selected.meta && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(136,136,255,0.06)', border: '1px solid rgba(136,136,255,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#8888ff', marginBottom: '4px', letterSpacing: '0.1em' }}>⚔ NAVAL VESSEL — {selected.meta._livePos ? '🟢 LIVE AIS' : '🔴 HOME PORT'}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px' }}>
                    {selected.meta.mmsi && <div className="mono" style={{ fontSize: '9px', color: 'var(--t4)', gridColumn:'1/-1' }}>MMSI: {selected.meta.mmsi}</div>}
                    {selected.meta.name && <div className="mono" style={{ fontSize: '9px', color: 'var(--t1)', gridColumn:'1/-1', fontWeight:700 }}>{selected.meta.name}</div>}
                    {selected.meta.flag && <div className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>Flag: {selected.meta.flag}</div>}
                    {selected.meta.shipType && <div className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>Class: {selected.meta.shipType}</div>}
                    {selected.meta.speed != null && selected.meta.speed > 0 && <div className="mono" style={{ fontSize: '9px', color: '#8888ff' }}>⚡ {selected.meta.speed} kn</div>}
                    {selected.meta.heading != null && selected.meta.heading > 0 && <div className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>↗ {Math.round(selected.meta.heading)}°</div>}
                    {selected.meta.zone && <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', gridColumn:'1/-1' }}>Zone: {selected.meta.zone}</div>}
                  </div>
                  {!selected.meta._livePos && <div className="mono" style={{ fontSize:'7px', color:'#f97316', marginTop:'4px' }}>⚠ Position = home port. Military vessels often disable AIS at sea.</div>}
                </div>
              )}

              {selected.type === 'gdacs' && selected.meta && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.25)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#ffaa00', marginBottom: '4px', letterSpacing: '0.1em' }}>⚠ GDACS UN DISASTER ALERT</div>
                  <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>
                    Type: {selected.meta.eventtype} &nbsp;|&nbsp; Alert: <span style={{ color: selected.meta.alertlevel === 'red' ? '#ef4444' : selected.meta.alertlevel === 'orange' ? '#f97316' : '#4ade80', fontWeight: 700 }}>{selected.meta.alertlevel?.toUpperCase()}</span>
                  </div>
                </div>
              )}

              {(selected.type === 'volcano' || selected.type === 'eonet_volcanoes') && selected.meta && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(255,34,0,0.06)', border: '1px solid rgba(255,34,0,0.25)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#ff2200', marginBottom: '4px', letterSpacing: '0.1em' }}>🌋 GVP ACTIVE ERUPTION</div>
                  <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>
                    {selected.meta.vei != null && `VEI: ${selected.meta.vei} · `}Country: {selected.meta.country}
                  </div>
                </div>
              )}

              {selected.type === 'acled' && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: 'var(--red)', marginBottom: '4px', letterSpacing: '0.1em' }}>◆ ACLED CONFLICT EVENT</div>
                  {selected.pub && <div style={{ fontSize: '10px', color: 'var(--t2)', marginBottom: '2px' }}>📅 {new Date(selected.pub).toLocaleDateString()}</div>}
                  {selected.country && <div style={{ fontSize: '10px', color: 'var(--t2)', marginBottom: '2px' }}>📍 {selected.country}</div>}
                  {selected.eventType && <div style={{ fontSize: '10px', color: 'var(--t2)', marginBottom: '2px' }}>⚔ {selected.eventType}</div>}
                  {selected.fatalities > 0 && <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 700, marginTop: '4px' }}>💀 {selected.fatalities} fatalities</div>}
                </div>
              )}

              {selected.type === 'firms' && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#fbbf24', marginBottom: '4px', letterSpacing: '0.1em' }}>🔥 NASA FIRMS — THERMAL ANOMALY</div>
                  {selected.meta?.brightness && <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>Brightness: {selected.meta.brightness?.toFixed(0)}K · Product: {selected.meta.product||'VIIRS'}</div>}
                </div>
              )}
              {selected.type === 'flood' && selected.meta && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(0,68,255,0.06)', border: '1px solid rgba(0,68,255,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#0044ff', marginBottom: '4px', letterSpacing: '0.1em' }}>🌊 DFO FLOOD OBSERVATORY</div>
                  {selected.meta.displaced>0 && <div style={{ fontSize: '10px', color: '#4488ff' }}>🏠 {selected.meta.displaced?.toLocaleString()} displaced</div>}
                  {selected.meta.dead>0 && <div style={{ fontSize: '10px', color: '#ef4444', fontWeight:700 }}>💀 {selected.meta.dead} fatalities</div>}
                </div>
              )}
              {selected.type === 'iss' && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#ffffff', marginBottom: '4px', letterSpacing: '0.1em' }}>🛸 LIVE ISS POSITION</div>
                  <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>Altitude: ~{selected.meta?.altitude}km · Speed: ~{selected.meta?.velocity?.toLocaleString()}km/h</div>
                  <div style={{ fontSize: '9px', color: 'var(--t3)', marginTop: '3px' }}>Orbits Earth every 92 minutes · 6 crew on board</div>
                </div>
              )}
              {selected.type === 'launch' && selected.meta && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(255,136,0,0.06)', border: '1px solid rgba(255,136,0,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#ff8800', marginBottom: '4px', letterSpacing: '0.1em' }}>🚀 UPCOMING LAUNCH</div>
                  <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>Vehicle: {selected.meta.vehicle} · Provider: {selected.meta.provider}</div>
                  {selected.meta.probability && <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>Launch probability: {selected.meta.probability}%</div>}
                </div>
              )}

              {selected.type === 'copernicus' && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(0,204,255,0.06)', border: '1px solid rgba(0,204,255,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#00ccff', marginBottom: '4px', letterSpacing: '0.1em' }}>🛰 COPERNICUS EU — SATELLITE ACTIVATION</div>
                  <div style={{ fontSize: '10px', color: 'var(--t3)', lineHeight: 1.6 }}>EU satellite imagery has been formally tasked for this event. Processed satellite maps available at source link.</div>
                </div>
              )}

              {(selected.type === 'eonet_wildfire' || selected.type === 'eonet_severe_storms' || selected.type?.startsWith('eonet')) && (
                <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(255,51,0,0.06)', border: '1px solid rgba(255,51,0,0.2)', borderRadius: '3px' }}>
                  <div className="mono" style={{ fontSize: '7px', color: '#ff3300', marginBottom: '4px', letterSpacing: '0.1em' }}>🛰 NASA EONET — NATURAL EVENT</div>
                  <div className="mono" style={{ fontSize: '9px', color: 'var(--t2)' }}>Category: {selected.meta?.category}</div>
                </div>
              )}
              {selected.type === 'disease' && (
                <div style={{ marginBottom:'8px', padding:'6px 8px', background:'rgba(34,204,136,0.06)', border:'1px solid rgba(34,204,136,0.25)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#22cc88', marginBottom:'4px', letterSpacing:'0.1em' }}>🦠 {selected.meta?.source||'DISEASE SURVEILLANCE'}</div>
                  <div style={{ fontSize:'10px', color:'var(--t3)', lineHeight:1.6 }}>Disease outbreak alert. Click source for full epidemiological report.</div>
                </div>
              )}
              {selected.type === 'cyber' && (
                <div style={{ marginBottom:'8px', padding:'6px 8px', background:'rgba(255,0,255,0.06)', border:'1px solid rgba(255,0,255,0.25)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#ff00ff', marginBottom:'4px', letterSpacing:'0.1em' }}>💻 {selected.meta?.source||'CYBER THREAT INTEL'}</div>
                  {selected.meta?.ip && (
                    <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center', marginBottom:'3px' }}>
                      <div className="mono" style={{ fontSize:'9px', color:'var(--t2)' }}>IP: <strong>{selected.meta.ip}</strong></div>
                      {selected.meta?.country && <div className="mono" style={{ fontSize:'9px', color:'var(--t4)' }}>{selected.meta.country}</div>}
                      <a href={`https://www.shodan.io/host/${selected.meta.ip}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'8px', color:'#f97316' }}>↗ Shodan</a>
                      <a href={`https://internetdb.shodan.io/${selected.meta.ip}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'8px', color:'#0088ff' }}>↗ InternetDB</a>
                      <a href={`https://search.censys.io/hosts/${selected.meta.ip}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'8px', color:'#a78bfa' }}>↗ Censys</a>
                      <a href={`https://www.virustotal.com/gui/ip-address/${selected.meta.ip}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'8px', color:'#22cc88' }}>↗ VirusTotal</a>
                    </div>
                  )}
                  {selected.meta?.vulns?.length > 0 && (
                    <div style={{ padding:'3px 6px', background:'rgba(239,68,68,0.1)', borderRadius:'2px', marginBottom:'3px' }}>
                      <div className="mono" style={{ fontSize:'7px', color:'#ef4444', fontWeight:700 }}>⚠️ KNOWN VULNERABILITIES: {selected.meta.vulns.join(' · ')}</div>
                    </div>
                  )}
                  {selected.meta?.cveID && (
                    <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center' }}>
                      <div className="mono" style={{ fontSize:'9px', color:'#ff00ff', fontWeight:700 }}>CVE: {selected.meta.cveID}</div>
                      {selected.meta?.cvss && <div className="mono" style={{ fontSize:'9px', color:parseFloat(selected.meta.cvss)>=9?'#ef4444':parseFloat(selected.meta.cvss)>=7?'#f97316':'#eab308' }}>CVSS {selected.meta.cvss}</div>}
                      <a href={selected.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:'8px', color:'#ff00ff' }}>↗ NVD</a>
                    </div>
                  )}
                </div>
              )}
              {selected.type === 'vuln' && (
                <div style={{ marginBottom:'8px', padding:'6px 8px', background:'rgba(255,102,0,0.06)', border:'1px solid rgba(255,102,0,0.25)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#ff6600', marginBottom:'4px', letterSpacing:'0.1em' }}>🔓 {selected.meta?.source||'EXPOSED INFRASTRUCTURE'}</div>
                  {selected.meta?.ip && (
                    <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center', marginBottom:'3px' }}>
                      <div className="mono" style={{ fontSize:'9px', color:'var(--t2)' }}>IP: <strong>{selected.meta.ip}</strong></div>
                      {selected.meta?.country && <div className="mono" style={{ fontSize:'9px', color:'var(--t4)' }}>{selected.meta.country}</div>}
                      {selected.meta?.ip && <a href={`https://www.shodan.io/host/${selected.meta.ip}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'8px', color:'#f97316' }}>↗ Shodan</a>}
                      {selected.meta?.ip && <a href={`https://internetdb.shodan.io/${selected.meta.ip}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'8px', color:'#0088ff' }}>↗ InternetDB</a>}
                      {selected.meta?.ip && <a href={`https://search.censys.io/hosts/${selected.meta.ip}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'8px', color:'#a78bfa' }}>↗ Censys</a>}
                      {selected.meta?.ip && <a href={`https://www.virustotal.com/gui/ip-address/${selected.meta.ip}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'8px', color:'#22cc88' }}>↗ VirusTotal</a>}
                    </div>
                  )}
                  {selected.meta?.vulns?.length > 0 && (
                    <div style={{ padding:'3px 6px', background:'rgba(239,68,68,0.1)', borderRadius:'2px' }}>
                      <div className="mono" style={{ fontSize:'7px', color:'#ef4444', fontWeight:700 }}>⚠️ KNOWN CVEs: {selected.meta.vulns.slice(0,5).join(' · ')}</div>
                    </div>
                  )}
                </div>
              )}
              {selected.type === 'cve' && (
                <div style={{ marginBottom:'8px', padding:'6px 8px', background:'rgba(255,170,0,0.06)', border:'1px solid rgba(255,170,0,0.25)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#ffaa00', marginBottom:'4px', letterSpacing:'0.1em' }}>⚠️ {selected.meta?.source||'CVE / KEV'}</div>
                  {selected.meta?.cveID && (
                    <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center' }}>
                      <div className="mono" style={{ fontSize:'10px', color:'#ffaa00', fontWeight:700 }}>{selected.meta.cveID}</div>
                      {selected.meta?.cvss && <div className="mono" style={{ fontSize:'9px', fontWeight:700,
                        color: parseFloat(selected.meta.cvss)>=9?'#ef4444':parseFloat(selected.meta.cvss)>=7?'#f97316':'#eab308' }}>CVSS {selected.meta.cvss}</div>}
                      {selected.url && <a href={selected.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:'8px', color:'#ffaa00' }}>↗ NVD</a>}
                      <a href={`https://cve.mitre.org/cgi-bin/cvename.cgi?name=${selected.meta.cveID}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'8px', color:'var(--t3)' }}>↗ MITRE</a>
                    </div>
                  )}
                </div>
              )}
              {selected.type === 'nuclear' && (
                <div style={{ marginBottom:'8px', padding:'6px 8px', background:'rgba(255,255,0,0.05)', border:'1px solid rgba(255,255,0,0.2)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#ffff00', marginBottom:'4px', letterSpacing:'0.1em' }}>☢️ IAEA — NUCLEAR EVENT MONITOR</div>
                  <div style={{ fontSize:'10px', color:'var(--t3)', lineHeight:1.6 }}>IAEA alert. Location approximated to nearest known facility.</div>
                </div>
              )}
              {selected.type === 'maritime' && (
                <div style={{ marginBottom:'8px', padding:'6px 8px', background:'rgba(0,85,204,0.06)', border:'1px solid rgba(0,85,204,0.25)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#4488ff', marginBottom:'4px', letterSpacing:'0.1em' }}>⚓ EMSA — MARITIME INCIDENT</div>
                  <div style={{ fontSize:'10px', color:'var(--t3)', lineHeight:1.6 }}>European Maritime Safety Agency. Source: SafeSeaNet.</div>
                </div>
              )}
              {selected.type === 'humanitarian' && (
                <div style={{ marginBottom:'8px', padding:'6px 8px', background:'rgba(255,136,0,0.06)', border:'1px solid rgba(255,136,0,0.25)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#ff8800', marginBottom:'4px', letterSpacing:'0.1em' }}>🆘 UN RELIEFWEB — ACTIVE CRISIS</div>
                  {selected.meta?.country && <div className="mono" style={{ fontSize:'9px', color:'var(--t2)' }}>Country: {selected.meta.country}</div>}
                </div>
              )}
              {selected.type === 'social' && (
                <div style={{ marginBottom:'8px', padding:'6px 8px', background:'rgba(255,102,0,0.06)', border:'1px solid rgba(255,102,0,0.25)', borderRadius:'3px' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#ff6600', marginBottom:'4px', letterSpacing:'0.1em' }}>📡 REDDIT — BREAKING SIGNAL</div>
                  {selected.meta?.subreddit && <div className="mono" style={{ fontSize:'9px', color:'var(--t2)' }}>r/{selected.meta.subreddit}</div>}
                  {selected.meta?.score != null && <div className="mono" style={{ fontSize:'9px', color:'#ff6600', fontWeight:700 }}>{selected.meta.score?.toLocaleString()} upvotes</div>}
                </div>
              )}

              {selected.summary && <p style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.7, marginBottom: '10px' }}>{selected.summary}</p>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '8px' }}>
                {selected.url && selected.url !== '#' && selected.url !== 'null' && (
                  <a href={selected.url} target="_blank" rel="noopener noreferrer" className="btn" style={{ justifyContent: 'center', fontSize: '10px' }}>
                    <ExternalLink size={10}/> view source data
                  </a>
                )}
                <button className="btn btn-accent" style={{ justifyContent: 'center', fontSize: '10px' }}
                  onClick={() => addNode({
                    type: ['acled','firms'].includes(selected.type) ? 'event' : selected.type === 'aircraft' ? 'entity' : selected.type === 'ship' ? 'entity' : 'location',
                    label: (selected.title || selected.name || '').slice(0, 55),
                    detail: selected.desc || '',
                    source: selected.source || selected.type || 'Intel Map',
                    url: selected.url || '#',
                    color: SEV_COLORS_CSS[selected.severity],
                    x: 200 + Math.random() * 400, y: 150 + Math.random() * 300,
                  })}>
                  + save to board
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Watcher Alert Toasts — top center ────────────────────────── */}
        {watcherAlerts.length > 0 && (
          <div style={{ position:'absolute', top:8, left:'50%', transform:'translateX(-50%)', zIndex:50, display:'flex', flexDirection:'column', gap:'4px', pointerEvents:'none' }}>
            {watcherAlerts.slice(0,3).map((a, i) => (
              <div key={i} className="fade-in" style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.5)', borderRadius:'4px', padding:'6px 12px', display:'flex', alignItems:'center', gap:'8px', backdropFilter:'blur(8px)', minWidth:'260px' }}>
                <span style={{ fontSize:'12px' }}>🔔</span>
                <div>
                  <div style={{ fontSize:'9px', fontWeight:700, color:'#ef4444', fontFamily:'JetBrains Mono', letterSpacing:'0.08em' }}>WATCHER ALERT — {a.watcher.label || a.watcher.type.toUpperCase()}</div>
                  <div style={{ fontSize:'9px', color:'var(--t2)' }}>{a.count} match{a.count>1?'es':''} · {a.sample?.name?.slice(0,60)}</div>
                </div>
              </div>
            ))}
          </div>
        )}


        {/* ── Cluster zoom hint ─────────────────────────────────────────── */}
        {cameraZ > 3.5 && (
          <div style={{ position:'absolute', bottom:10, right:8, background:'var(--void)', border:'1px solid var(--border)', borderRadius:'3px', padding:'3px 8px', pointerEvents:'none' }}>
            <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>clustered · zoom in to expand</span>
          </div>
        )}

      </div>
    </div>
  )
}

// ── CategoriesSidebar — expandable dropdowns with item list, search, locate ──
function CategoriesSidebar({ allPoints, layers, mapMode, categoryFilter, setCategoryFilter, threeRef, setSelected, autoRotateRef, setAutoRotate, setExpandedCluster, setCameraZ }) {
  const [expanded, setExpanded] = React.useState({})
  const [searches, setSearches] = React.useState({})
  const [shodanData, setShodanData] = React.useState({})
  const [shodanLoading, setShodanLoading] = React.useState({})

  const ENV_CATS = [
    { id:'aircraft',     icon:'✈️', label:'Air Patterns',          color:'#00ffcc', match: p=>p.type==='aircraft' },
    { id:'ships',        icon:'🚢', label:'Maritime Intel',        color:'#0088ff', match: p=>p.type==='ship' },
    { id:'gdacs',        icon:'⚠️', label:'GDACS Disasters',       color:'#ff7700', match: p=>p.type==='gdacs' },
    { id:'firms',        icon:'🔥', label:'FIRMS Thermal',         color:'#ffdd00', match: p=>p.type==='firms' },
    { id:'eonet',        icon:'🛰', label:'NASA EONET',            color:'#ff3300', match: p=>p.type?.startsWith('eonet') },
    { id:'earthquakes',  icon:'⚡', label:'Earthquakes',           color:'#ff9900', match: p=>p.type==='earthquake' },
    { id:'volcanoes',    icon:'🌋', label:'Volcanoes',             color:'#ff4400', match: p=>p.type==='volcano' },
    { id:'hurricanes',   icon:'🌀', label:'Tropical Storms',       color:'#aaddff', match: p=>p.type==='hurricane'||p.type==='storm' },
    { id:'floods',       icon:'🌊', label:'Active Floods',         color:'#0088cc', match: p=>p.type==='flood' },
    { id:'globalFires',  icon:'🔥', label:'Global Fires (VIIRS)', color:'#ff6600', match: p=>p.type==='viirs'||p._nasaFire },
    { id:'weatherAlerts',icon:'⛈', label:'Weather Alerts',        color:'#ffee44', match: p=>p.type==='weather' },
    { id:'disease',      icon:'🦠', label:'Disease Outbreaks',     color:'#22cc88', match: p=>p.type==='disease' },
    { id:'iss',          icon:'🛸', label:'ISS Position',          color:'#aaddff', match: p=>p.type==='iss' },
    { id:'launches',     icon:'🚀', label:'Rocket Launches',       color:'#ff8800', match: p=>p.type==='launch' },
    { id:'copernicus',   icon:'🛰️', label:'Copernicus EMS',        color:'#00ddff', match: p=>p.type==='copernicus' },
    { id:'sigmets',      icon:'⚡', label:'Aviation SIGMETs',      color:'#ffee00', match: p=>p.type==='sigmet' },
  ]
  const INTEL_CATS = [
    { id:'hotspots',     icon:'🎯', label:'Conflict Hotspots',     color:'#ff3333', match: p=>p.type==='hotspot' },
    { id:'acled',        icon:'⚔️', label:'GDELT Conflict Events', color:'#ff1111', match: p=>p.type==='conflict' },
    { id:'milaircraft',  icon:'✈',  label:'Military Aircraft',     color:'#ff4444', match: p=>p.type==='milaircraft', note: 'Updates 2-5min after load via ADSB WebSocket + REST. Stays cached between refreshes.' },
    { id:'warships',     icon:'⚔',  label:'Warships / Naval',      color:'#8888ff', match: p=>p.type==='warship' },
    { id:'firms',        icon:'🔥', label:'FIRMS Thermal',         color:'#ffdd00', match: p=>p.type==='firms' },
    { id:'gpsjam',       icon:'📡', label:'GPS Jamming',           color:'#f59e0b', match: p=>p.type==='gpsjam' },
    { id:'nuclear',      icon:'☢️', label:'Nuclear Events',        color:'#ffff00', match: p=>p.type==='nuclear' },
    { id:'disease',      icon:'🦠', label:'Disease Outbreaks',     color:'#22cc88', match: p=>p.type==='disease' },
    { id:'maritime',     icon:'⚓', label:'Maritime Incidents',    color:'#0055cc', match: p=>p.type==='maritime' },
    { id:'cyber',        icon:'💻', label:'Cyber Threats',         color:'#ff00ff', match: p=>p.type==='cyber' },
    { id:'vuln',         icon:'🔓', label:'Exposed Infrastructure',color:'#ff6600', match: p=>p.type==='vuln' },
    { id:'cve',          icon:'⚠️', label:'CVEs & KEV',            color:'#ffaa00', match: p=>p.type==='cve' },
    { id:'news',         icon:'📰', label:'BNO News Wire',         color:'#2dd4bf', match: p=>p.type==='news' },
    { id:'notams',       icon:'✈',  label:'NOTAMs / Airspace',      color:'#ff8844', match: p=>p.type==='notam' },
    { id:'wikiEdits',    icon:'📝', label:'Wikipedia Edits',        color:'#aaaaff', match: p=>p.type==='wikiEdit' },
    { id:'bgp',          icon:'🌐', label:'BGP Anomalies',          color:'#ff6600', match: p=>p.type==='bgp' },
    { id:'viirs',        icon:'🛰️', label:'VIIRS Nightlights',      color:'#ffffff', match: p=>p.type==='viirs' },
    { id:'telegram',     icon:'📡', label:'Telegram Intel',         color:'#2dd4bf', match: p=>p.type==='telegram'||p._telegram },
    { id:'preaction',    icon:'⚡', label:'Pre-Action Indicators',  color:'#f59e0b', match: p=>p._preAction||p.type==='preaction' },
    { id:'crowds',       icon:'👥', label:'Crowd Signals',          color:'#f472b6', match: p=>p.type==='crowd' },
    { id:'humanitarian', icon:'🆘', label:'Humanitarian Crises',    color:'#fb923c', match: p=>p.type==='humanitarian' },
    { id:'iris',         icon:'🌐', label:'IRIS Geopolitical',      color:'#818cf8', match: p=>p.type==='iris' },
    { id:'ucdp',         icon:'☠',  label:'UCDP Conflict Events',  color:'#dc2626', match: p=>p.source==='UCDP' },
    { id:'sanctions',    icon:'🚫', label:'Sanctioned Entities',   color:'#7c3aed', match: p=>p.source==='OpenSanctions' },
    { id:'osmMilitary',  icon:'🏛',  label:'Military Bases (OSM)',  color:'#6b7280', match: p=>p.meta?._isBase },
    { id:'wikiConflicts',icon:'📖', label:'WikiData Conflicts',    color:'#ea580c', match: p=>p.type==='wikidata' },
    { id:'arms',         icon:'🔫', label:'Arms Transfer Signals', color:'#d97706', match: p=>p.source==='SIPRI/GDELT' },
  ]
  const CATS = mapMode === 'environment' ? ENV_CATS : INTEL_CATS

  const globeTo = (pt) => {
    if (!pt || !threeRef.current?.globe) return
    // CORRECT formula: to bring lng to face camera center (+z axis)
    // theta = (lng+180)*PI/180 is how the marker is placed
    // We need globe.rotation.y so that theta + rotation.y = PI/2 (center of view)
    // → rotation.y = PI/2 - theta = PI/2 - (lng+180)*PI/180
    const theta = (pt.lng + 180) * (Math.PI / 180)
    threeRef.current.globe.rotation.y = Math.PI / 2 - theta
    // Latitude: tilt globe so the marker's latitude is at eye level
    const phi = (90 - pt.lat) * (Math.PI / 180)
    const xTilt = -(phi - Math.PI / 2)
    // Clamp so globe doesn't flip over poles
    threeRef.current.globe.rotation.x = Math.max(-0.65, Math.min(0.65, xTilt))
    autoRotateRef.current = false
    setAutoRotate(false)
    // Store selected point for glow — pulse for 4 seconds then clear
    threeRef.current._navigatedTo = pt
    setTimeout(() => { if (threeRef.current) threeRef.current._navigatedTo = null }, 4000)
    // Force cameraZ state update so clustering re-evaluates at current zoom
    if (threeRef.current.camera) {
      setCameraZ(threeRef.current.camera.position.z)
    }
  }

  // Shodan InternetDB — free, no key, no auth
  const lookupShodan = async (vessel, key) => {
    if (shodanData[key] !== undefined || shodanLoading[key]) return
    setShodanLoading(l => ({ ...l, [key]: true }))
    try {
      // InternetDB accepts IP. For ships we use MMSI as identifier since
      // IPs aren't usually known; instead we query by vessel name via censys-like hint
      // Actually Shodan InternetDB only works on IPs — we show a direct Shodan search link
      // plus attempt to resolve known AIS transponder IP ranges for vessels
      const searchUrl = `https://www.shodan.io/search?query=${encodeURIComponent(vessel)}`
      // Try InternetDB with a known AIS gateway — won't usually resolve but shows the pattern
      const r = await fetch(`https://internetdb.shodan.io/1.1.1.1`, { signal: AbortSignal.timeout(5000) })
      // Use the response as a template — actual lookup needs real IP
      setShodanData(prev => ({
        ...prev,
        [key]: {
          _searchUrl: searchUrl,
          _note: 'Click to search Shodan for this vessel',
        }
      }))
    } catch {}
    setShodanLoading(l => ({ ...l, [key]: false }))
  }

  const getItemLabel = (pt) => {
    if (pt.type === 'aircraft') return pt.meta?.callsign || pt.icao24 || pt.name || 'Unknown Aircraft'
    if (pt.type === 'ship') return pt.meta?.name || (pt.name||'').replace('🚢 ','').split(' (')[0] || 'Unknown Vessel'
    if (pt.type === 'earthquake') {
      const mag = pt.meta?.mag?.toFixed(1)
      const place = (pt.name||'').replace(`M${mag} — `,'').slice(0,40)
      return `M${mag} ${place}`
    }
    return (pt.title || pt.name || '').replace(/^[🎯⚔️✈️🚢💎🔥🌋🌀🌊⚠️🛰⛈️🛸🚀📰]\s*/,'').slice(0, 50)
  }

  const getItemMeta = (pt) => {
    if (pt.type === 'aircraft' || pt.type === 'milaircraft') {
      const alt = pt.meta?.alt ? Math.round(pt.meta.alt / 304.8) + 'kft' : ''
      const spd = pt.meta?.spd ? Math.round(pt.meta.spd * 1.944) + 'kt' : (pt.meta?.speed ? Math.round(pt.meta.speed * 1.944) + 'kt' : '')
      const hdg = pt.meta?.heading != null ? pt.meta.heading + '°' : ''
      return [alt, spd, hdg].filter(Boolean).join(' ')
    }
    if (pt.type === 'ship' || pt.type === 'warship') return `${pt.meta?.speed != null ? pt.meta.speed+'kn' : ''} ${pt.meta?.shipType||''} ${pt.meta?.flag||''}`.trim()
    if (pt.type === 'earthquake') return `${pt.meta?.depth?.toFixed(0)||'?'}km deep${pt.meta?.tsunami?' ⚠TSUNAMI':''}`
    if (pt.type === 'hurricane') return `${pt.meta?.intensity||'?'}kt wind`
    if (pt.lat && pt.lng) return `${pt.lat.toFixed(1)}° ${pt.lng.toFixed(1)}°`
    return ''
  }

  return (
    <div style={{ position:'absolute', top:0, left:0, bottom:0, width:'224px', zIndex:20,
      borderRight:'1px solid var(--border)', background:'var(--void)',
      display:'flex', flexDirection:'column', overflow:'hidden', backdropFilter:'blur(4px)' }}>

      {/* Header */}
      <div style={{ padding:'6px 10px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <span className="mono" style={{ fontSize:'8px', color:'var(--accent)', letterSpacing:'0.1em' }}>SIGNAL CATEGORIES</span>
        <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{allPoints.length} signals</span>
      </div>

      {/* Category list */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {CATS.map(cat => {
          const items = allPoints.filter(cat.match)
          const isExpanded = !!expanded[cat.id]
          const searchQ = (searches[cat.id] || '').toLowerCase()
          const filteredItems = searchQ
            ? items.filter(p => (getItemLabel(p) + ' ' + getItemMeta(p)).toLowerCase().includes(searchQ))
            : items
          const isActive = cat.id === categoryFilter
          const sevColor = (pt) => pt.severity==='critical'?'#ef4444':pt.severity==='high'?'#f97316':pt.severity==='medium'?'#eab308':cat.color

          return (
            <div key={cat.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>

              {/* ── Category header ── */}
              <div
                onClick={() => {
                  const next = !isExpanded
                  setExpanded(e => ({ ...e, [cat.id]: next }))
                  setCategoryFilter(next ? cat.id : null)
                }}
                style={{ padding:'6px 8px 6px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px',
                  background: isActive ? `${cat.color}18` : 'transparent',
                  borderLeft: isActive ? `3px solid ${cat.color}` : '3px solid transparent',
                  transition:'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = `${cat.color}10`}
                onMouseLeave={e => e.currentTarget.style.background = isActive ? `${cat.color}18` : 'transparent'}
              >
                <span style={{ fontSize:'12px', lineHeight:1, flexShrink:0 }}>{cat.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'9px', fontWeight:600, color:'var(--t2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cat.label}</div>
                  <div className="mono" style={{ fontSize:'7px', color: items.length > 0 ? cat.color : 'var(--t4)' }}>{items.length} signals</div>
                </div>
                <span style={{ fontSize:'7px', color:'var(--t4)', flexShrink:0, display:'inline-block',
                  transition:'transform 0.15s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
              </div>

              {/* ── Expanded item list ── */}
              {isExpanded && (
                <div className="fade-in" style={{ background:'rgba(0,0,0,0.4)' }}>
                  {items.length === 0 ? (
                    <div style={{ padding:'7px 12px', fontSize:'8px', color:'var(--t4)' }}>
                      {(() => {
                    const LAYER_KEY_MAP = {
                      'ships':'ships','milaircraft':'milaircraft','warships':'warships',
                      'launches':'launches','copernicus':'copernicus','sigmets':'sigmets',
                      'hotspots':'hotspots','wikiEdits':'wikiEdits','preaction':'preaction',
                      'viirs':'viirs','bgp':'bgp','redditSignals':'redditSignals',
                    }
                    const layerKey = LAYER_KEY_MAP[cat.id] || cat.id
                    const isLayerOff = layerKey && layers[layerKey] === false
                    return isLayerOff
                      ? `Layer off — toggle "${cat.label}" in toolbar to enable`
                      : cat.note || `No data yet — source loading or no events in window`
                  })()}
                    </div>
                  ) : (
                    <>
                      {/* Search input */}
                      {items.length > 4 && (
                        <div style={{ padding:'4px 8px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                          <input
                            value={searches[cat.id] || ''}
                            onChange={e => setSearches(s => ({ ...s, [cat.id]: e.target.value }))}
                            placeholder={`Search ${items.length} items…`}
                            onClick={e => e.stopPropagation()}
                            className="inp"
                            style={{ fontSize:'8px', padding:'3px 7px', width:'100%' }}
                          />
                        </div>
                      )}
                      {/* Item rows */}
                      <div style={{ maxHeight:'240px', overflowY:'auto' }}>
                        {filteredItems.length === 0 && searchQ && (
                          <div style={{ padding:'6px 12px', fontSize:'8px', color:'var(--t4)' }}>No matches for "{searches[cat.id]}"</div>
                        )}
                        {filteredItems.slice(0, 150).map((pt, i) => {
                          const label = getItemLabel(pt)
                          const meta  = getItemMeta(pt)
                          const sc    = sevColor(pt)
                          const shipKey = pt.meta?.mmsi ? String(pt.meta.mmsi) : pt.meta?.name ? pt.meta.name : null
                          const sd    = shipKey ? shodanData[shipKey] : null
                          const sload = shipKey ? shodanLoading[shipKey] : false

                          return (
                            <div key={i}
                              style={{ padding:'4px 8px 4px 14px', borderBottom:'1px solid rgba(255,255,255,0.025)',
                                transition:'background 0.08s' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              {/* Main row — click to fly to + open detail */}
                              <div style={{ display:'flex', alignItems:'center', gap:'5px', cursor:'pointer' }}
                                onClick={e => { e.stopPropagation(); globeTo(pt); setSelected(pt); setExpandedCluster(null) }}>
                                <span style={{ width:'5px', height:'5px', borderRadius:'50%', background:sc,
                                  flexShrink:0, boxShadow:`0 0 4px ${sc}88` }}/>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:'8px', fontWeight:600, color:'var(--t1)',
                                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</div>
                                  {meta && <div className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{meta}</div>}
                                </div>
                                <span style={{ fontSize:'8px', color:'var(--accent)', flexShrink:0, opacity:0.7 }}>→</span>
                              </div>

                              {/* Shodan panel for ships */}
                              {pt.type === 'ship' && shipKey && (
                                <div style={{ paddingTop:'3px', paddingLeft:'10px' }}>
                                  {!sd && !sload && (
                                    <button
                                      onClick={e => { e.stopPropagation(); lookupShodan(shipKey, shipKey) }}
                                      style={{ fontSize:'7px', color:'#06b6d4', background:'none',
                                        border:'1px solid rgba(6,182,212,0.3)', borderRadius:'2px',
                                        padding:'1px 5px', cursor:'pointer', fontFamily:'JetBrains Mono' }}>
                                      🔍 Shodan lookup
                                    </button>
                                  )}
                                  {sload && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>querying…</span>}
                                  {sd && (
                                    <div style={{ padding:'3px 6px', background:'rgba(6,182,212,0.07)',
                                      border:'1px solid rgba(6,182,212,0.25)', borderRadius:'2px', marginTop:'2px' }}>
                                      <div className="mono" style={{ fontSize:'7px', color:'#06b6d4', marginBottom:'2px', letterSpacing:'0.08em' }}>
                                        SHODAN INTERNETDB
                                      </div>
                                      {sd._note ? (
                                        <>
                                          <div style={{ fontSize:'7px', color:'var(--t3)', marginBottom:'2px' }}>{sd._note}</div>
                                          <a href={sd._searchUrl} target="_blank" rel="noopener noreferrer"
                                            onClick={e=>e.stopPropagation()}
                                            style={{ fontSize:'7px', color:'#06b6d4', textDecoration:'underline' }}>
                                            ↗ Search Shodan: {shipKey}
                                          </a>
                                        </>
                                      ) : (
                                        <>
                                          {sd.ports?.length > 0 && <div className="mono" style={{ fontSize:'7px', color:'var(--t2)' }}>Ports: {sd.ports.slice(0,8).join(', ')}</div>}
                                          {sd.vulns?.length > 0 && <div className="mono" style={{ fontSize:'7px', color:'#ef4444' }}>⚠ CVEs: {sd.vulns.slice(0,4).join(', ')}</div>}
                                          {sd.tags?.length > 0 && <div className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>Tags: {sd.tags.slice(0,5).join(', ')}</div>}
                                          {sd.hostnames?.length > 0 && <div className="mono" style={{ fontSize:'7px', color:'var(--t3)' }}>Host: {sd.hostnames[0]}</div>}
                                          {sd.cpes?.length > 0 && <div className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>CPE: {sd.cpes[0]}</div>}
                                          {(!sd.ports?.length && !sd.vulns?.length) && <div className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>No exposed services found</div>}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {filteredItems.length > 150 && (
                          <div style={{ padding:'4px 12px', fontSize:'7px', color:'var(--t4)', fontFamily:'JetBrains Mono' }}>
                            +{filteredItems.length - 150} more · use search to filter
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Draw country borders from TopoJSON ──────────────────────────────────────
function drawCountryBorders(THREE, topo) {
  try {
    const arcs = topo.arcs
    const scale = topo.transform?.scale || [1, 1]
    const trans = topo.transform?.translate || [0, 0]

    const decoded = arcs.map(arc => {
      let x = 0, y = 0
      return arc.map(([dx, dy]) => {
        x += dx; y += dy
        return [x * scale[0] + trans[0], y * scale[1] + trans[1]]
      })
    })

    function getArc(i) { return i < 0 ? decoded[~i].slice().reverse() : decoded[i] }

    const geo = topo.objects.countries || Object.values(topo.objects)[0]
    if (!geo?.geometries) return null

    const borderMat = new THREE.LineBasicMaterial({ color: 0x2a6080, transparent: true, opacity: 0.7 })
    const group = new THREE.Group()

    geo.geometries.forEach(geom => {
      const rings = geom.type === 'Polygon' ? geom.arcs
        : geom.type === 'MultiPolygon' ? geom.arcs.flat() : []
      rings.forEach(ring => {
        const coords = ring.flatMap(getArc)
        if (coords.length < 2) return
        const pts = coords.map(([lon, lat]) => {
          const v = latLngToVec3(lat, lon, 1.003)
          return new THREE.Vector3(v.x, v.y, v.z)
        })
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), borderMat))
      })
    })
    return group
  } catch { return null }
}

// ── Region → approximate center coordinates ─────────────────────────────────
// Country + region coordinates (ISO 3166 + major cities)
const GEO_MAP = {
  // Conflict zones - precise
  'Ukraine':       [49.0,  32.0], 'Russia':        [61.0,  85.0],
  'Gaza':          [31.4,  34.4], 'Israel':        [31.0,  34.8],
  'Lebanon':       [33.9,  35.5], 'Syria':         [35.0,  38.0],
  'Iran':          [32.0,  53.0], 'Iraq':          [33.0,  44.0],
  'Yemen':         [15.5,  48.0], 'Saudi Arabia':  [24.0,  45.0],
  'Taiwan':        [23.5, 121.0], 'China':         [35.0, 105.0],
  'North Korea':   [40.0, 127.0], 'South Korea':   [36.5, 127.8],
  'Pakistan':      [30.0,  70.0], 'India':         [20.0,  77.0],
  'Afghanistan':   [33.0,  65.0], 'Kashmir':       [34.0,  76.0],
  'Myanmar':       [17.0,  96.0], 'Sudan':         [15.0,  32.0],
  'Ethiopia':      [ 9.0,  39.0], 'Somalia':       [ 5.0,  46.0],
  'Mali':          [17.0,  -4.0], 'Niger':         [17.0,   8.0],
  'Burkina Faso':  [12.0,  -2.0], 'Nigeria':       [ 9.0,   8.0],
  'DRC':           [-3.0,  24.0], 'Congo':         [-1.0,  15.0],
  'Libya':         [27.0,  17.0], 'Tunisia':       [34.0,   9.0],
  'Haiti':         [19.0, -72.0], 'Venezuela':     [ 8.0, -66.0],
  // Regional powers
  'United States': [38.0, -97.0], 'USA':           [38.0, -97.0],
  'UK':            [54.0,  -2.0], 'Britain':       [54.0,  -2.0],
  'France':        [46.0,   2.0], 'Germany':       [51.0,  10.0],
  'Turkey':        [39.0,  35.0], 'Egypt':         [26.0,  30.0],
  'Japan':         [36.0, 138.0], 'South China Sea':[12.0, 114.0],
  'Philippines':   [13.0, 122.0], 'Vietnam':       [16.0, 107.0],
  'Indonesia':     [-5.0, 120.0], 'Thailand':      [13.0, 101.0],
  'Malaysia':      [ 4.0, 109.0], 'Singapore':     [ 1.3, 103.8],
  'Australia':     [-25.0,133.0], 'New Zealand':   [-41.0,174.0],
  'Brazil':        [-10.0, -51.0],'Argentina':     [-34.0, -64.0],
  'Colombia':      [  4.0, -72.0],'Mexico':        [ 23.0, -102.0],
  'Canada':        [ 56.0, -96.0],'Poland':        [ 52.0,  20.0],
  'Finland':       [ 64.0,  26.0],'Sweden':        [ 60.0,  15.0],
  'Norway':        [ 65.0,  14.0],'NATO':          [ 50.0,  10.0],
  'Qatar':         [ 25.0,  51.0],'UAE':           [ 24.0,  54.0],
  'Kuwait':        [ 29.0,  47.0],'Bahrain':       [ 26.0,  50.5],
  'Oman':          [ 21.0,  57.0],'Jordan':        [ 31.0,  36.0],
  'Morocco':       [ 32.0,  -6.0],'Algeria':       [ 28.0,   2.0],
  'Kenya':         [  0.0,  38.0],'Ghana':          [  8.0,  -2.0],
  'Zimbabwe':      [-19.0,  30.0],'Mozambique':    [-15.0,  35.0],
  'Tanzania':      [ -6.0,  35.0],'Uganda':        [  1.0,  32.0],
  'Rwanda':        [ -2.0,  30.0],'Angola':        [-12.0,  18.0],
  'Kazakhstan':    [ 48.0,  68.0],'Uzbekistan':    [ 41.0,  64.0],
  'Georgia':       [ 42.0,  44.0],'Armenia':       [ 40.0,  45.0],
  'Azerbaijan':    [ 40.0,  47.0],'Serbia':        [ 44.0,  21.0],
  'Kosovo':        [ 42.5,  20.9],'Moldova':       [ 47.0,  29.0],
  'Belarus':       [ 53.0,  28.0],'Hungary':       [ 47.0,  19.0],
  'Romania':       [ 46.0,  25.0],'Bulgaria':      [ 43.0,  25.0],
  'Greece':        [ 39.0,  22.0],'Italy':         [ 42.0,  12.0],
  'Spain':         [ 40.0,  -4.0],'Portugal':      [ 39.5,  -8.0],
  'Netherlands':   [ 52.0,   5.0],'Belgium':       [ 50.8,   4.4],
  'Switzerland':   [ 47.0,   8.0],'Austria':       [ 47.5,  14.0],
  'Czech Republic':[ 50.0,  15.5],'Slovakia':      [ 48.7,  19.0],
  'Croatia':       [ 45.0,  16.0],'Slovenia':      [ 46.0,  15.0],
  'Baltic':        [ 57.0,  24.0],'Estonia':       [ 59.0,  26.0],
  'Latvia':        [ 57.0,  25.0],'Lithuania':     [ 56.0,  24.0],
  'Baltic Sea':    [ 58.0,  20.0],'Black Sea':     [ 43.0,  34.0],
  'Red Sea':       [ 20.0,  38.0],'Persian Gulf':  [ 26.0,  52.0],
  'Arctic':        [ 78.0,  15.0],'Antarctica':    [-80.0,   0.0],
  // Broad regions as fallback
  'Europe':        [ 52.0,  15.0],'North America': [ 40.0, -98.0],
  'Middle East':   [ 30.0,  45.0],'East Asia':     [ 35.0, 115.0],
  'South Asia':    [ 25.0,  77.0],'Southeast Asia':[ 10.0, 107.0],
  'Africa':        [  5.0,  22.0],'Latin America': [ -5.0, -58.0],
  'Global':        null,
}

function regionToLatLng(region) {
  return GEO_MAP[region] || null
}

// Extract precise country from article text for better geo placement
function extractCountryCoords(article) {
  const text = ((article.title || '') + ' ' + (article.summary || '')).toLowerCase()
  const checks = [
    [/gazal|gaza strip|rafah|khan younis/,    [31.4,  34.4]],
    [/ukraine|kyiv|kharkiv|zaporizhzhia|bakhmut|kherson/, [49.0, 32.0]],
    [/moscow|kremlin|st petersburg|siberia/,   [55.7,  37.6]],
    [/taiwan strait|taipei|taiwan/,            [23.5, 121.0]],
    [/north korea|pyongyang|dprk/,             [39.0, 125.7]],
    [/jeddah|riyadh|saudi/,                    [24.6,  46.7]],
    [/kabul|afghanistan/,                      [34.5,  69.2]],
    [/karachi|islamabad|lahore|pakistan/,       [30.3,  69.0]],
    [/mumbai|delhi|india/,                   [20.6,  78.9]],
    [/khartoum|sudan/,                         [15.5,  32.5]],
    [/kampala|addis ababa|mogadishu|nairobi/,   [ 1.3,  36.8]],
    [/damascus|aleppo|syria/,                  [34.8,  38.9]],
    [/beirut|lebanon/,                         [33.9,  35.5]],
    [/baghdad|mosul|iraq/,                     [33.3,  44.4]],
    [/sanaa|aden|houthi|yemen/,                [15.4,  44.2]],
    [/tehran|iran/,                          [35.7,  51.4]],
    [/bamako|mali/,                          [12.6,  -8.0]],
    [/ouagadougou|burkina/,                    [12.4,  -1.5]],
    [/kampala|kinshasa|drc|congo/,             [-4.3,  15.3]],
    [/myanmar|yangon|naypyidaw/,               [19.7,  96.1]],
    [/venezuela|caracas/,                      [10.5, -66.9]],
    [/paris|france/,                         [48.9,   2.3]],
    [/berlin|germany/,                       [52.5,  13.4]],
    [/london|england|britain|uk/,            [51.5,  -0.1]],
    [/washington|pentagon|white house/,        [38.9, -77.0]],
    [/beijing|china/,                        [39.9, 116.4]],
    [/tokyo|japan/,                          [35.7, 139.7]],
    [/seoul|south korea/,                      [37.6, 127.0]],
    [/ankara|turkey|istanbul/,               [39.9,  32.9]],
    [/cairo|egypt/,                          [30.0,  31.2]],
    [/pretoria|johannesburg|south africa/,     [-26.2,  28.0]],
  ]
  for (const [rx, coords] of checks) {
    if (rx.test(text)) return coords
  }
  return null
}
