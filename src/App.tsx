import { useEffect, useState } from 'react'
import { Settings, Play, CheckCircle, XCircle, Trash2, RefreshCw, ChevronDown, ChevronRight, AlertTriangle, Zap } from 'lucide-react'
import { useStore } from './store'
import { SettingsPanel } from './components/SettingsPanel'
import type { Task, StreamItem, GeneratedFile } from './types'

// ─── colour maps ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  running:          'text-blue-400',
  pending_approval: 'text-amber-400',
  needs_work:       'text-red-400',
  approved:         'text-emerald-400',
  rejected:         'text-neutral-500',
  error:            'text-red-500',
}
const STATUS_LABEL: Record<string, string> = {
  running:          '実行中',
  pending_approval: '承認待ち',
  needs_work:       '要改善',
  approved:         '承認済み',
  rejected:         '却下',
  error:            'エラー',
}

function ScoreBadge({ score, small }: { score: number | null; small?: boolean }) {
  if (score === null) return <span className={`font-mono text-neutral-500 ${small ? 'text-xs' : 'text-sm'}`}>—</span>
  const c = score >= 95 ? 'text-emerald-400' : score >= 80 ? 'text-amber-400' : 'text-red-400'
  return <span className={`font-mono font-semibold ${c} ${small ? 'text-xs' : 'text-sm'}`}>{score.toFixed(0)}</span>
}

function ZDepthBar({ z, max = 5 }: { z: number; max?: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full ${i < z ? 'bg-blue-500' : 'bg-neutral-700'}`} />
      ))}
      <span className="ml-1 font-mono text-xs text-neutral-400">Z{z}</span>
    </div>
  )
}

function FileRow({ file, selected, onClick }: { file: GeneratedFile; selected: boolean; onClick: () => void }) {
  const dot = file.score === null ? 'bg-neutral-600' : file.score >= 85 ? 'bg-emerald-500' : file.score >= 60 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
        selected ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
      }`}
    >
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
      <span className="flex-1 truncate font-mono">{file.path}</span>
      <ScoreBadge score={file.score} small />
    </button>
  )
}

function TaskCard({ task, selected, onSelect, onApprove, onReject, onDelete }: {
  task: Task; selected: boolean
  onSelect: () => void; onApprove: () => void; onReject: () => void; onDelete: () => void
}) {
  return (
    <div
      className={`cursor-pointer rounded border transition-colors ${
        selected ? 'border-blue-500 bg-neutral-800' : 'border-neutral-700 hover:border-neutral-600'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold ${STATUS_COLOR[task.status] || 'text-neutral-400'}`}>
              {STATUS_LABEL[task.status] || task.status}
            </span>
            {task.architecture && (
              <span className="text-xs text-neutral-500 font-mono">{task.architecture.projectName}</span>
            )}
          </div>
          <p className="text-sm text-neutral-200 line-clamp-2">{task.prompt}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <ScoreBadge score={task.score} />
          {(task.files?.length ?? 0) > 0 && <span className="text-xs text-neutral-500">{task.files.length}f</span>}
        </div>
      </div>

      {task.zDepth > 0 && <div className="px-3 pb-2"><ZDepthBar z={task.zDepth} /></div>}

      {task.status === 'running' && (task.thinkingLog?.length ?? 0) > 0 && (
        <div className="border-t border-neutral-700 px-3 py-1.5">
          <p className="text-xs text-blue-300 truncate animate-pulse">
            {task.thinkingLog[task.thinkingLog.length - 1]}
          </p>
        </div>
      )}

      {task.status === 'pending_approval' && (
        <div className="flex gap-2 border-t border-neutral-700 px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={onApprove} className="flex items-center gap-1 rounded bg-emerald-700 hover:bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
            <CheckCircle size={12} /> 承認 (Y軸)
          </button>
          <button onClick={onReject} className="flex items-center gap-1 rounded bg-neutral-700 hover:bg-red-800 px-3 py-1 text-xs font-semibold text-neutral-200">
            <XCircle size={12} /> 却下
          </button>
        </div>
      )}

      <div className="flex justify-end px-3 pb-1" onClick={(e) => e.stopPropagation()}>
        <button onClick={onDelete} className="text-neutral-600 hover:text-red-400 p-1 rounded"><Trash2 size={11} /></button>
      </div>
    </div>
  )
}

function DetailPanel({ task }: { task: Task }) {
  const [activeFile, setActiveFile] = useState<GeneratedFile | null>(null)
  const [showCritique, setShowCritique] = useState(false)
  const [showLog, setShowLog] = useState(false)

  useEffect(() => { if ((task.files?.length ?? 0) > 0 && !activeFile) setActiveFile(task.files[0]) }, [task.files])
  useEffect(() => {
    if (activeFile && task.files) { const upd = task.files.find(f => f.path === activeFile.path); if (upd) setActiveFile(upd) }
  }, [task.files])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {task.architecture && (
        <div className="border-b border-neutral-700 px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-sm text-white">{task.architecture.projectName}</span>
            <ScoreBadge score={task.score} />
          </div>
          <p className="text-xs text-neutral-400 mb-2">{task.architecture.description}</p>
          <div className="flex flex-wrap gap-1">
            {[task.architecture.techStack.runtime, task.architecture.techStack.framework, task.architecture.techStack.database, task.architecture.techStack.auth]
              .filter(Boolean).map((t) => (
                <span key={t} className="rounded bg-neutral-800 border border-neutral-700 px-2 py-0.5 text-xs font-mono text-neutral-300">{t}</span>
              ))}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-48 flex-shrink-0 border-r border-neutral-700 overflow-y-auto py-2 px-1">
          <div className="text-xs uppercase tracking-widest text-neutral-600 px-2 mb-2">ファイル ({(task.files?.length ?? 0)})</div>
          {(task.files ?? []).map((f) => (
            <FileRow key={f.path} file={f} selected={activeFile?.path === f.path} onClick={() => setActiveFile(f)} />
          ))}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {activeFile ? (
            <>
              <div className="flex items-center justify-between border-b border-neutral-700 px-3 py-1.5 flex-shrink-0">
                <span className="font-mono text-xs text-neutral-300">{activeFile.path}</span>
                <div className="flex items-center gap-2">
                  {activeFile.refined && <span className="text-xs text-blue-400">refined</span>}
                  <ScoreBadge score={activeFile.score} small />
                </div>
              </div>
              {activeFile.critique && (
                <div className="border-b border-neutral-700 flex-shrink-0">
                  <button onClick={() => setShowCritique(!showCritique)} className="flex w-full items-center gap-1 px-3 py-1.5 text-xs text-neutral-400 hover:text-white">
                    {showCritique ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    批評
                    {activeFile.critique.critical.length > 0 && <span className="ml-1 rounded bg-red-900 px-1.5 text-red-300">critical {activeFile.critique.critical.length}</span>}
                    {activeFile.critique.major.length > 0 && <span className="ml-1 rounded bg-amber-900 px-1.5 text-amber-300">major {activeFile.critique.major.length}</span>}
                  </button>
                  {showCritique && (
                    <div className="px-3 pb-2 space-y-1">
                      <p className="text-xs text-neutral-300">{activeFile.critique.summary}</p>
                      {activeFile.critique.critical.map((c, i) => <p key={i} className="text-xs text-red-400">• {c}</p>)}
                      {activeFile.critique.major.map((c, i) => <p key={i} className="text-xs text-amber-400">• {c}</p>)}
                    </div>
                  )}
                </div>
              )}
              <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-neutral-200 whitespace-pre leading-relaxed">
                {activeFile.code || activeFile.error || '(空)'}
              </pre>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-neutral-600 text-sm">ファイルを選択してください</div>
          )}
        </div>
      </div>

      {(task.thinkingLog?.length ?? 0) > 0 && (
        <div className="border-t border-neutral-700 flex-shrink-0">
          <button onClick={() => setShowLog(!showLog)} className="flex w-full items-center gap-1 px-3 py-1.5 text-xs text-neutral-500 hover:text-white">
            {showLog ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            実行ログ ({task.thinkingLog?.length ?? 0})
          </button>
          {showLog && (
            <div className="max-h-40 overflow-y-auto px-3 pb-2 space-y-0.5">
              {(task.thinkingLog ?? []).map((l, i) => <p key={i} className="text-xs font-mono text-neutral-400">{l}</p>)}
            </div>
          )}
        </div>
      )}

      {task.integration && !task.integration.compatible && (
        <div className="border-t border-amber-800 bg-amber-950 px-3 py-2 flex-shrink-0">
          <div className="flex items-center gap-1 text-xs text-amber-400 font-semibold mb-1"><AlertTriangle size={12} /> 統合警告</div>
          {(task.integration.issues ?? []).slice(0, 3).map((iss, i) => (
            <p key={i} className="text-xs text-amber-300">{iss.file} ↔ {iss.other}: {iss.problem}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function StreamCard({ item, onDelete }: { item: StreamItem; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded border border-neutral-700 bg-neutral-900 text-xs">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-emerald-400 truncate">{item.projectName || item.title}</span>
            <span className="text-neutral-500">Z{item.zDepth} · {item.fileCount}f</span>
          </div>
          <p className="text-neutral-500 truncate">{item.description || ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <ScoreBadge score={item.score} small />
          {open ? <ChevronDown size={11} className="text-neutral-500" /> : <ChevronRight size={11} className="text-neutral-500" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-neutral-700 px-3 py-2 space-y-1">
          {item.reason && <p className="text-neutral-400 italic">{item.reason}</p>}
          <div className="flex flex-wrap gap-1 mt-1">
            {item.techStack && Object.values(item.techStack).filter(Boolean).map((v) => (
              <span key={v as string} className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-300">{v as string}</span>
            ))}
          </div>
          <button onClick={onDelete} className="mt-1 text-neutral-600 hover:text-red-400 flex items-center gap-1">
            <Trash2 size={10} /> 削除
          </button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const {
    tasks, stream, settings,
    loadState, loadProviders, loadSettings,
    submitPrompt, approveTask, rejectTask, deleteTask, deleteStreamItem, resetAll,
  } = useStore()

  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [prompt,        setPrompt]        = useState('')
  const [provider,      setProvider]      = useState('')
  const [loading,       setLoading]       = useState(false)
  const [backendOk,     setBackendOk]     = useState(true)
  const [selectedTask,  setSelectedTask]  = useState<Task | null>(null)
  const [rejectingId,   setRejectingId]   = useState<string | null>(null)
  const [feedbackText,  setFeedbackText]  = useState('')
  const [resetConfirm,  setResetConfirm]  = useState(false)

  useEffect(() => {
    const init = async () => {
      try { await Promise.all([loadState(), loadProviders(), loadSettings()]); setBackendOk(true) }
      catch { setBackendOk(false) }
    }
    init()
    const iv = setInterval(async () => {
      try { await loadState(); setBackendOk(true) }
      catch { setBackendOk(false) }
    }, 3000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (selectedTask) {
      const upd = tasks.find(t => t.id === selectedTask.id)
      if (upd) setSelectedTask(upd)
    }
  }, [tasks])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || loading) return
    setLoading(true)
    try { await submitPrompt(prompt.trim(), provider || undefined); setPrompt('') }
    finally { setLoading(false) }
  }

  const activeTasks = tasks.filter(t => ['running','pending_approval','needs_work'].includes(t.status))
  const doneTasks   = tasks.filter(t => ['rejected','error','approved'].includes(t.status))

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100 overflow-hidden">

      {/* Header */}
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <span className="font-mono text-sm font-bold text-white tracking-wide mr-2">PolyplexIDE</span>
        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${backendOk ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
        {!backendOk && <span className="text-xs text-red-400">サーバー未接続</span>}
        {settings?.autoApprove && (
          <span className="flex items-center gap-1 rounded bg-emerald-900 border border-emerald-700 px-2 py-0.5 text-xs text-emerald-300">
            <Zap size={10} /> 自動承認 {settings.autoApproveThreshold}%
          </span>
        )}
        <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent) } }}
            placeholder="プロジェクトの要件を入力… (Enterで実行 / Shift+Enterで改行)"
            rows={1}
            className="flex-1 resize-none rounded bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500"
          />
          <select value={provider} onChange={(e) => setProvider(e.target.value)}
            className="rounded bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300">
            <option value="">デフォルト</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
            <option value="lmstudio">LM Studio</option>
          </select>
          <button type="submit" disabled={loading || !prompt.trim()}
            className="flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-1.5 text-sm font-semibold transition-colors">
            <Play size={13} /> {loading ? '送信中…' : '実行'}
          </button>
        </form>
        <button onClick={() => setSettingsOpen(true)} className="rounded p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800">
          <Settings size={16} />
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Y-Stream */}
        <aside className="flex w-64 flex-shrink-0 flex-col border-r border-neutral-800 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Y軸ストリーム</span>
            <span className="text-xs font-mono text-neutral-600">{stream.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {stream.length === 0 && <p className="text-xs text-neutral-700 px-1 pt-2">承認されたプロジェクトがここに表示されます</p>}
            {stream.map((item) => <StreamCard key={item.id} item={item} onDelete={() => deleteStreamItem(item.id)} />)}
          </div>
        </aside>

        {/* Center: Tasks */}
        <main className="flex w-80 flex-shrink-0 flex-col border-r border-neutral-800 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">タスク</span>
            <button onClick={() => setResetConfirm(true)} className="text-neutral-600 hover:text-red-400 p-1 rounded" title="全リセット">
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {activeTasks.map((t) => (
              <TaskCard key={t.id} task={t} selected={selectedTask?.id === t.id}
                onSelect={() => setSelectedTask(t)}
                onApprove={() => approveTask(t.id)}
                onReject={() => { setRejectingId(t.id); setFeedbackText('') }}
                onDelete={() => { if (selectedTask?.id === t.id) setSelectedTask(null); deleteTask(t.id) }}
              />
            ))}
            {doneTasks.length > 0 && (
              <>
                <div className="border-t border-neutral-800 pt-2 text-xs uppercase text-neutral-600 tracking-widest px-1">完了 / 却下</div>
                {doneTasks.map((t) => (
                  <TaskCard key={t.id} task={t} selected={selectedTask?.id === t.id}
                    onSelect={() => setSelectedTask(t)}
                    onApprove={() => approveTask(t.id)}
                    onReject={() => { setRejectingId(t.id); setFeedbackText('') }}
                    onDelete={() => { if (selectedTask?.id === t.id) setSelectedTask(null); deleteTask(t.id) }}
                  />
                ))}
              </>
            )}
            {tasks.length === 0 && (
              <p className="text-xs text-neutral-700 px-1 pt-2">
                プロンプトを入力すると、AIがアーキテクチャ設計から実装・批評・改善まで自動で行います。
              </p>
            )}
          </div>
        </main>

        {/* Right: Detail */}
        <div className="flex-1 overflow-hidden bg-neutral-900">
          {selectedTask ? <DetailPanel task={selectedTask} /> : (
            <div className="flex h-full flex-col items-center justify-center text-neutral-700">
              <div className="text-4xl mb-2 font-mono">5D</div>
              <div className="text-sm">タスクを選択するとコードが表示されます</div>
              <div className="mt-4 text-xs text-neutral-800 space-y-0.5 text-center">
                <div>X: ブランチ分岐 &nbsp;&nbsp; Y: メインライン(承認済み)</div>
                <div>Z: 深化ループ (最低3回) &nbsp;&nbsp; W: 知見蓄積 &nbsp;&nbsp; T: 時間軸</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reject modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-96 rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
            <h3 className="font-semibold mb-3 text-sm">却下フィードバック</h3>
            <textarea autoFocus value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="問題点や要望を入力してください（再生成時に利用されます）" rows={4}
              className="w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-white placeholder-neutral-600 resize-none focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={() => setRejectingId(null)} className="rounded px-4 py-1.5 text-sm text-neutral-400 hover:text-white">キャンセル</button>
              <button onClick={async () => { await rejectTask(rejectingId, feedbackText); setRejectingId(null); setFeedbackText('') }}
                className="rounded bg-red-700 hover:bg-red-600 px-4 py-1.5 text-sm font-semibold text-white">却下して再生成</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset confirm */}
      {resetConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
            <h3 className="font-semibold mb-2 text-sm text-red-400">全データをリセット</h3>
            <p className="text-xs text-neutral-400 mb-4">全タスクとY軸ストリームが削除されます。元に戻せません。</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setResetConfirm(false)} className="rounded px-4 py-1.5 text-sm text-neutral-400 hover:text-white">キャンセル</button>
              <button onClick={async () => { await resetAll(); setResetConfirm(false) }}
                className="rounded bg-red-700 hover:bg-red-600 px-4 py-1.5 text-sm font-semibold text-white">リセット</button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
