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
app.use(express.json({ limit: '20mb' }))

const DB_PATH = path.join(__dirname, 'db.json')

// ─── 5D Git Quality Gates ─────────────────────────────────────────────────
const Y_COMMIT_THRESHOLD    = 95   // overall score required for pending_approval
const Y_MIN_FILE_SCORE      = 85   // per-file minimum
const Y_MIN_Z_DEPTH         = 3    // must survive at least 3 refinement rounds
const MAX_Z_DEPTH           = 5    // max iterations before giving up
const AUTO_APPROVE_DEFAULT  = 98   // score required for auto-commit

// ─── Agent Role Definitions ───────────────────────────────────────────────
// Each agent: strict system prompt + conservative temperature
const AGENTS = {
  architect: {
    temperature: 0.25,
    system: `You are a world-class software architect with 20+ years shipping production systems.
Given a product requirement, output a complete architecture specification as JSON.

You are designing for PRODUCTION — real auth, real DB, real error handling.
No "TODO later" architecture. Every design decision must be justified.

Output ONLY valid JSON (no markdown fences, no explanation text):
{
  "projectName": "snake_case",
  "description": "2–3 sentences",
  "techStack": {
    "runtime": "...",
    "framework": "...",
    "database": "...",
    "auth": "...",
    "testing": "...",
    "other": []
  },
  "architecture": "paragraph describing system design",
  "dataModels": [
    { "name": "User", "fields": { "id": "uuid", "email": "string" }, "relations": ["has many Posts"] }
  ],
  "apiEndpoints": [
    { "method": "POST", "path": "/api/auth/login", "auth": false, "description": "..." }
  ],
  "files": [
    {
      "path": "src/server/routes/auth.ts",
      "purpose": "JWT auth endpoints: login, register, refresh, logout",
      "exports": ["authRouter"],
      "dependencies": ["src/server/db/users.ts", "src/lib/jwt.ts"],
      "priority": 1
    }
  ],
  "environmentVars": ["DATABASE_URL", "JWT_SECRET"],
  "implementationNotes": "critical decisions engineers must know"
}

Keep files ≤ 12. Priority 1 = implement first.`,
  },

  engineer: {
    temperature: 0.35,
    system: `You are a senior engineer writing production-ready code.

ABSOLUTE RULES — violating any = failure:
1. COMPLETE code only. Zero TODOs, zero "add logic here", zero placeholder functions.
2. Full error handling on every async operation, DB call, external API call.
3. Input validation on every public function/endpoint.
4. Real business logic — if it's auth, implement real JWT. If it's DB, write real queries.
5. Type-safe throughout (TypeScript: no implicit 'any').
6. Self-contained: all imports resolved from the file's declared dependencies.
7. If the file is a UI component: handle loading, error, and empty states.

Output the raw source code ONLY — no markdown, no comments outside the code, no explanation.`,
  },

  critic: {
    temperature: 0.15,
    system: `You are an adversarial code reviewer whose job is to find every problem.

Scoring guide:
- 95–100: Ship today, zero changes needed
- 85–94: Production-ready with minor improvements
- 70–84: Significant issues, not ready to ship
- 50–69: Substantial problems requiring rewrite of sections
- 0–49: Fundamentally broken or incomplete

Review for ALL of:
1. Correctness — does the code actually implement the stated purpose?
2. Completeness — any TODO, placeholder, unimplemented function?
3. Error handling — every throw-able path caught and handled?
4. Security — SQLi, XSS, auth bypass, exposed secrets, IDOR?
5. Edge cases — null/undefined, empty arrays, concurrent access?
6. Type safety — unsafe casts, missing null checks?
7. Performance — N+1 queries, unindexed reads, memory leaks?
8. Integration — imports match declared dependencies?

Output ONLY valid JSON:
{
  "score": 0-100,
  "summary": "one sentence",
  "critical": ["blocking bug: description"],
  "major": ["significant issue: description"],
  "minor": ["suggestion: description"],
  "security": ["vulnerability: description"],
  "missing": ["feature/case not implemented"]
}`,
  },

  refiner: {
    temperature: 0.3,
    system: `You are an expert code refiner. You receive buggy/incomplete code + a detailed critique.

Fix EVERY critical issue. Fix EVERY major issue. Address as many minor issues as feasible.
Do not break existing functionality. Maintain the same file path and exports.
Do not downgrade: the refined code must be strictly better than the original.

Output the complete, improved source code ONLY — no markdown, no explanation.`,
  },

  integrator: {
    temperature: 0.15,
    system: `You are a systems integrator verifying that multiple files work together.

Check:
1. Import paths — every import/require resolves to a real file in the project
2. Interface contracts — exported types match how they're consumed
3. Data shapes — function return values match callers' expectations
4. Environment — all env vars referenced actually defined in architecture
5. Auth flow — auth middleware applied consistently where required
6. DB schema — every DB access matches the defined data models
7. Circular imports — any problematic cycles?

Output ONLY valid JSON:
{
  "overallScore": 0-100,
  "compatible": true|false,
  "issues": [{ "file": "a.ts", "other": "b.ts", "problem": "..." }],
  "missing": ["glue code or connections that need to be added"],
  "envVars": ["vars referenced but not in architecture"],
  "summary": "1–2 sentence verdict"
}`,
  },
}

// ─── DB Helpers ───────────────────────────────────────────────────────────
function defaultSettings() {
  return {
    defaultProvider: process.env.DEFAULT_PROVIDER || 'openai',
    defaultModel: '',
    autoApprove: false,
    autoApproveThreshold: AUTO_APPROVE_DEFAULT,
  }
}

function ensureDefaults(db) {
  db.tasks      = Array.isArray(db.tasks)     ? db.tasks     : []
  db.stream     = Array.isArray(db.stream)    ? db.stream    : []
  db.wisdomLog  = Array.isArray(db.wisdomLog) ? db.wisdomLog : []
  db.settings   = db.settings || defaultSettings()
  return db
}

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const db = ensureDefaults({})
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
    return db
  }
  try { return ensureDefaults(JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))) }
  catch { return ensureDefaults({}) }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(ensureDefaults(data), null, 2))
}

function saveTask(taskId, updater) {
  const db = readDB()
  const idx = db.tasks.findIndex(t => t.id === taskId)
  if (idx !== -1) { updater(db.tasks[idx]); writeDB(db) }
}

// ─── LLM Call ─────────────────────────────────────────────────────────────
async function callLLM(provider, model, messages, temperature) {
  const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }))

  if (provider === 'openai' || provider === 'lmstudio') {
    const baseURL = provider === 'lmstudio'
      ? (process.env.LMSTUDIO_URL || 'http://localhost:1234') + '/v1'
      : 'https://api.openai.com/v1'
    const apiKey = provider === 'lmstudio' ? 'lm-studio' : (process.env.OPENAI_API_KEY || '')
    const resp = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || (provider === 'lmstudio' ? 'local-model' : 'gpt-4o'),
        messages,
        temperature: temperature ?? 0.5,
      }),
    })
    if (!resp.ok) throw new Error(`${provider} error ${resp.status}: ${await resp.text()}`)
    return (await resp.json()).choices[0].message.content
  }

  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY || ''
    const gemModel = model || 'gemini-2.0-flash'
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${gemModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: { temperature: temperature ?? 0.5 },
        }),
      }
    )
    if (!resp.ok) throw new Error(`Gemini error ${resp.status}: ${await resp.text()}`)
    return (await resp.json()).candidates[0].content.parts[0].text
  }

  throw new Error(`Unknown provider: ${provider}`)
}

async function runAgent(role, userMsg, provider, model) {
  const agent = AGENTS[role]
  if (!agent) throw new Error(`No agent: ${role}`)
  return callLLM(provider, model, [
    { role: 'system', content: agent.system },
    { role: 'user',   content: userMsg },
  ], agent.temperature)
}

function parseJSON(text) {
  if (!text) return null
  const s = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  try { return JSON.parse(s) } catch { return null }
}

function ts() { return new Date().toISOString().slice(11, 19) }

// ─── Core 5D Git Workflow ─────────────────────────────────────────────────
async function runDeepWorkflow(taskId) {
  // read the latest DB state and find the task
  let db   = readDB()
  let task = db.tasks.find(t => t.id === taskId)
  if (!task) return

  const { provider, model, prompt } = task
  const wisdom = (db.wisdomLog || []).slice(-12)
  const wisdomCtx = wisdom.length
    ? '\n\nLessons learned from past projects:\n' + wisdom.map(w => `- ${w}`).join('\n')
    : ''

  const log = (msg) => {
    saveTask(taskId, t => { t.thinkingLog.push(`[${ts()}] ${msg}`) })
  }

  try {
    // ═══════════════════════════════════════════════════════
    // X AXIS — Architect produces the branch specification
    // ═══════════════════════════════════════════════════════
    log('📐 [Architect] 要件分析・システム設計を開始...')

    const archRaw = await runAgent('architect',
      `Requirement:\n${prompt}${wisdomCtx}`,
      provider, model
    )
    const arch = parseJSON(archRaw)
    if (!arch?.files?.length) throw new Error('Architect returned invalid JSON or empty file list')

    saveTask(taskId, t => {
      t.architecture = arch
      t.files        = []
    })
    log(`📐 [Architect] 完了 — ${arch.files.length}ファイル / stack: ${Object.values(arch.techStack || {}).filter(Boolean).slice(0, 3).join(', ')}`)
    log(`📐 [Architect] 設計: ${arch.architecture}`)

    // ═══════════════════════════════════════════════════════
    // Z AXIS DEPTH 1 — Engineer implements every file
    // ═══════════════════════════════════════════════════════
    saveTask(taskId, t => { t.zDepth = 1 })
    log(`⚙️  [Engineer] Z=1: ${arch.files.length}ファイルの完全実装開始...`)

    const sortedFiles = [...arch.files]
      .sort((a, b) => (a.priority || 5) - (b.priority || 5))
      .slice(0, 12)  // max 12 files per task

    for (const spec of sortedFiles) {
      log(`⚙️  [Engineer] 実装: ${spec.path}`)

      const implPrompt = [
        `Project: ${arch.projectName}`,
        `Overall architecture: ${arch.architecture}`,
        `Tech stack: ${JSON.stringify(arch.techStack)}`,
        `Data models: ${JSON.stringify(arch.dataModels || [])}`,
        `API endpoints: ${JSON.stringify(arch.apiEndpoints || [])}`,
        `Implementation notes: ${arch.implementationNotes || 'none'}`,
        `Environment vars available: ${(arch.environmentVars || []).join(', ')}`,
        ``,
        `FILE TO IMPLEMENT`,
        `Path: ${spec.path}`,
        `Purpose: ${spec.purpose}`,
        `Exports: ${(spec.exports || []).join(', ')}`,
        `Depends on: ${(spec.dependencies || []).join(', ')}`,
        ``,
        `Original requirement: ${prompt}`,
      ].join('\n')

      let code = `// SKIPPED: generation not attempted`
      try {
        code = await runAgent('engineer', implPrompt, provider, model)
      } catch (err) {
        code = `// GENERATION ERROR for ${spec.path}\n// ${err.message}`
        log(`⚙️  [Engineer] ERROR ${spec.path}: ${err.message}`)
      }

      saveTask(taskId, t => {
        t.files.push({
          path:      spec.path,
          purpose:   spec.purpose,
          code,
          score:     null,
          critique:  null,
          zDepth:    1,
          refined:   false,
        })
      })
    }

    db   = readDB()
    task = db.tasks.find(t => t.id === taskId)
    log(`⚙️  [Engineer] Z=1完了 — ${task.files.length}ファイル生成済み`)

    // ═══════════════════════════════════════════════════════
    // Z AXIS REFINEMENT LOOP — critic → refine until quality
    // ═══════════════════════════════════════════════════════

    async function criticPass(zLabel) {
      log(`🔍 [Critic] Z=${zLabel}: 全${task.files.length}ファイルを厳格レビュー中...`)

      for (const file of task.files) {
        if (!file.code || file.code.startsWith('// GENERATION ERROR') || file.code.startsWith('// SKIPPED')) {
          file.score    = 0
          file.critique = { score: 0, summary: 'Generation failed', critical: ['Code was not generated'], major: [], minor: [], security: [], missing: [] }
          continue
        }

        const criticPrompt = [
          `Requirement: ${prompt}`,
          `Architecture: ${arch.architecture}`,
          `File: ${file.path}  (Purpose: ${file.purpose})`,
          ``,
          `--- CODE ---`,
          file.code,
        ].join('\n')

        try {
          const raw      = await runAgent('critic', criticPrompt, provider, model)
          const critique = parseJSON(raw)
          file.critique  = critique
          file.score     = critique?.score ?? 40
          const crit = critique?.critical?.length ?? 0
          const maj  = critique?.major?.length ?? 0
          log(`🔍 [Critic] ${file.path} → ${file.score}点 (critical:${crit} major:${maj})`)
        } catch (err) {
          file.score    = 30
          file.critique = { score: 30, summary: 'Review error', critical: [err.message], major: [], minor: [], security: [], missing: [] }
          log(`🔍 [Critic] ERROR ${file.path}: ${err.message}`)
        }

        saveTask(taskId, t => {
          const f = t.files.find(x => x.path === file.path)
          if (f) { f.score = file.score; f.critique = file.critique }
        })
      }

      const scores  = task.files.map(f => f.score ?? 0)
      const avg     = scores.reduce((a, b) => a + b, 0) / (scores.length || 1)
      const min     = Math.min(...scores)
      log(`🔍 [Critic] Z=${zLabel}レビュー完了 — 平均${avg.toFixed(1)}点 / 最低${min}点`)
      return { avg, min }
    }

    async function refinePass(zDepth) {
      const toRefine = task.files.filter(f => (f.score ?? 100) < 90)
      if (toRefine.length === 0) {
        log(`✨ [Refiner] Z=${zDepth}: 全ファイル基準クリア — スキップ`)
        return
      }
      log(`✨ [Refiner] Z=${zDepth}: ${toRefine.length}ファイルを改善中...`)

      for (const file of toRefine) {
        if (!file.critique) continue

        const refinePrompt = [
          `Requirements: ${prompt}`,
          `Architecture: ${arch.architecture}`,
          `File: ${file.path}  (Purpose: ${file.purpose})`,
          ``,
          `--- ORIGINAL CODE ---`,
          file.code,
          ``,
          `--- CRITIC REVIEW (score: ${file.score}) ---`,
          JSON.stringify(file.critique, null, 2),
          ``,
          `Fix all critical and major issues. Rewrite sections as needed.`,
        ].join('\n')

        try {
          const refined = await runAgent('refiner', refinePrompt, provider, model)
          file.code    = refined
          file.refined = true
          file.zDepth  = zDepth
          log(`✨ [Refiner] ${file.path} 改善完了`)
        } catch (err) {
          log(`✨ [Refiner] ERROR ${file.path}: ${err.message}`)
        }

        saveTask(taskId, t => {
          const f = t.files.find(x => x.path === file.path)
          if (f) { f.code = file.code; f.zDepth = file.zDepth; f.refined = file.refined }
        })
      }
    }

    // Force at least 3 rounds (Y_MIN_Z_DEPTH)
    let avgScore, minScore
    const firstCritic = await criticPass(1)
    avgScore = firstCritic.avg
    minScore = firstCritic.min

    for (let z = 2; z <= MAX_Z_DEPTH; z++) {
      // Refine any files below threshold
      await refinePass(z)
      // Re-critique
      const r = await criticPass(z)
      avgScore = r.avg
      minScore = r.min
      saveTask(taskId, t => { t.zDepth = z })
      task = readDB().tasks.find(t => t.id === taskId) || task

      // Stop early only if: min Z depth met AND quality sufficient
      if (z >= Y_MIN_Z_DEPTH && avgScore >= Y_COMMIT_THRESHOLD && minScore >= Y_MIN_FILE_SCORE) {
        log(`🎯 Z=${z}: 品質基準クリア — ループ終了`)
        break
      }
      if (z >= Y_MIN_Z_DEPTH && z >= MAX_Z_DEPTH) {
        log(`⚠️  Z=${z}: 最大深度到達`)
        break
      }
    }

    // ═══════════════════════════════════════════════════════
    // INTEGRATOR — cross-file consistency check
    // ═══════════════════════════════════════════════════════
    log(`🔗 [Integrator] ファイル間整合性チェック中...`)

    const fileSummaries = task.files.map(f => ({
      path:    f.path,
      purpose: f.purpose,
      snippet: f.code?.slice(0, 600) ?? '',
    }))

    let integration = null
    try {
      const intRaw  = await runAgent('integrator',
        `Architecture:\n${JSON.stringify(arch, null, 2)}\n\nFiles:\n${JSON.stringify(fileSummaries, null, 2)}`,
        provider, model
      )
      integration = parseJSON(intRaw)
      const is = integration?.overallScore ?? 70
      log(`🔗 [Integrator] スコア: ${is}% — ${integration?.summary ?? ''}`)
      if (integration?.issues?.length) {
        integration.issues.slice(0, 3).forEach(i => log(`🔗 [Integrator] ⚠  ${i.file} × ${i.other || ''}: ${i.problem}`))
      }
    } catch (err) {
      log(`🔗 [Integrator] ERROR: ${err.message}`)
    }

    saveTask(taskId, t => { t.integration = integration })

    // ═══════════════════════════════════════════════════════
    // FINAL SCORE & STATUS
    // ═══════════════════════════════════════════════════════
    const integBonus   = integration?.compatible ? 2 : integration ? -5 : 0
    const fileScores   = task.files.map(f => f.score ?? 0)
    const finalAvg     = fileScores.reduce((a, b) => a + b, 0) / (fileScores.length || 1)
    const finalMin     = Math.min(...fileScores)
    const finalScore   = Math.min(100, Math.round(finalAvg + integBonus))

    db   = readDB()
    task = db.tasks.find(t => t.id === taskId)
    if (!task) return

    task.score = finalScore
    task.diff  = [
      `Z深度: ${task.zDepth}`,
      `ファイル: ${task.files.length}`,
      `平均スコア: ${finalAvg.toFixed(1)}%`,
      `最低スコア: ${finalMin}%`,
      `整合性: ${integration?.overallScore ?? '?'}%`,
    ].join(' / ')

    const yEligible = task.zDepth >= Y_MIN_Z_DEPTH
      && finalScore    >= Y_COMMIT_THRESHOLD
      && finalMin      >= Y_MIN_FILE_SCORE

    if (yEligible) {
      task.status = 'pending_approval'
      task.thinkingLog.push(`[${ts()}] ✅ Y軸コミット待機 — スコア${finalScore}% Z=${task.zDepth} ファイル${task.files.length}個`)
    } else {
      task.status = 'needs_work'
      const why = []
      if (task.zDepth  < Y_MIN_Z_DEPTH)       why.push(`Z深度${task.zDepth} (必要:${Y_MIN_Z_DEPTH})`)
      if (finalScore   < Y_COMMIT_THRESHOLD)   why.push(`総合${finalScore}% (必要:${Y_COMMIT_THRESHOLD}%)`)
      if (finalMin     < Y_MIN_FILE_SCORE)     why.push(`最低ファイル${finalMin}% (必要:${Y_MIN_FILE_SCORE}%)`)
      task.thinkingLog.push(`[${ts()}] ⚠️  Y軸基準未達: ${why.join(', ')}`)
    }

    writeDB(db)

    // Auto-approve check
    const freshDB   = readDB()
    const freshTask = freshDB.tasks.find(t => t.id === taskId)
    if (freshTask?.status === 'pending_approval' && freshDB.settings.autoApprove) {
      const thresh = freshDB.settings.autoApproveThreshold ?? AUTO_APPROVE_DEFAULT
      if (finalScore >= thresh) {
        freshTask.thinkingLog.push(`[${ts()}] 🤖 自動Y軸コミット — スコア${finalScore}% >= ${thresh}%`)
        commitToY(freshDB, freshTask, 'auto')
        writeDB(freshDB)
      }
    }

  } catch (err) {
    saveTask(taskId, t => {
      t.status = 'error'
      t.thinkingLog.push(`[${ts()}] ❌ ${err.message}`)
    })
    console.error(`[task ${taskId}] Workflow error:`, err)
  }
}

// ─── Y-Axis Commit ────────────────────────────────────────────────────────
function commitToY(db, task, reason = 'manual') {
  task.status     = 'approved'
  task.approvedAt = new Date().toISOString()

  const fileScores = (task.files || []).map(f => f.score ?? 0)
  const avgScore   = fileScores.length ? fileScores.reduce((a, b) => a + b, 0) / fileScores.length : 0

  db.stream.unshift({
    id:           task.id,
    title:        task.prompt,
    projectName:  task.architecture?.projectName ?? '',
    description:  task.architecture?.description ?? '',
    techStack:    task.architecture?.techStack    ?? {},
    score:        task.score,
    zDepth:       task.zDepth,
    fileCount:    (task.files || []).length,
    files:        task.files,
    architecture: task.architecture,
    integration:  task.integration,
    provider:     task.provider,
    approvedAt:   task.approvedAt,
    reason,
  })

  // W-axis: record wisdom from this project
  const stackStr = Object.values(task.architecture?.techStack || {}).filter(Boolean).join('/')
  db.wisdomLog.push(
    `Approved project "${task.prompt.slice(0, 70)}" — ` +
    `${task.files?.length ?? 0} files, stack: ${stackStr}, ` +
    `Z=${task.zDepth}, avg score: ${avgScore.toFixed(0)}%`
  )
}

// ─── Create Task ──────────────────────────────────────────────────────────
function createTask(db, payload) {
  const settings = db.settings || defaultSettings()
  const taskId   = `task-${Date.now()}-${Math.floor(Math.random() * 9999)}`
  const task = {
    id:             taskId,
    prompt:         payload.prompt,
    originalPrompt: payload.originalPrompt ?? payload.prompt,
    provider:       payload.provider ?? settings.defaultProvider ?? 'openai',
    model:          payload.model    ?? settings.defaultModel    ?? null,
    status:         'running',
    // 5D axes
    xBranch:    payload.xBranch ?? 'main',
    yVersion:   db.stream.length,
    zDepth:     0,
    wConstraints: (db.wisdomLog || []).slice(-10),
    // content
    architecture: null,
    files:        [],
    integration:  null,
    // scores
    score:        null,
    diff:         null,
    // logs
    thinkingLog:  [],
    createdAt:    new Date().toISOString(),
    approvedAt:   null,
    parentId:     payload.parentId ?? null,
    source:       payload.source   ?? 'manual',
    feedback:     null,
  }
  db.tasks.push(task)
  writeDB(db)
  return taskId
}

// ─── Routes ───────────────────────────────────────────────────────────────

app.get('/api/state', (_req, res) => {
  const db = readDB()
  res.json({ tasks: db.tasks, stream: db.stream, wisdomLog: db.wisdomLog })
})

app.get('/api/settings', (_req, res) => {
  res.json(readDB().settings)
})

app.post('/api/settings', (req, res) => {
  const db = readDB()
  db.settings = { ...db.settings, ...req.body }
  writeDB(db)
  res.json(db.settings)
})

app.get('/api/providers', (_req, res) => {
  res.json({
    openai:          !!process.env.OPENAI_API_KEY,
    gemini:          !!process.env.GEMINI_API_KEY,
    lmstudio:        true,
    defaultProvider: process.env.DEFAULT_PROVIDER || 'openai',
    lmstudioUrl:     process.env.LMSTUDIO_URL || 'http://localhost:1234',
  })
})

app.post('/api/providers', (req, res) => {
  const { openaiKey, geminiKey, lmstudioUrl, defaultProvider } = req.body
  const envPath = path.join(__dirname, '..', '.env')
  let lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8').split('\n') : []
  const set = (k, v) => {
    const i = lines.findIndex(l => l.startsWith(k + '='))
    if (i >= 0) lines[i] = `${k}=${v}`; else lines.push(`${k}=${v}`)
  }
  if (openaiKey       != null) set('OPENAI_API_KEY',    openaiKey)
  if (geminiKey       != null) set('GEMINI_API_KEY',    geminiKey)
  if (lmstudioUrl     != null) set('LMSTUDIO_URL',      lmstudioUrl)
  if (defaultProvider != null) set('DEFAULT_PROVIDER',  defaultProvider)
  fs.writeFileSync(envPath, lines.filter(Boolean).join('\n') + '\n')
  dotenv.config({ override: true })
  res.json({ ok: true })
})

// Submit a new prompt → creates task + spawns deep workflow
app.post('/api/prompt', async (req, res) => {
  const { prompt, provider, model } = req.body
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt required' })

  const db     = readDB()
  const taskId = createTask(db, { prompt: prompt.trim(), provider, model })
  res.json({ taskId })

  // Run async — do NOT await
  runDeepWorkflow(taskId).catch(err => console.error(`[${taskId}] fatal:`, err))
})

app.get('/api/tasks/:id', (req, res) => {
  const task = readDB().tasks.find(t => t.id === req.params.id)
  if (!task) return res.status(404).json({ error: 'not found' })
  res.json(task)
})

// Manual Y-axis commit (approve)
app.post('/api/tasks/:id/approve', (req, res) => {
  const db   = readDB()
  const task = db.tasks.find(t => t.id === req.params.id)
  if (!task) return res.status(404).json({ error: 'not found' })
  if (!['pending_approval', 'needs_work', 'error'].includes(task.status)) {
    return res.status(400).json({ error: `Cannot approve task in state: ${task.status}` })
  }
  commitToY(db, task, 'manual')
  writeDB(db)
  res.json({ ok: true })
})

// Reject + retry with W-axis feedback
app.post('/api/tasks/:id/reject', async (req, res) => {
  const db   = readDB()
  const task = db.tasks.find(t => t.id === req.params.id)
  if (!task) return res.status(404).json({ error: 'not found' })

  const { feedback = '' } = req.body || {}
  task.status   = 'rejected'
  task.feedback = feedback

  if (feedback.trim()) db.wisdomLog.push(feedback.trim())

  const newId = createTask(db, {
    prompt:         task.originalPrompt ?? task.prompt,
    originalPrompt: task.originalPrompt ?? task.prompt,
    provider:       task.provider,
    model:          task.model,
    parentId:       task.id,
    source:         'reject-retry',
  })

  const db2     = readDB()
  const newTask = db2.tasks.find(t => t.id === newId)
  if (newTask && feedback.trim()) {
    newTask.thinkingLog.push(
      `[${ts()}] W軸: フィードバック反映 — "${feedback.trim()}"`
    )
    writeDB(db2)
  }

  res.json({ ok: true, newTaskId: newId })
  runDeepWorkflow(newId).catch(err => console.error(`[${newId}] retry fatal:`, err))
})

app.delete('/api/tasks/:id', (req, res) => {
  const db  = readDB()
  db.tasks  = db.tasks.filter(t => t.id !== req.params.id)
  writeDB(db)
  res.json({ ok: true })
})

app.delete('/api/stream/:id', (req, res) => {
  const db  = readDB()
  db.stream = db.stream.filter(s => s.id !== req.params.id)
  writeDB(db)
  res.json({ ok: true })
})

// Clear all
app.post('/api/reset', (_req, res) => {
  const db   = readDB()
  db.tasks   = []
  db.stream  = []
  writeDB(db)
  res.json({ ok: true })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Polyplex IDE backend — http://localhost:${PORT}`)
  console.log(`Y_COMMIT_THRESHOLD: ${Y_COMMIT_THRESHOLD}%  MIN_Z: ${Y_MIN_Z_DEPTH}  MAX_Z: ${MAX_Z_DEPTH}`)
})
