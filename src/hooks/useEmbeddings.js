/**
 * useEmbeddings — Text → Vector → Cluster → Model Input
 *
 * PIPELINE:
 *   Raw text (article title / signal name)
 *   → TF-IDF sparse vector (bag of weighted terms)
 *   → SVD projection → dense 32-dim embedding
 *   → K-Means clustering (k=12 topic clusters)
 *   → Cluster centroid distances → 12-dim feature vector
 *   → Fed into VOX world vector + ACPL state
 *
 * WHY NOT USE A PRE-TRAINED MODEL:
 *   We're in a browser with no Python, no ONNX runtime loaded.
 *   We need something that trains incrementally on the actual live data.
 *   TF-IDF + SVD + K-Means is interpretable, fast (~5ms per batch), and
 *   produces genuine semantic clusters from the domain vocabulary.
 *
 * SVD (Singular Value Decomposition):
 *   Approximates X ≈ U·Σ·Vᵀ via power iteration.
 *   We keep the top 32 singular vectors (= 32-dim latent space).
 *   Each document projected: e = Vᵀ·tfidf(doc) → 32-dim embedding.
 *
 * K-MEANS:
 *   12 clusters matching VOX's geopolitical taxonomy:
 *   Ukraine/Russia, Middle East, China/Taiwan, Nuclear, Cyber,
 *   Economics/Sanctions, Elections, Humanitarian, Energy, Finance, Health, Other
 *   Initialized with domain seeds, refined via Lloyd's algorithm.
 *
 * OUTPUT (ClusterFeatures):
 *   [dist_to_cluster_0, ..., dist_to_cluster_11] — 12-dim
 *   Each value: softmax(−dist) → probability this doc belongs to cluster k
 *   These replace the regex heuristics in buildWorldVector and articleRelevance.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

const VOCAB_SIZE    = 512   // top-N terms kept in vocabulary
const EMBED_DIM     = 32    // SVD latent dimensions
const K_CLUSTERS    = 12    // topic clusters
const KMEANS_ITERS  = 15
const CACHE_KEY     = 'nexus-embeddings-v1'

// ── Stopwords ─────────────────────────────────────────────────────────────────
const STOP = new Set(['the','a','an','and','or','but','in','on','at','to','for',
  'of','with','by','from','is','are','was','were','has','have','had','be','been',
  'will','would','could','should','may','might','that','this','these','those',
  'it','its','as','if','than','then','when','where','who','which','what','how',
  'not','no','nor','so','yet','both','either','neither','just','also','more',
  'most','other','some','such','only','own','same','than','too','very','can',
  'said','says','say','new','one','two','report','reports','reported','official',
  'officials','government','country','countries','year','years','day','days'])

// ── Text preprocessing ─────────────────────────────────────────────────────────
function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/\s+/)
    .map(t => t.replace(/^-+|-+$/g, ''))
    .filter(t => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t))
}

// ── TF-IDF ────────────────────────────────────────────────────────────────────
class TFIDF {
  constructor() {
    this.vocab  = new Map()   // term → index
    this.idf    = new Float32Array(VOCAB_SIZE)
    this.df     = new Uint16Array(VOCAB_SIZE)   // doc frequency per term
    this.docCount = 0
    this.dirty  = false
  }

  // Add document, returns sparse TF vector {termIdx: tf}
  addDoc(tokens) {
    this.docCount++
    const tf = new Map()
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1)
    }
    // Update vocab + DF
    for (const [term, count] of tf) {
      if (!this.vocab.has(term)) {
        if (this.vocab.size >= VOCAB_SIZE) continue  // vocab full
        this.vocab.set(term, this.vocab.size)
      }
      const idx = this.vocab.get(term)
      if (idx < VOCAB_SIZE) this.df[idx]++
    }
    this.dirty = true
    return tf
  }

  // Recompute IDF from current DF
  recomputeIDF() {
    const N = Math.max(1, this.docCount)
    for (let i = 0; i < VOCAB_SIZE; i++) {
      this.idf[i] = this.df[i] > 0 ? Math.log((N + 1) / (this.df[i] + 1)) + 1 : 0
    }
    this.dirty = false
  }

  // Vectorize text → dense Float32Array[VOCAB_SIZE] (TF-IDF)
  vectorize(tokens) {
    if (this.dirty) this.recomputeIDF()
    const vec = new Float32Array(VOCAB_SIZE)
    const tf = new Map()
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1)
    let norm = 0
    for (const [term, count] of tf) {
      const idx = this.vocab.get(term)
      if (idx === undefined || idx >= VOCAB_SIZE) continue
      const tfidf = (count / Math.max(1, tokens.length)) * this.idf[idx]
      vec[idx] = tfidf
      norm += tfidf * tfidf
    }
    // L2 normalize
    norm = Math.sqrt(norm)
    if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm
    return vec
  }

  serialize() {
    return {
      vocab:    [...this.vocab.entries()],
      idf:      Array.from(this.idf),
      df:       Array.from(this.df),
      docCount: this.docCount,
    }
  }

  static deserialize(data) {
    const t = new TFIDF()
    t.vocab    = new Map(data.vocab)
    t.idf      = new Float32Array(data.idf)
    t.df       = new Uint16Array(data.df)
    t.docCount = data.docCount
    return t
  }
}

// ── SVD via Randomized Power Iteration ────────────────────────────────────────
// Approximates top-k singular vectors of matrix X (n_docs × VOCAB_SIZE)
// Returns V: VOCAB_SIZE × EMBED_DIM  (right singular vectors = projection matrix)
function randomizedSVD(X, k = EMBED_DIM, nIter = 4) {
  const n = X.length       // n documents
  const d = VOCAB_SIZE     // vocab size

  // Random Gaussian matrix Ω: d × k
  const omega = Array.from({ length: d }, () =>
    Array.from({ length: k }, () => (Math.random() * 2 - 1) / Math.sqrt(k))
  )

  // Y = X · Ω  (n × k)
  let Y = X.map(row => {
    const y = new Array(k).fill(0)
    for (let j = 0; j < k; j++)
      for (let i = 0; i < d; i++)
        y[j] += row[i] * omega[i][j]
    return y
  })

  // Power iteration: Y = X · Xᵀ · Y  (improves approximation)
  for (let iter = 0; iter < nIter; iter++) {
    // Z = Xᵀ · Y  (d × k)
    const Z = Array.from({ length: d }, () => new Array(k).fill(0))
    for (let i = 0; i < n; i++)
      for (let j = 0; j < k; j++)
        for (let di = 0; di < d; di++)
          Z[di][j] += X[i][di] * Y[i][j]
    // Y = X · Z  (n × k)
    Y = X.map(row => {
      const y = new Array(k).fill(0)
      for (let j = 0; j < k; j++)
        for (let di = 0; di < d; di++)
          y[j] += row[di] * Z[di][j]
      return y
    })
    // Orthonormalize Y (QR via Gram-Schmidt)
    for (let j = 0; j < k; j++) {
      for (let prev = 0; prev < j; prev++) {
        const dot = Y.reduce((s, r) => s + r[j] * r[prev], 0)
        Y.forEach(r => { r[j] -= dot * r[prev] })
      }
      const norm = Math.sqrt(Y.reduce((s, r) => s + r[j] * r[j], 0))
      if (norm > 1e-10) Y.forEach(r => { r[j] /= norm })
    }
  }

  // V = Xᵀ · Y  (d × k) — right singular vectors (projection matrix)
  const V = Array.from({ length: d }, () => new Array(k).fill(0))
  for (let i = 0; i < n; i++)
    for (let j = 0; j < k; j++)
      for (let di = 0; di < d; di++)
        V[di][j] += X[i][di] * Y[i][j]

  // Normalize columns of V
  for (let j = 0; j < k; j++) {
    const norm = Math.sqrt(V.reduce((s, r) => s + r[j] * r[j], 0))
    if (norm > 1e-10) V.forEach(r => { r[j] /= norm })
  }

  return V  // VOCAB_SIZE × EMBED_DIM
}

// Project TF-IDF vector through V → EMBED_DIM embedding
function project(tfidfVec, V) {
  const emb = new Float32Array(EMBED_DIM)
  for (let j = 0; j < EMBED_DIM; j++)
    for (let i = 0; i < VOCAB_SIZE; i++)
      emb[j] += tfidfVec[i] * V[i][j]
  // L2 normalize
  let norm = 0
  for (let j = 0; j < EMBED_DIM; j++) norm += emb[j] * emb[j]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let j = 0; j < EMBED_DIM; j++) emb[j] /= norm
  return emb
}

// ── K-Means ────────────────────────────────────────────────────────────────────
// Domain-seeded initial centroids matching VOX's geopolitical taxonomy
const CLUSTER_SEEDS = [
  'ukraine russia war offensive missile kyiv donbas',         // 0: Ukraine/Russia
  'israel gaza hamas attack strike rafah west bank',          // 1: Middle East
  'china taiwan strait beijing pla military',                 // 2: China/Taiwan
  'nuclear iran dprk north korea enrichment warhead',         // 3: Nuclear
  'cyber hack ransomware malware vulnerability attack',        // 4: Cyber
  'sanction embargo economy gdp inflation recession',          // 5: Economics
  'election vote ballot president prime minister parliament',  // 6: Elections
  'humanitarian aid crisis refugee displaced famine',          // 7: Humanitarian
  'oil energy crude pipeline supply opec brent',              // 8: Energy
  'fed rate interest bitcoin crypto market stock',            // 9: Finance
  'disease outbreak pandemic epidemic health virus',          // 10: Health
  'ceasefire peace deal negotiation accord diplomat',         // 11: Diplomacy
]

function euclidean(a, b) {
  let d = 0
  for (let i = 0; i < a.length; i++) d += (a[i] - b[i]) ** 2
  return Math.sqrt(d)
}

function kMeans(embeddings, k, initialCentroids) {
  let centroids = initialCentroids.map(c => c.slice())
  let assignments = new Int32Array(embeddings.length)
  let changed = true

  for (let iter = 0; iter < KMEANS_ITERS && changed; iter++) {
    changed = false
    // Assignment step
    for (let i = 0; i < embeddings.length; i++) {
      let best = 0, bestD = Infinity
      for (let j = 0; j < k; j++) {
        const d = euclidean(embeddings[i], centroids[j])
        if (d < bestD) { bestD = d; best = j }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true }
    }
    // Update step — new centroid = mean of assigned embeddings
    const sums = Array.from({ length: k }, () => new Float32Array(EMBED_DIM))
    const counts = new Int32Array(k)
    for (let i = 0; i < embeddings.length; i++) {
      const c = assignments[i]
      counts[c]++
      for (let j = 0; j < EMBED_DIM; j++) sums[c][j] += embeddings[i][j]
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let j = 0; j < EMBED_DIM; j++) centroids[c][j] = sums[c][j] / counts[c]
      }
    }
  }
  return { centroids, assignments }
}

// Softmax of negative distances → cluster membership probability vector
function clusterFeatures(embedding, centroids) {
  const dists = centroids.map(c => euclidean(embedding, c))
  const neg   = dists.map(d => -d / 0.5)  // temperature 0.5
  const maxN  = Math.max(...neg)
  const exps  = neg.map(v => Math.exp(v - maxN))
  const sum   = exps.reduce((a, b) => a + b, 0)
  return new Float32Array(exps.map(v => v / sum))  // K_CLUSTERS dim
}

// ── The Cluster Labels (for VOX world vector mapping) ────────────────────────
export const CLUSTER_LABELS = [
  'ukraine_russia', 'middle_east', 'china_taiwan', 'nuclear',
  'cyber',          'economics',   'elections',    'humanitarian',
  'energy',         'finance',     'health',       'diplomacy',
]

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useEmbeddings() {
  const tfidfRef     = useRef(null)
  const vMatRef      = useRef(null)   // SVD projection matrix
  const centroidsRef = useRef(null)   // K-Means centroids
  const cacheRef     = useRef({})     // text → ClusterFeatures (avoid recomputing)
  const [ready,    setReady]    = useState(false)
  const [docCount, setDocCount] = useState(0)
  const trainedTexts = useRef(new Set())

  // Init or restore from localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
      if (saved?.tfidf && saved?.V && saved?.centroids) {
        tfidfRef.current     = TFIDF.deserialize(saved.tfidf)
        vMatRef.current      = saved.V
        centroidsRef.current = saved.centroids.map(c => new Float32Array(c))
        setDocCount(saved.tfidf.docCount)
        setReady(true)
      } else {
        tfidfRef.current = new TFIDF()
      }
    } catch {
      tfidfRef.current = new TFIDF()
    }
  }, [])

  // ── Train on a batch of texts ──────────────────────────────────────────────
  // Call this whenever new articles/signals arrive.
  // Incremental: only trains on genuinely new texts.
  const train = useCallback((texts) => {
    if (!tfidfRef.current) tfidfRef.current = new TFIDF()
    const tfidf = tfidfRef.current

    const newTexts = texts.filter(t => t && !trainedTexts.current.has(t))
    if (newTexts.length === 0) return

    // Add all new docs to TF-IDF
    const allTokens = newTexts.map(t => {
      const tokens = tokenize(t)
      tfidf.addDoc(tokens)
      trainedTexts.current.add(t)
      return tokens
    })

    const N = tfidf.docCount
    if (N < 20) return  // need minimum docs to train SVD meaningfully

    // Get all trained texts to build full matrix for SVD
    const allTrainedTexts = [...trainedTexts.current]
    const X = allTrainedTexts.map(t => tfidf.vectorize(tokenize(t)))

    // Recompute SVD projection matrix
    vMatRef.current = randomizedSVD(X, EMBED_DIM)

    // Project all docs to embedding space
    const embeddings = X.map(x => project(x, vMatRef.current))

    // Seed centroids from domain keywords
    const seedCentroids = CLUSTER_SEEDS.map(seed => {
      const tokens = tokenize(seed)
      tfidf.addDoc(tokens)  // ensure seed terms in vocab
      const vec = tfidf.vectorize(tokens)
      return project(vec, vMatRef.current)
    })

    // Run K-Means
    const { centroids } = kMeans(embeddings, K_CLUSTERS, seedCentroids)
    centroidsRef.current = centroids

    // Clear embedding cache (vocab/projection changed)
    cacheRef.current = {}

    setDocCount(N)
    setReady(true)

    // Persist (async, non-blocking)
    setTimeout(() => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          tfidf:     tfidf.serialize(),
          V:         vMatRef.current,
          centroids: centroids.map(c => Array.from(c)),
        }))
      } catch {}
    }, 0)
  }, [])

  // ── Embed a single text → 32-dim embedding ────────────────────────────────
  const embed = useCallback((text) => {
    if (!ready || !vMatRef.current || !tfidfRef.current) return null
    if (cacheRef.current[text]) return cacheRef.current[text]
    const tokens = tokenize(text)
    if (tokens.length === 0) return null
    const tfidfVec = tfidfRef.current.vectorize(tokens)
    const emb = project(tfidfVec, vMatRef.current)
    cacheRef.current[text] = emb
    return emb
  }, [ready])

  // ── Get cluster features for a text → 12-dim probability vector ───────────
  const clusterize = useCallback((text) => {
    if (!ready || !centroidsRef.current) return null
    const emb = embed(text)
    if (!emb) return null
    return clusterFeatures(emb, centroidsRef.current)
  }, [ready, embed])

  // ── Semantic similarity between two texts (cosine) ────────────────────────
  const similarity = useCallback((textA, textB) => {
    const a = embed(textA), b = embed(textB)
    if (!a || !b) return 0
    let dot = 0
    for (let i = 0; i < EMBED_DIM; i++) dot += a[i] * b[i]
    return Math.max(0, Math.min(1, (dot + 1) / 2))  // rescale [-1,1] → [0,1]
  }, [embed])

  // ── Find top-k most similar texts from a corpus ───────────────────────────
  const topK = useCallback((query, corpus, k = 5) => {
    const qEmb = embed(query)
    if (!qEmb) return corpus.slice(0, k)
    return corpus
      .map(item => {
        const text = typeof item === 'string' ? item : (item.title || item.name || '')
        const emb  = embed(text)
        if (!emb) return { item, score: 0 }
        let dot = 0
        for (let i = 0; i < EMBED_DIM; i++) dot += qEmb[i] * emb[i]
        return { item, score: (dot + 1) / 2 }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(x => x.item)
  }, [embed])

  // ── Cluster articles → topic groups ───────────────────────────────────────
  const clusterArticles = useCallback((articles) => {
    if (!ready || !centroidsRef.current || !articles?.length) return {}
    const groups = Object.fromEntries(CLUSTER_LABELS.map(l => [l, []]))
    articles.forEach(a => {
      const text = a.title || a.name || ''
      const feats = clusterize(text)
      if (!feats) return
      const topCluster = feats.indexOf(Math.max(...feats))
      const label = CLUSTER_LABELS[topCluster] || 'other'
      if (groups[label]) groups[label].push(a)
      // Tag the article with its cluster + feature vector
      a._cluster      = label
      a._clusterIndex = topCluster
      a._clusterFeats = feats
    })
    return groups
  }, [ready, clusterize])

  // ── World vector contribution from embeddings ─────────────────────────────
  // Replaces the regex heuristics in buildWorldVector for the article signals
  // Returns 24-dim delta that gets added to the Kalman world vector
  const worldVectorDelta = useCallback((articles, signals) => {
    if (!ready || !centroidsRef.current) return new Float32Array(24)
    const delta = new Float32Array(24)

    const allTexts = [
      ...(articles || []).map(a => a.title || ''),
      ...(signals  || []).map(s => s.name  || ''),
    ].filter(Boolean)

    if (allTexts.length === 0) return delta

    // Get cluster distribution across all texts
    const clusterCounts = new Float32Array(K_CLUSTERS)
    let total = 0
    for (const text of allTexts) {
      const feats = clusterize(text)
      if (!feats) continue
      for (let k = 0; k < K_CLUSTERS; k++) clusterCounts[k] += feats[k]
      total++
    }
    if (total === 0) return delta
    for (let k = 0; k < K_CLUSTERS; k++) clusterCounts[k] /= total

    // Map cluster activations to world vector dimensions
    // VOX world vector dims (0-23):
    //  0:pol_instability 1:stability 2:kinetic_conflict 3:diplomacy 4:convergence
    //  5:de_escalation 6:nuclear 7:cyber 8:disease 9:pol_instability2
    // 10:climate 11:economic_stress 12:market_risk 13:inflation 14:currency
    // 15:trade 16:energy 17:market_sentiment 18:leverage 19:equity_risk
    // 20:supply_chain 21:trade_war 22:sanctions 23:chokepoints
    const MAP = [
      // [cluster_idx, wv_dim, weight]
      [0,  2, 0.40],  // ukraine_russia → kinetic_conflict
      [0,  0, 0.25],  // ukraine_russia → pol_instability
      [0,  9, 0.15],  // ukraine_russia → pol_instability2
      [1,  2, 0.35],  // middle_east → kinetic_conflict
      [1,  0, 0.20],  // middle_east → pol_instability
      [1, 20, 0.15],  // middle_east → supply_chain
      [2,  0, 0.30],  // china_taiwan → pol_instability
      [2, 20, 0.25],  // china_taiwan → supply_chain
      [2, 21, 0.20],  // china_taiwan → trade_war
      [3,  6, 0.70],  // nuclear → nuclear dim
      [3,  0, 0.20],  // nuclear → pol_instability
      [4,  7, 0.70],  // cyber → cyber dim
      [4, 11, 0.15],  // cyber → economic_stress
      [5, 11, 0.35],  // economics → economic_stress
      [5, 13, 0.25],  // economics → inflation
      [5, 22, 0.20],  // economics → sanctions
      [6,  9, 0.50],  // elections → pol_instability2
      [6,  0, 0.25],  // elections → pol_instability
      [7,  8, 0.30],  // humanitarian → disease proxy
      [7,  0, 0.20],  // humanitarian → pol_instability
      [8, 16, 0.60],  // energy → energy dim
      [8, 20, 0.20],  // energy → supply_chain
      [9, 12, 0.40],  // finance → market_risk
      [9, 13, 0.25],  // finance → inflation
      [10, 8, 0.80],  // health → disease dim
      [11, 3, 0.60],  // diplomacy → diplomacy dim
      [11, 1, 0.25],  // diplomacy → stability
    ]

    for (const [clIdx, wvDim, weight] of MAP) {
      delta[wvDim] += clusterCounts[clIdx] * weight
    }

    return delta
  }, [ready, clusterize])

  return {
    ready, docCount, train,
    embed, clusterize, similarity, topK,
    clusterArticles, worldVectorDelta,
    clusterLabels: CLUSTER_LABELS,
  }
}
