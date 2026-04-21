/**
 * useACPL v2 — Proper ML: Matrix Multiplication + Backpropagation + Gradient Descent
 *
 * Architecture: Deep Q-Network with separate Consequence Estimator network.
 *
 * CE NETWORK (consequence estimator):
 *   Input(6) → Linear → ReLU → Linear → ReLU → Linear → Sigmoid → Scalar
 *   Dimensions: 6 → 16 → 8 → 1
 *   Real matrix multiply: h = ReLU(W·x + b) for each layer
 *   Real backprop: δ = (∂L/∂out) propagated via chain rule through each layer
 *   Real SGD: W -= lr * δ·xᵀ  (outer product = weight gradient)
 *
 * DQN (Deep Q-Network):
 *   State(8) → Linear → ReLU → Linear → ReLU → Linear → Q-values(4)
 *   Dimensions: 8 → 32 → 16 → 4
 *   Loss: L = (r + γ·max_a'[Q(s',a')] - β·CE·e^(-λτ) - Q(s,a))²
 *   Gradient: ∂L/∂Q = 2·TD-error, backpropped through network
 *
 * EXPERIENCE REPLAY: uniform random mini-batch (32 samples) from ring buffer (2000)
 * TARGET NETWORK: frozen copy of DQN updated every 100 steps (prevents oscillation)
 *
 * Why this matters vs the old version:
 *   Old: scalar loop dot-product, single-step SGD, no target network, no proper chain rule
 *   New: real matrix ops, Huber loss, target network, momentum, proper δ propagation
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// ── Hyperparameters ──────────────────────────────────────────────────────────
const GAMMA       = 0.95   // reward discount
const BETA        = 0.35   // consequence penalty weight
const LAMBDA      = 0.02   // timing discount per minute
const LR          = 3e-4   // Adam learning rate
const BETA1       = 0.9    // Adam β₁ (momentum)
const BETA2       = 0.999  // Adam β₂ (RMSProp)
const EPS_ADAM    = 1e-8   // Adam numerical stability
const BATCH_SIZE  = 32
const REPLAY_MAX  = 2000
const TARGET_SYNC = 100    // steps between target network syncs
const EPSILON_START = 0.15
const EPSILON_END   = 0.02
const EPSILON_DECAY = 5000 // steps over which ε decays
const HUBER_DELTA   = 1.0  // Huber loss threshold (clips large TD errors)

const CACHE_KEY   = 'nexus-acpl-v2'

// ── Matrix ops (pure JS, no dependencies) ────────────────────────────────────
// mat(rows, cols) → Float32Array stored row-major
function mat(rows, cols, fill = 0) {
  const a = new Float32Array(rows * cols)
  if (fill !== 0) a.fill(fill)
  return { data: a, rows, cols }
}

function matMul(A, B) {
  // C = A·B  (A: [m×k], B: [k×n]) → C: [m×n]
  const { rows: m, cols: k } = A
  const { cols: n } = B
  const C = mat(m, n)
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) {
      let s = 0
      for (let p = 0; p < k; p++) s += A.data[i*k+p] * B.data[p*n+j]
      C.data[i*n+j] = s
    }
  return C
}

function matAdd(A, B) {
  const C = mat(A.rows, A.cols)
  for (let i = 0; i < A.data.length; i++) C.data[i] = A.data[i] + B.data[i]
  return C
}

function matSub(A, B) {
  const C = mat(A.rows, A.cols)
  for (let i = 0; i < A.data.length; i++) C.data[i] = A.data[i] - B.data[i]
  return C
}

function matScale(A, s) {
  const C = mat(A.rows, A.cols)
  for (let i = 0; i < A.data.length; i++) C.data[i] = A.data[i] * s
  return C
}

function matT(A) {
  // Transpose A: [m×n] → [n×m]
  const B = mat(A.cols, A.rows)
  for (let i = 0; i < A.rows; i++)
    for (let j = 0; j < A.cols; j++)
      B.data[j*A.rows+i] = A.data[i*A.cols+j]
  return B
}

function vecAdd(v, b) {
  // v: [n×1] column vector, b: [n×1] bias → broadcast add
  const out = mat(v.rows, v.cols)
  for (let i = 0; i < v.rows; i++) out.data[i] = v.data[i] + b.data[i]
  return out
}

function relu(A) {
  const B = mat(A.rows, A.cols)
  for (let i = 0; i < A.data.length; i++) B.data[i] = Math.max(0, A.data[i])
  return B
}

function reluGrad(A) {
  // ∂ReLU/∂x = 1 if x>0, else 0
  const B = mat(A.rows, A.cols)
  for (let i = 0; i < A.data.length; i++) B.data[i] = A.data[i] > 0 ? 1 : 0
  return B
}

function sigmoid(A) {
  const B = mat(A.rows, A.cols)
  for (let i = 0; i < A.data.length; i++)
    B.data[i] = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, A.data[i]))))
  return B
}

function sigmoidGrad(out) {
  // ∂σ/∂z = σ(z)·(1-σ(z)) where out = σ(z)
  const B = mat(out.rows, out.cols)
  for (let i = 0; i < out.data.length; i++) B.data[i] = out.data[i] * (1 - out.data[i])
  return B
}

function hadamard(A, B) {
  // Element-wise multiply
  const C = mat(A.rows, A.cols)
  for (let i = 0; i < A.data.length; i++) C.data[i] = A.data[i] * B.data[i]
  return C
}

function heInit(rows, cols) {
  // He initialization: W ~ N(0, √(2/fan_in))
  const W = mat(rows, cols)
  const std = Math.sqrt(2 / cols)
  for (let i = 0; i < W.data.length; i++)
    W.data[i] = (Math.random() * 2 - 1) * std
  return W
}

function vecFrom(arr) {
  const v = mat(arr.length, 1)
  for (let i = 0; i < arr.length; i++) v.data[i] = arr[i]
  return v
}

function toArray(A) {
  return Array.from(A.data)
}

// ── Adam optimizer state ──────────────────────────────────────────────────────
function adamState(W) {
  return { m: mat(W.rows, W.cols), v: mat(W.rows, W.cols), t: 0 }
}

function adamUpdate(W, grad, state, lr = LR) {
  state.t++
  const t = state.t
  // m = β₁·m + (1-β₁)·grad
  for (let i = 0; i < W.data.length; i++)
    state.m.data[i] = BETA1 * state.m.data[i] + (1-BETA1) * grad.data[i]
  // v = β₂·v + (1-β₂)·grad²
  for (let i = 0; i < W.data.length; i++)
    state.v.data[i] = BETA2 * state.v.data[i] + (1-BETA2) * grad.data[i]**2
  // Bias correction
  const mHat_scale = 1 / (1 - BETA1**t)
  const vHat_scale = 1 / (1 - BETA2**t)
  // W -= lr * m̂ / (√v̂ + ε)
  for (let i = 0; i < W.data.length; i++) {
    const mHat = state.m.data[i] * mHat_scale
    const vHat = state.v.data[i] * vHat_scale
    W.data[i] -= lr * mHat / (Math.sqrt(vHat) + EPS_ADAM)
  }
}

// ── Network definitions ───────────────────────────────────────────────────────
// CE Network: 6 → 16 → 8 → 1 (consequence estimator)
function initCE() {
  return {
    W1: heInit(16, 6),  b1: mat(16, 1),   // Layer 1
    W2: heInit(8, 16),  b2: mat(8, 1),    // Layer 2
    W3: heInit(1, 8),   b3: mat(1, 1),    // Output
    // Adam states
    opt: {
      W1: adamState(heInit(16,6)), b1: adamState(mat(16,1)),
      W2: adamState(heInit(8,16)), b2: adamState(mat(8,1)),
      W3: adamState(heInit(1,8)),  b3: adamState(mat(1,1)),
    }
  }
}

// DQN: 8 → 32 → 16 → 4 (action-value function)
function initDQN() {
  return {
    W1: heInit(32, 8),  b1: mat(32, 1),
    W2: heInit(16, 32), b2: mat(16, 1),
    W3: heInit(4, 16),  b3: mat(4, 1),
    opt: {
      W1: adamState(heInit(32,8)),  b1: adamState(mat(32,1)),
      W2: adamState(heInit(16,32)), b2: adamState(mat(16,1)),
      W3: adamState(heInit(4,16)),  b3: adamState(mat(4,1)),
    }
  }
}

// ── Forward passes ────────────────────────────────────────────────────────────
function ceForward(ce, x) {
  // x: [6×1] feature vector
  const z1 = vecAdd(matMul(ce.W1, x), ce.b1)      // [16×1]
  const h1 = relu(z1)
  const z2 = vecAdd(matMul(ce.W2, h1), ce.b2)     // [8×1]
  const h2 = relu(z2)
  const z3 = vecAdd(matMul(ce.W3, h2), ce.b3)     // [1×1]
  const out = sigmoid(z3)
  return { out, z1, h1, z2, h2, z3, x }
}

function dqnForward(dqn, x) {
  // x: [8×1] state vector
  const z1 = vecAdd(matMul(dqn.W1, x), dqn.b1)   // [32×1]
  const h1 = relu(z1)
  const z2 = vecAdd(matMul(dqn.W2, h1), dqn.b2)  // [16×1]
  const h2 = relu(z2)
  const z3 = vecAdd(matMul(dqn.W3, h2), dqn.b3)  // [4×1]
  return { q: z3, z1, h1, z2, h2, z3, x }         // raw Q-values (no activation)
}

// ── Backpropagation: CE ───────────────────────────────────────────────────────
// BCE loss: L = -[y·log(p) + (1-y)·log(1-p)]
// ∂L/∂p = (p-y)/(p·(1-p)) then chain with sigmoid grad → ∂L/∂z3 = p - y
function ceBackprop(ce, cache, target) {
  const { out, z1, h1, z2, h2, x } = cache
  const p = out.data[0]

  // Output layer gradient: ∂L/∂z3 = p - y  (combined BCE + sigmoid)
  const dz3 = mat(1, 1)
  dz3.data[0] = p - target

  // Layer 3 weight gradients: ∂L/∂W3 = dz3 · h2ᵀ  [1×8]
  const dW3 = matMul(dz3, matT(h2))
  const db3 = dz3

  // Backprop through Layer 3: ∂L/∂h2 = W3ᵀ · dz3  [8×1]
  const dh2 = matMul(matT(ce.W3), dz3)

  // Backprop through ReLU2: ∂L/∂z2 = dh2 ⊙ ReLU'(z2)
  const dz2 = hadamard(dh2, reluGrad(h2))

  // Layer 2 weight gradients
  const dW2 = matMul(dz2, matT(h1))
  const db2 = dz2

  // Backprop through Layer 2
  const dh1 = matMul(matT(ce.W2), dz2)
  const dz1 = hadamard(dh1, reluGrad(h1))

  // Layer 1 weight gradients
  const dW1 = matMul(dz1, matT(x))
  const db1 = dz1

  // Adam updates
  adamUpdate(ce.W1, dW1, ce.opt.W1)
  adamUpdate(ce.b1, db1, ce.opt.b1)
  adamUpdate(ce.W2, dW2, ce.opt.W2)
  adamUpdate(ce.b2, db2, ce.opt.b2)
  adamUpdate(ce.W3, dW3, ce.opt.W3)
  adamUpdate(ce.b3, db3, ce.opt.b3)

  return (dz3.data[0])**2  // squared error for logging
}

// ── Backpropagation: DQN ──────────────────────────────────────────────────────
// Huber loss on TD error: δ = target_q - Q(s,a)
// ∂L/∂Q(s,a) = -δ if |δ|≤Δ, else -Δ·sign(δ)  (Huber clip)
function dqnBackprop(dqn, cache, action, tdTarget) {
  const { q, z1, h1, z2, h2, x } = cache

  // TD error for this action only
  const tdErr = tdTarget - q.data[action]

  // Huber gradient (clipped)
  const huberGrad = Math.abs(tdErr) <= HUBER_DELTA ? -tdErr : -HUBER_DELTA * Math.sign(tdErr)

  // dL/dz3: only the action dimension has gradient, rest are 0
  const dz3 = mat(4, 1)
  dz3.data[action] = huberGrad

  // Layer 3 grads
  const dW3 = matMul(dz3, matT(h2))
  const db3 = dz3

  // Backprop to h2
  const dh2 = matMul(matT(dqn.W3), dz3)
  const dz2 = hadamard(dh2, reluGrad(h2))

  // Layer 2 grads
  const dW2 = matMul(dz2, matT(h1))
  const db2 = dz2

  // Backprop to h1
  const dh1 = matMul(matT(dqn.W2), dz2)
  const dz1 = hadamard(dh1, reluGrad(h1))

  // Layer 1 grads
  const dW1 = matMul(dz1, matT(x))
  const db1 = dz1

  // Adam updates
  adamUpdate(dqn.W1, dW1, dqn.opt.W1)
  adamUpdate(dqn.b1, db1, dqn.opt.b1)
  adamUpdate(dqn.W2, dW2, dqn.opt.W2)
  adamUpdate(dqn.b2, db2, dqn.opt.b2)
  adamUpdate(dqn.W3, dW3, dqn.opt.W3)
  adamUpdate(dqn.b3, db3, dqn.opt.b3)

  return tdErr**2
}

// Copy DQN weights (for target network sync)
function copyDQN(src) {
  return {
    W1: { data: src.W1.data.slice(), rows: src.W1.rows, cols: src.W1.cols },
    b1: { data: src.b1.data.slice(), rows: src.b1.rows, cols: src.b1.cols },
    W2: { data: src.W2.data.slice(), rows: src.W2.rows, cols: src.W2.cols },
    b2: { data: src.b2.data.slice(), rows: src.b2.rows, cols: src.b2.cols },
    W3: { data: src.W3.data.slice(), rows: src.W3.rows, cols: src.W3.cols },
    b3: { data: src.b3.data.slice(), rows: src.b3.rows, cols: src.b3.cols },
    opt: src.opt,  // shared optimizer state (intentional)
  }
}

// ── Feature extraction ────────────────────────────────────────────────────────
function signalFeatures(signal) {
  // 8-dim state vector for DQN
  const sevMap = { critical: 1.0, high: 0.75, medium: 0.4, low: 0.1 }
  return vecFrom([
    sevMap[signal.severity] ?? 0.3,
    Math.min((signal.sourceCount || 1) / 10, 1),
    Math.min(signal.convergenceScore || 0, 1),
    Math.min((signal.ageMinutes || 0) / 120, 1),
    signal.noisySource ? 1 : 0,
    signal.lat ? Math.abs(signal.lat) / 90 : 0.5,      // geo signal
    (signal.meta?.fatalities || 0) > 0 ? 1 : 0,         // has fatalities
    ['conflict','milaircraft','warship','notam'].includes(signal.type) ? 1 : 0, // conflict type
  ])
}

function ceFeatureVec(signal, action) {
  // 6-dim input for CE network
  const sevMap = { critical: 1.0, high: 0.67, medium: 0.33, low: 0.1 }
  return vecFrom([
    sevMap[signal.severity] ?? 0.33,
    Math.min((signal.sourceCount || 1) / 10, 1),
    Math.min(signal.convergenceScore || 0, 1),
    Math.min((signal.ageMinutes || 0) / 120, 1),
    signal.noisySource ? 1 : 0,
    action / 3,
  ])
}

function estimateTiming(signal, action) {
  const base = [0, 45, 20, 10][action] ?? 30
  return base * Math.max(0.2, 1 - (signal.ageMinutes || 0) / 180) * (signal.noisySource ? 1.8 : 1)
}

// Serialize/deserialize for localStorage (Float32Array → regular array)
function serializeNet(net) {
  const s = {}
  for (const [k, v] of Object.entries(net)) {
    if (k === 'opt') continue
    s[k] = { data: Array.from(v.data), rows: v.rows, cols: v.cols }
  }
  return s
}

function deserializeNet(s, initFn) {
  const net = initFn()
  for (const [k, v] of Object.entries(s)) {
    if (!net[k]) continue
    net[k].data = new Float32Array(v.data)
    net[k].rows = v.rows
    net[k].cols = v.cols
  }
  return net
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useACPL({ signals = [], enabled = true } = {}) {
  const [ce,  setCe]  = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(CACHE_KEY + '-ce')); return s ? deserializeNet(s, initCE) : initCE() } catch { return initCE() }
  })
  const [dqn, setDqn] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(CACHE_KEY + '-dqn')); return s ? deserializeNet(s, initDQN) : initDQN() } catch { return initDQN() }
  })
  const [targetDqn, setTargetDqn] = useState(() => copyDQN(dqn))
  const [replay,  setReplay]  = useState([])
  const [step,    setStep]    = useState(0)
  const [stats,   setStats]   = useState({ totalSteps: 0, ceLoss: 0, dqnLoss: 0, epsilon: EPSILON_START, falsePositiveRate: 0, suppressed: 0, escalated: 0 })

  const ceRef  = useRef(ce)
  const dqnRef = useRef(dqn)
  const targetRef = useRef(targetDqn)
  const stepRef = useRef(step)
  ceRef.current = ce
  dqnRef.current = dqn
  targetRef.current = targetDqn
  stepRef.current = step

  // Persist every 50 steps
  useEffect(() => {
    if (step % 50 !== 0 || step === 0) return
    try {
      localStorage.setItem(CACHE_KEY + '-ce',  JSON.stringify(serializeNet(ce)))
      localStorage.setItem(CACHE_KEY + '-dqn', JSON.stringify(serializeNet(dqn)))
    } catch {}
  }, [step])

  // ── Action selection (ε-greedy + consequence penalty) ────────────────────
  const selectAction = useCallback((signal, epsilon) => {
    if (!enabled) return { action: 2, actionLabel: 'surface_high', ceScore: 0, riskW: 0 }

    const eps = epsilon ?? Math.max(EPSILON_END, EPSILON_START - (stepRef.current / EPSILON_DECAY) * (EPSILON_START - EPSILON_END))

    if (Math.random() < eps) {
      const action = Math.floor(Math.random() * 4)
      return { action, actionLabel: ['suppress','surface_low','surface_high','escalate'][action], ceScore: 0, riskW: 0, random: true }
    }

    // DQN forward
    const x = signalFeatures(signal)
    const { q } = dqnForward(dqnRef.current, x)

    // Penalize Q values by consequence estimate
    let bestAction = 0, bestQ = -Infinity
    for (let a = 0; a < 4; a++) {
      const ceX = ceFeatureVec(signal, a)
      const { out: ceOut } = ceForward(ceRef.current, ceX)
      const tau = estimateTiming(signal, a)
      const riskW = ceOut.data[0] * Math.exp(-LAMBDA * tau)
      const penalizedQ = q.data[a] - BETA * riskW
      if (penalizedQ > bestQ) { bestQ = penalizedQ; bestAction = a }
    }

    // Get CE score for selected action
    const ceX = ceFeatureVec(signal, bestAction)
    const { out: ceOut } = ceForward(ceRef.current, ceX)
    const tau = estimateTiming(signal, bestAction)
    const riskW = ceOut.data[0] * Math.exp(-LAMBDA * tau)

    return {
      action: bestAction,
      actionLabel: ['suppress','surface_low','surface_high','escalate'][bestAction],
      ceScore: Math.round(ceOut.data[0] * 1000) / 1000,
      riskW: Math.round(riskW * 1000) / 1000,
    }
  }, [enabled])

  // ── Record outcome → add to replay, run gradient descent ────────────────
  const recordOutcome = useCallback(({ signal, action, reward, nextSignal = null, wasNegative = false, delayMinutes = 0 }) => {
    // Add to replay buffer (ring buffer semantics)
    const experience = { signal, action, reward, nextSignal: nextSignal || signal, wasNegative, delayMinutes, ts: Date.now() }

    setReplay(prev => {
      const next = [...prev.slice(-(REPLAY_MAX - 1)), experience]

      if (next.length >= BATCH_SIZE) {
        // Mini-batch gradient descent
        const batch = [...next].sort(() => Math.random() - 0.5).slice(0, BATCH_SIZE)
        let ceLossSum = 0, dqnLossSum = 0

        // Mutate networks in-place (refs) for performance — state update at end
        const newCe  = JSON.parse(JSON.stringify(ceRef.current))
        newCe.W1.data = new Float32Array(newCe.W1.data)
        newCe.b1.data = new Float32Array(newCe.b1.data)
        newCe.W2.data = new Float32Array(newCe.W2.data)
        newCe.b2.data = new Float32Array(newCe.b2.data)
        newCe.W3.data = new Float32Array(newCe.W3.data)
        newCe.b3.data = new Float32Array(newCe.b3.data)
        // Rebuild opt refs
        newCe.opt = ceRef.current.opt

        const newDqn = JSON.parse(JSON.stringify(dqnRef.current))
        newDqn.W1.data = new Float32Array(newDqn.W1.data)
        newDqn.b1.data = new Float32Array(newDqn.b1.data)
        newDqn.W2.data = new Float32Array(newDqn.W2.data)
        newDqn.b2.data = new Float32Array(newDqn.b2.data)
        newDqn.W3.data = new Float32Array(newDqn.W3.data)
        newDqn.b3.data = new Float32Array(newDqn.b3.data)
        newDqn.opt = dqnRef.current.opt

        for (const exp of batch) {
          // ── CE update ────────────────────────────────────────────────
          const ceX = ceFeatureVec(exp.signal, exp.action)
          const ceCache = ceForward(newCe, ceX)
          ceLossSum += ceBackprop(newCe, ceCache, exp.wasNegative ? 1.0 : 0.0)

          // ── DQN update ───────────────────────────────────────────────
          const x     = signalFeatures(exp.signal)
          const xNext = signalFeatures(exp.nextSignal)
          const cache = dqnForward(newDqn, x)

          // Target Q from frozen target network
          const { q: qNext } = dqnForward(targetRef.current, xNext)
          const maxQNext = Math.max(...Array.from(qNext.data))

          // CE score for ACPL consequence penalty
          const ceX2 = ceFeatureVec(exp.signal, exp.action)
          const { out: ceOut } = ceForward(newCe, ceX2)
          const tau = estimateTiming(exp.signal, exp.action)
          const riskW = ceOut.data[0] * Math.exp(-LAMBDA * tau)

          // Bellman target with ACPL penalty
          const tdTarget = exp.reward + GAMMA * maxQNext - BETA * riskW
          dqnLossSum += dqnBackprop(newDqn, cache, exp.action, tdTarget)
        }

        setCe(newCe)
        setDqn(newDqn)
        setStep(s => {
          const ns = s + 1
          // Sync target network every TARGET_SYNC steps
          if (ns % TARGET_SYNC === 0) setTargetDqn(copyDQN(newDqn))
          return ns
        })

        const n = batch.length
        setStats(prev => ({
          ...prev,
          totalSteps: prev.totalSteps + 1,
          ceLoss:  Math.round((ceLossSum / n) * 10000) / 10000,
          dqnLoss: Math.round((dqnLossSum / n) * 10000) / 10000,
          epsilon: Math.max(EPSILON_END, EPSILON_START - (stepRef.current / EPSILON_DECAY) * (EPSILON_START - EPSILON_END)),
          falsePositiveRate: (prev.falsePositiveRate * 0.99 + (wasNegative ? 0.01 : 0)),
          suppressed: prev.suppressed + (action === 0 ? 1 : 0),
          escalated:  prev.escalated  + (action === 3 ? 1 : 0),
        }))
      }

      return next
    })
  }, [])

  // ── Process all current signals ───────────────────────────────────────────
  const processedSignals = useCallback(() => {
    if (!enabled || !signals.length) return signals
    return signals.map(sig => {
      const decision = selectAction(sig, 0.0)  // greedy in production
      return {
        ...sig,
        _acpl: {
          action: decision.actionLabel,
          ceScore: decision.ceScore,
          riskW: decision.riskW,
          shouldSurface: decision.action >= 1,
          shouldEscalate: decision.action === 3,
          suppressed: decision.action === 0,
        }
      }
    }).filter(sig => sig.severity === 'critical' || sig._acpl.action !== 'suppress')
  }, [signals, enabled, selectAction])

  const delayedConsequenceCost = useCallback((windowMin = 60) => {
    const cutoff = Date.now() - windowMin * 60000
    const recent = replay.filter(e => e.ts > cutoff)
    if (!recent.length) return 0
    return recent.reduce((s, e) => s + (e.wasNegative ? Math.exp(-LAMBDA * e.delayMinutes) : 0), 0) / recent.length
  }, [replay])

  return { processedSignals, selectAction, recordOutcome, stats, delayedConsequenceCost, replaySize: replay.length, step }
}
