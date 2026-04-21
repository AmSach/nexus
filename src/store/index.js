import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useStore = create(
  persist(
    (set, get) => ({
      // Nav
      tab: 'feed',
      setTab: t => set({ tab: t }),

      // Sidebar
      collapsed: false,
      toggleCollapsed: () => set(s => ({ collapsed: !s.collapsed })),

      // API keys — these are FALLBACK only. Prefer Vercel env vars:
      // VITE_GROQ_KEY, VITE_NEWSAPI_KEY, VITE_GNEWS_KEY,
      // VITE_ALPHAVANTAGE_KEY, VITE_EXCHANGERATE_KEY, VITE_TWELVEDATA_KEY
      keys: {
        groq:        '',
        newsapi:     '8671ede048524ab791a6bd906a066c12',
        gnews:       '20fbaf5fa721a094eeb5f865ab795912',
        alphavantage:'GX7D3YNMNJND5ZF3',
        exchangerate:'286c02ea81379f2b4d151e8a',
        twelvedata:  '',
        newsdata:    'pub_6911fad079e3452c8bf4b94b99e5df03',
        fred:        '7364a37ecf90502f2a642eb79a04c75f',
        acled_key:   '',
        acled_email: '',
        acled_pass:  '',
        firms:       '08be3187f8c1526e0fd30249ee2c3374',
        // Intelligence credentials
        shodan:          'CwHKC0EtdYHtGejGE5CX9o0R4pMLe2LZ',
        intelx_key:      '6a3d39ff-cafe-4b9d-980a-396d31e2b784',
        intelx_url:      'https://free.intelx.io',
        censys_id:       'censys_Dh3Lx7Mm',
        censys_secret:   '_9pwotibu3GTV1REWWYCkqomT',
        aisstream:       '7c4731ac6b055b6017439baf319e9b366f6af43c',
        fec:             'ufw4XZ0AeWXuLxW4VRONGLDrnUATTlunIi308iZj',
        spacetrack_user: '',
        spacetrack_pass: '',
        wigle:           '',
        opencorp:        '',
        ipinfo:          '',
        otx:             'fb9962a963a512fcfb63be7053b1f66ab3de6818d8bd2d5330510d0c1edea4a0',
        greynoise:       '',
        reddit_id:       '',
        reddit_secret:   '',
        cf_token:        'o-GzHIAJojNPxNwvVo2MPfTtWU-E-T910U408Nmw',
        cf_global_key:   '3bb3ddb577fab92684b44bf2a81baf5fab237',
        ch_key:          'b0f7d629-b392-4e9b-9a4f-89fa05732829',
        ch_secret:       'r0OAup7tbZg71pwJq1YbCOmIJC0GTSFilDHDTfTgIWI',
        virustotal_key:  '2004a33892a12a3c47e8eeb8992d9e3619c69ed36bc855aec11004aca3aba397',
        urlscan_key:     '',
        abuseipdb_key:   '',
        sectrails_key:   '',
        hibp_key:        '',
        hunter_key:      '',
        dehashed_key:    '',
        wigle_key:       '',
      },
      setKey: (k, v) => set(s => ({ keys: { ...s.keys, [k]: v } })),

      // Saved articles
      saved: [],
      save: a => set(s => s.saved.find(x => x.id === a.id) ? s : { saved: [a, ...s.saved].slice(0, 500) }),
      unsave: id => set(s => ({ saved: s.saved.filter(a => a.id !== id) })),
      isSaved: id => get().saved.some(a => a.id === id),

      // Situations
      situations: [],
      addSituation: name => {
        const id = `sit-${Date.now()}`
        set(s => ({ situations: [...s.situations, { id, name, created: Date.now(), notes: '' }] }))
        return id
      },
      removeSituation: id => set(s => ({ situations: s.situations.filter(x => x.id !== id) })),
      updateSituationNotes: (id, notes) => set(s => ({
        situations: s.situations.map(x => x.id === id ? { ...x, notes } : x)
      })),
      activeSituation: null,
      setActiveSituation: id => set({ activeSituation: id }),

      // Watchlist
      watchlist: [],
      addWatch: t => set(s => ({ watchlist: [...new Set([...s.watchlist, t.trim()])] })),
      removeWatch: t => set(s => ({ watchlist: s.watchlist.filter(x => x !== t) })),

      // Alerts
      alerts: [],
      pushAlert: a => set(s => ({ alerts: [{ ...a, id: Date.now() }, ...s.alerts].slice(0, 50) })),
      clearAlerts: () => set({ alerts: [] }),

      // Intel boards
      boards: [{ id: 'default', name: 'Board 1', nodes: [], edges: [], notes: '' }],
      activeBoard: 'default',
      setActiveBoard: id => set({ activeBoard: id }),
      addBoard: name => {
        const id = `b-${Date.now()}`
        set(s => ({ boards: [...s.boards, { id, name, nodes: [], edges: [], notes: '' }], activeBoard: id }))
      },
      deleteBoard: id => set(s => ({
        boards: s.boards.length > 1 ? s.boards.filter(b => b.id !== id) : s.boards,
        activeBoard: s.activeBoard === id ? s.boards.find(b => b.id !== id)?.id || 'default' : s.activeBoard,
      })),
      _board: () => {
        const s = get()
        return s.boards.find(b => b.id === s.activeBoard) || s.boards[0]
      },
      _updBoard: fn => set(s => {
        const id = s.activeBoard
        return { boards: s.boards.map(b => b.id === id ? fn(b) : b) }
      }),
      addNode: node => get()._updBoard(b => ({
        ...b, nodes: [...b.nodes, { ...node, id: `n${Date.now()}${Math.random().toString(36).slice(2,5)}` }]
      })),
      updateNode: (nid, upd) => get()._updBoard(b => ({
        ...b, nodes: b.nodes.map(n => n.id === nid ? { ...n, ...upd } : n)
      })),
      deleteNode: nid => get()._updBoard(b => ({
        ...b,
        nodes: b.nodes.filter(n => n.id !== nid),
        edges: b.edges.filter(e => e.src !== nid && e.tgt !== nid),
      })),
      addEdge: edge => get()._updBoard(b => ({
        ...b, edges: [...b.edges, { ...edge, id: `e${Date.now()}` }]
      })),
      deleteEdge: eid => get()._updBoard(b => ({ ...b, edges: b.edges.filter(e => e.id !== eid) })),
      clearBoard: () => get()._updBoard(b => ({ ...b, nodes: [], edges: [] })),
      setBoardNotes: notes => get()._updBoard(b => ({ ...b, notes })),

      entityFocus: null,
      setEntityFocus: e => set({ entityFocus: e }),

      // Globe state sharing — encode layers + camera into URL hash
      encodeGlobeState: (layers, cameraZ, globeRotation) => {
        const state = { l: layers, z: Math.round(cameraZ * 10) / 10, r: globeRotation }
        const encoded = btoa(JSON.stringify(state)).replace(/=/g, '')
        return `${window.location.origin}${window.location.pathname}#globe=${encoded}`
      },

      filters: { category: 'all', severity: 'all', region: 'all', search: '' },
      setFilter: (k, v) => set(s => ({ filters: { ...s.filters, [k]: v } })),
      clearFilters: () => set({ filters: { category: 'all', severity: 'all', region: 'all', search: '' } }),
    }),
    {
      name: 'nexus-v5',
      partialize: s => ({
        saved: s.saved, situations: s.situations, watchlist: s.watchlist,
        boards: s.boards, activeBoard: s.activeBoard,
        keys: s.keys, // only user-entered keys, env vars never stored
        alerts: s.alerts.slice(0, 20),
      }),
    }
  )
)
