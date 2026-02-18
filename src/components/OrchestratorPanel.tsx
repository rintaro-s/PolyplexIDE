import { useMemo, useState } from 'react'
import { useStore } from '../store'

export function OrchestratorPanel() {
  const { orchestrator, startOrchestrator, stopOrchestrator, stream, tasks } = useStore()

  const [seedPrompt, setSeedPrompt] = useState('既存コードを改善し、テスト可能な実装を提案する')
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('')
  const [targetY, setTargetY] = useState(3)
  const [infinite, setInfinite] = useState(false)
  const [maxActive, setMaxActive] = useState(2)
  const [tickMs, setTickMs] = useState(8000)
  const [autoApproveThreshold, setAutoApproveThreshold] = useState(93)
  const [submitting, setSubmitting] = useState(false)

  const activeCount = useMemo(
    () => tasks.filter((t) => t.status === 'running' || t.status === 'pending_approval').length,
    [tasks]
  )

  const handleStart = async () => {
    setSubmitting(true)
    try {
      await startOrchestrator({
        seedPrompt: seedPrompt.trim(),
        provider,
        model: model.trim(),
        targetY,
        infinite,
        maxActive,
        tickMs,
        autoApproveThreshold,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleStop = async () => {
    setSubmitting(true)
    try {
      await stopOrchestrator()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="border-b bg-white px-5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Autonomous Director</h2>
          <p className="text-xs text-gray-500">アプリ側で継続指示。Y軸目標件数または無限実行を制御。</p>
        </div>
        <div className="text-xs text-gray-500">
          Y: {stream.length} / Active: {activeCount}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-8">
        <input
          value={seedPrompt}
          onChange={(e) => setSeedPrompt(e.target.value)}
          placeholder="自律実行の基本指示"
          className="rounded border border-gray-200 px-2 py-1.5 text-sm md:col-span-3"
        />
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="rounded border border-gray-200 px-2 py-1.5 text-sm"
        >
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
          <option value="lmstudio">LM Studio</option>
        </select>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="モデル(任意)"
          className="rounded border border-gray-200 px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          min={1}
          value={targetY}
          onChange={(e) => setTargetY(Number(e.target.value))}
          className="rounded border border-gray-200 px-2 py-1.5 text-sm"
          title="Y目標"
        />
        <label className="flex items-center justify-center gap-1 rounded border border-gray-200 px-2 py-1.5 text-xs">
          <input type="checkbox" checked={infinite} onChange={(e) => setInfinite(e.target.checked)} />
          無限
        </label>
        <div className="flex gap-2">
          <button
            onClick={handleStart}
            disabled={submitting}
            className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-gray-700 disabled:opacity-50"
          >
            開始
          </button>
          <button
            onClick={handleStop}
            disabled={submitting}
            className="rounded border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
          >
            停止
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <label className="flex items-center gap-1">
          maxActive
          <input
            type="number"
            min={1}
            max={8}
            value={maxActive}
            onChange={(e) => setMaxActive(Number(e.target.value))}
            className="w-14 rounded border border-gray-200 px-1 py-1"
          />
        </label>
        <label className="flex items-center gap-1">
          tickMs
          <input
            type="number"
            min={2000}
            step={1000}
            value={tickMs}
            onChange={(e) => setTickMs(Number(e.target.value))}
            className="w-20 rounded border border-gray-200 px-1 py-1"
          />
        </label>
        <label className="flex items-center gap-1">
          autoApprove&gt;=
          <input
            type="number"
            min={1}
            max={100}
            value={autoApproveThreshold}
            onChange={(e) => setAutoApproveThreshold(Number(e.target.value))}
            className="w-14 rounded border border-gray-200 px-1 py-1"
          />
        </label>
        {orchestrator?.enabled ? (
          <span className="rounded bg-green-50 px-2 py-0.5 text-green-700">稼働中</span>
        ) : (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">停止中</span>
        )}
        {orchestrator?.statusMessage && <span>{orchestrator.statusMessage}</span>}
      </div>
    </section>
  )
}
