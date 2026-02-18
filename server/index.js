import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(cors())
app.use(express.json())

const DB_PATH = path.join(__dirname, 'db.json')

const DEFAULT_ORCHESTRATOR = {
  enabled: false,
  infinite: false,
  targetY: 3,
  seedPrompt: '',
  provider: process.env.DEFAULT_PROVIDER || 'openai',
  model: '',
  maxActive: 2,
  tickMs: 8000,
  autoApproveThreshold: 93,
  totalCreated: 0,
  lastTickAt: null,
  statusMessage: '停止中',
  goalY: 0,
}

let orchestratorTimer = null

function ensureDBDefaults(db) {
  db.tasks = Array.isArray(db.tasks) ? db.tasks : []
  db.stream = Array.isArray(db.stream) ? db.stream : []
  db.wisdomLog = Array.isArray(db.wisdomLog) ? db.wisdomLog : []
  db.orchestrator = { ...DEFAULT_ORCHESTRATOR, ...(db.orchestrator || {}) }
  return db
}

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    return ensureDBDefaults({ tasks: [], stream: [], wisdomLog: [], orchestrator: DEFAULT_ORCHESTRATOR })
  }
  return ensureDBDefaults(JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')))
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(ensureDBDefaults(data), null, 2))
}

async function callLLM(provider, messages, model) {
  const { default: fetch } = await import('node-fetch').catch(() => ({
    default: globalThis.fetch,
  }))

  if (provider === 'openai' || provider === 'lmstudio') {
    const baseURL =
      provider === 'lmstudio'
        ? (process.env.LMSTUDIO_URL || 'http://localhost:1234') + '/v1'
        : 'https://api.openai.com/v1'
    const apiKey =
      provider === 'lmstudio'
        ? 'lm-studio'
        : process.env.OPENAI_API_KEY || ''

    const resp = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || (provider === 'lmstudio' ? 'local-model' : 'gpt-4o'),
        messages,
        temperature: 0.7,
      }),
    })
    if (!resp.ok) {
      const err = await resp.text()
      throw new Error(`${provider} API error: ${err}`)
    }
    const data = await resp.json()
    return data.choices[0].message.content
  }

  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY || ''
    const gemModel = model || 'gemini-2.0-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${gemModel}:generateContent?key=${apiKey}`
    const payload = {
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) {
      const err = await resp.text()
      throw new Error(`Gemini API error: ${err}`)
    }
    const data = await resp.json()
    return data.candidates[0].content.parts[0].text
  }

  throw new Error(`Unknown provider: ${provider}`)
}

function buildXPlan(prompt) {
  const compact = (prompt || '').replace(/\s+/g, ' ').trim()
  const chunks = compact.split(/[。.!?\n]/).map((s) => s.trim()).filter(Boolean)
  const base = chunks.length ? chunks.slice(0, 4) : [compact || '要求を実装する']
  return [
    `要件を分解: ${base[0] || '主要機能の洗い出し'}`,
    `入力/出力を定義: 境界条件と失敗系を先に確定`,
    `最小実装を先に作成し、拡張ポイントを分離`,
    `検証方法を追加: 手動確認手順とログ出力`,
  ]
}

function buildDeterministicTrial(prompt, xPlan, wConstraints, flavor) {
  const planList = xPlan.map((x, i) => ` * ${i + 1}. ${x}`).join('\n')
  const wisdom = wConstraints.length ? wConstraints.join(' / ') : 'なし'
  const strategy =
    flavor === 'safety'
      ? '安全性優先: 入力検証を厚くする'
      : flavor === 'perf'
      ? '性能優先: ループとメモリ確保を最小化'
      : '可読性優先: 構造を明瞭化'

  return `// Deterministic ${flavor} trial\n// Prompt: ${prompt}\n// Strategy: ${strategy}\n// W constraints: ${wisdom}\n\n/**\n * X Plan\n${planList}\n */\nexport function buildFeature(input) {\n  if (input == null) return { ok: false, reason: 'input is null' }\n  const text = String(input).trim()\n  if (!text) return { ok: false, reason: 'input is empty' }\n\n  const tokens = text.split(/\\s+/).filter(Boolean)\n  const analyzed = {\n    length: text.length,\n    tokenCount: tokens.length,\n    uniqueTokens: new Set(tokens).size,\n  }\n\n  return {\n    ok: true,\n    original: text,\n    analyzed,\n    rebuilt: tokens.join(' '),\n    evolved: {\n      score: analyzed.uniqueTokens * 10 + analyzed.length,\n      strategy: '${strategy}',\n    },\n  }\n}\n`}

function heuristicScore(code, xPlan, wConstraints) {
  let score = 68
  const text = code || ''
  if (/function|class|export\s+function/.test(text)) score += 8
  if (/if\s*\(/.test(text)) score += 6
  if (/return/.test(text)) score += 4
  if (/error|try|catch|fail|null|undefined/i.test(text)) score += 5
  if (text.length > 300) score += 4
  if (text.length > 800) score += 3
  score += Math.min(6, xPlan.length)
  if (wConstraints.length) score += 3
  return Math.min(99, Math.max(1, score))
}

function createTask(db, payload) {
  const taskId = `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`
  const task = {
    id: taskId,
    prompt: payload.prompt,
    originalPrompt: payload.originalPrompt || payload.prompt,
    provider: payload.provider || process.env.DEFAULT_PROVIDER || 'openai',
    model: payload.model || null,
    status: 'running',
    axis: 'X',
    xPlan: [],
    zTrials: [],
    wConstraints: [],
    best: null,
    score: null,
    diff: null,
    thinkingLog: [],
    createdAt: new Date().toISOString(),
    parentId: payload.parentId,
    source: payload.source || 'manual',
  }
  db.tasks.push(task)
  writeDB(db)
  return taskId
}

function approveTaskInDB(db, task, reason = 'approved') {
  task.status = 'approved'
  task.approvedAt = new Date().toISOString()
  db.stream.unshift({
    id: task.id,
    title: task.prompt,
    score: task.score,
    code: task.best,
    diff: task.diff,
    provider: task.provider,
    approvedAt: task.approvedAt,
    reason,
  })
}

async function runTaskById(taskId) {
  const db = readDB()
  const t = db.tasks.find((x) => x.id === taskId)
  if (!t) return

  try {
    const wisdom = (db.wisdomLog || []).slice(-8)
    t.wConstraints = wisdom
    t.xPlan = buildXPlan(t.originalPrompt || t.prompt)
    t.thinkingLog.push(`X軸 Planner: ${t.xPlan.length}ステップを構築`)
    t.thinkingLog.push(`W軸: 制約 ${wisdom.length} 件を注入`)
    writeDB(db)

    const deterministic = buildDeterministicTrial(t.prompt, t.xPlan, wisdom, 'baseline')

    const llmPrompts = [
      `以下を実装してください。コードのみ返答。\n\n要件: ${t.prompt}\n\nX Plan:\n${t.xPlan.join('\n')}\n\nW制約:\n${wisdom.join('\n') || 'なし'}`,
      `性能重視で以下を実装してください。コードのみ返答。\n\n要件: ${t.prompt}\n\nX Plan:\n${t.xPlan.join('\n')}\n\nW制約:\n${wisdom.join('\n') || 'なし'}`,
    ]

    t.thinkingLog.push('Z軸: deterministic + 2 LLM で3案生成')
    writeDB(db)

    const llmResults = await Promise.allSettled(
      llmPrompts.map((p) => callLLM(t.provider, [{ role: 'user', content: p }], t.model))
    )

    const zTrials = [
      { id: 'Z1', code: deterministic, ok: true, source: 'deterministic' },
      {
        id: 'Z2',
        code: llmResults[0].status === 'fulfilled' ? llmResults[0].value : `// ERROR: ${llmResults[0].reason?.message}`,
        ok: llmResults[0].status === 'fulfilled',
        source: 'llm',
      },
      {
        id: 'Z3',
        code: llmResults[1].status === 'fulfilled' ? llmResults[1].value : `// ERROR: ${llmResults[1].reason?.message}`,
        ok: llmResults[1].status === 'fulfilled',
        source: 'llm',
      },
    ]

    t.zTrials = zTrials
    const goodTrials = zTrials.filter((z) => z.ok)
    if (!goodTrials.length) throw new Error('全トライアル失敗')

    const scored = goodTrials.map((z) => ({
      ...z,
      score: heuristicScore(z.code, t.xPlan || [], t.wConstraints || []),
    }))
    scored.sort((a, b) => b.score - a.score)

    const winner = scored[0]
    t.best = winner.code
    t.score = winner.score
    t.diff = `選定: ${winner.id} (${winner.source}) / heuristic ${winner.score}%`
    t.thinkingLog.push(`X軸 Evaluator: ${winner.id} を選定`)
    t.status = 'pending_approval'

    const db2 = readDB()
    const latest = db2.tasks.find((x) => x.id === taskId)
    if (!latest) return
    Object.assign(latest, {
      xPlan: t.xPlan,
      zTrials: t.zTrials,
      wConstraints: t.wConstraints,
      best: t.best,
      score: t.score,
      diff: t.diff,
      status: t.status,
      thinkingLog: t.thinkingLog,
    })

    if (db2.orchestrator.enabled && latest.score >= db2.orchestrator.autoApproveThreshold) {
      latest.thinkingLog.push(`Y軸 AutoApprove: score ${latest.score}% >= ${db2.orchestrator.autoApproveThreshold}%`)
      approveTaskInDB(db2, latest, 'autopilot')
    }
    writeDB(db2)
  } catch (err) {
    const dbErr = readDB()
    const latest = dbErr.tasks.find((x) => x.id === taskId)
    if (!latest) return
    latest.status = 'error'
    latest.thinkingLog.push(`エラー: ${err?.message || 'unknown'}`)
    writeDB(dbErr)
  }
}

function nextAutoPrompt(orchestrator, db) {
  const cycle = orchestrator.totalCreated + 1
  const themes = ['分解', '解析', '再構築', '発達', '検証', '運用']
  const phase = themes[(cycle - 1) % themes.length]
  const recent = (db.wisdomLog || []).slice(-3).join(' / ') || 'なし'
  return `${orchestrator.seedPrompt}\n\nCycle ${cycle}: ${phase}フェーズを実装。\n要求: 最小機能 + 改善提案 + 検証手順を含める。\n過去制約: ${recent}`
}

async function orchestratorTick() {
  const db = readDB()
  const o = db.orchestrator
  if (!o.enabled) return

  o.lastTickAt = new Date().toISOString()

  if (!o.infinite && db.stream.length >= o.goalY) {
    o.enabled = false
    o.statusMessage = `Y目標 ${o.targetY} 件に到達`
    writeDB(db)
    if (orchestratorTimer) clearInterval(orchestratorTimer)
    orchestratorTimer = null
    return
  }

  const active = db.tasks.filter((t) => t.status === 'running' || t.status === 'pending_approval').length
  if (active >= o.maxActive) {
    o.statusMessage = `待機: active ${active}/${o.maxActive}`
    writeDB(db)
    return
  }

  const prompt = nextAutoPrompt(o, db)
  const taskId = createTask(db, {
    prompt,
    originalPrompt: o.seedPrompt,
    provider: o.provider,
    model: o.model,
    source: 'autopilot',
  })

  const db2 = readDB()
  db2.orchestrator.totalCreated += 1
  db2.orchestrator.statusMessage = `生成: ${db2.orchestrator.totalCreated}件目` 
  writeDB(db2)
  runTaskById(taskId)
}

function startOrchestratorLoop() {
  if (orchestratorTimer) clearInterval(orchestratorTimer)
  const db = readDB()
  const tickMs = Math.max(2000, Number(db.orchestrator.tickMs || 8000))
  orchestratorTimer = setInterval(() => {
    orchestratorTick().catch(() => {})
  }, tickMs)
}

app.get('/api/state', (_req, res) => {
  const db = readDB()
  res.json({
    stream: db.stream,
    tasks: db.tasks,
    wisdomLog: db.wisdomLog,
  })
})

app.get('/api/orchestrator', (_req, res) => {
  const db = readDB()
  res.json(db.orchestrator)
})

app.post('/api/orchestrator/start', async (req, res) => {
  const db = readDB()
  const {
    seedPrompt,
    provider,
    model,
    targetY,
    infinite,
    maxActive,
    tickMs,
    autoApproveThreshold,
  } = req.body || {}

  db.orchestrator.enabled = true
  db.orchestrator.seedPrompt = (seedPrompt || '').trim() || '既存コードを改善する'
  db.orchestrator.provider = provider || db.orchestrator.provider || 'openai'
  db.orchestrator.model = model || ''
  db.orchestrator.targetY = Math.max(1, Number(targetY || 3))
  db.orchestrator.infinite = !!infinite
  db.orchestrator.maxActive = Math.max(1, Number(maxActive || 2))
  db.orchestrator.tickMs = Math.max(2000, Number(tickMs || 8000))
  db.orchestrator.autoApproveThreshold = Math.max(1, Math.min(100, Number(autoApproveThreshold || 93)))
  db.orchestrator.goalY = db.stream.length + db.orchestrator.targetY
  db.orchestrator.statusMessage = '起動'
  writeDB(db)

  startOrchestratorLoop()
  await orchestratorTick()
  res.json({ ok: true })
})

app.post('/api/orchestrator/stop', (_req, res) => {
  const db = readDB()
  db.orchestrator.enabled = false
  db.orchestrator.statusMessage = '停止'
  writeDB(db)
  if (orchestratorTimer) clearInterval(orchestratorTimer)
  orchestratorTimer = null
  res.json({ ok: true })
})

app.get('/api/providers', (_req, res) => {
  res.json({
    openai: !!process.env.OPENAI_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    lmstudio: true, // local, always try
    defaultProvider: process.env.DEFAULT_PROVIDER || 'openai',
    lmstudioUrl: process.env.LMSTUDIO_URL || 'http://localhost:1234',
  })
})

app.post('/api/providers', (req, res) => {
  const { openaiKey, geminiKey, lmstudioUrl, defaultProvider } = req.body
  // Write to .env file at project root
  const envPath = path.join(__dirname, '..', '.env')
  let lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8').split('\n') : []
  const set = (key, val) => {
    const idx = lines.findIndex((l) => l.startsWith(key + '='))
    if (idx >= 0) lines[idx] = `${key}=${val}`
    else lines.push(`${key}=${val}`)
  }
  if (openaiKey !== undefined) set('OPENAI_API_KEY', openaiKey)
  if (geminiKey !== undefined) set('GEMINI_API_KEY', geminiKey)
  if (lmstudioUrl !== undefined) set('LMSTUDIO_URL', lmstudioUrl)
  if (defaultProvider !== undefined) set('DEFAULT_PROVIDER', defaultProvider)
  fs.writeFileSync(envPath, lines.filter(Boolean).join('\n') + '\n')
  // Reload
  dotenv.config({ override: true })
  res.json({ ok: true })
})

app.post('/api/prompt', async (req, res) => {
  const { prompt, provider, model } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt is required' })

  const db = readDB()
  const taskId = createTask(db, {
    prompt,
    originalPrompt: prompt,
    provider,
    model,
    source: 'manual',
  })

  res.json({ taskId })
  runTaskById(taskId)
})

app.get('/api/tasks/:id', (req, res) => {
  const db = readDB()
  const task = db.tasks.find((t) => t.id === req.params.id)
  if (!task) return res.status(404).json({ error: 'not found' })
  res.json(task)
})

app.post('/api/tasks/:id/approve', (req, res) => {
  const db = readDB()
  const task = db.tasks.find((t) => t.id === req.params.id)
  if (!task) return res.status(404).json({ error: 'not found' })
  approveTaskInDB(db, task, 'manual')

  writeDB(db)
  res.json({ ok: true })
})

app.post('/api/tasks/:id/reject', async (req, res) => {
  const db = readDB()
  const task = db.tasks.find((t) => t.id === req.params.id)
  if (!task) return res.status(404).json({ error: 'not found' })

  const { feedback } = req.body
  task.status = 'rejected'
  task.feedback = feedback

  // W-axis: save wisdom
  if (feedback) {
    db.wisdomLog = db.wisdomLog || []
    db.wisdomLog.push(feedback)
  }

  const newTaskId = createTask(db, {
    prompt: `${task.originalPrompt || task.prompt}\n\n前回Rejectフィードバック: ${feedback || 'なし'}`,
    originalPrompt: task.originalPrompt || task.prompt,
    provider: task.provider,
    model: task.model,
    parentId: task.id,
    source: 'reject-regenerate',
  })

  const db2 = readDB()
  const newTask = db2.tasks.find((t) => t.id === newTaskId)
  if (newTask) newTask.thinkingLog.push('W軸フィードバックを反映して再実行')
  writeDB(db2)

  res.json({ ok: true, newTaskId })
  runTaskById(newTaskId)
})

app.delete('/api/tasks/:id', (req, res) => {
  const db = readDB()
  db.tasks = db.tasks.filter((t) => t.id !== req.params.id)
  writeDB(db)
  res.json({ ok: true })
})

const PORT = process.env.PORT || 3001
const bootDB = readDB()
if (bootDB.orchestrator?.enabled) {
  startOrchestratorLoop()
}
app.listen(PORT, () => console.log(`Polyplex backend: http://localhost:${PORT}`))
