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
        newsapi:     '',
        gnews:       '',
        alphavantage:'',
        exchangerate:'',
        twelvedata:  '',
        newsdata:    '',
        fred:        '',
        acled_key:   '',
        acled_email: '',
        acled_pass:  '',
        firms:       '',
        // Intelligence credentials
        shodan:          '',
        intelx_key:      '',
        intelx_url:      'https://free.intelx.io',
        censys_id:       '',
        censys_secret:   '',
        aisstream:       '',
        fec:             '',
        spacetrack_user: '',
        spacetrack_pass: '',
        wigle:           '',
        opencorp:        '',
        ipinfo:          '',
        otx:             '',
        greynoise:       '',
        reddit_id:       '',
        reddit_secret:   '',
        cf_token:        '',
        cf_global_key:   '',
        ch_key:          '',
        ch_secret:       '',
        virustotal_key:  '',
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
