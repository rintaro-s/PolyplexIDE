import { useState } from 'react'
import { useStore } from '../store'
import type { Task } from '../types'

const statusLabel: Record<Task['status'], string> = {
  running: '処理中',
  pending_approval: '承認待ち',
  approved: '承認済み',
  rejected: '拒否済み',
  error: 'エラー',
}

const statusColor: Record<Task['status'], string> = {
  running: 'text-blue-600 bg-blue-50',
  pending_approval: 'text-amber-700 bg-amber-50',
  approved: 'text-green-700 bg-green-50',
  rejected: 'text-gray-500 bg-gray-100',
  error: 'text-red-600 bg-red-50',
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="relative">
      <pre className="max-h-64 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute right-2 top-2 rounded border border-gray-200 bg-white px-2 py-0.5 text-xs hover:bg-gray-50"
      >
        {copied ? 'コピー済み' : 'コピー'}
      </button>
    </div>
  )
}

function TaskCard({ task }: { task: Task }) {
  const { approveTask, rejectTask, deleteTask } = useStore()
  const [showCode, setShowCode] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [rejectMode, setRejectMode] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [acting, setActing] = useState(false)

  const handleApprove = async () => {
    setActing(true)
    await approveTask(task.id)
    setActing(false)
  }

  const handleReject = async () => {
    setActing(true)
    await rejectTask(task.id, feedback)
    setFeedback('')
    setRejectMode(false)
    setActing(false)
  }

  return (
    <div className="border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{task.prompt}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
            <span
              className={`rounded px-1.5 py-0.5 font-medium ${statusColor[task.status]}`}
            >
              {statusLabel[task.status]}
            </span>
            <span className="uppercase">{task.provider}</span>
            {task.score != null && <span>スコア {task.score}%</span>}
            {task.parentId && <span className="text-gray-400">再生成</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {task.status === 'running' && (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
          )}
          <button
            onClick={() => deleteTask(task.id)}
            className="ml-1 rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-500"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Z trials */}
      {task.zTrials.length > 0 && (
        <div className="flex gap-1.5 border-t px-4 py-2">
          {task.zTrials.map((z) => (
            <span
              key={z.id}
              className={`rounded px-1.5 py-0.5 text-xs font-mono ${
                z.ok ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-400 line-through'
              }`}
            >
              {z.id}
            </span>
          ))}
          <span className="text-xs text-gray-400">
            {task.zTrials.filter((z) => z.ok).length}/{task.zTrials.length} 成功
          </span>
        </div>
      )}

      {task.xPlan && task.xPlan.length > 0 && (
        <div className="border-t px-4 py-2">
          <p className="text-[11px] font-medium text-gray-500">X軸 Plan</p>
          <ul className="mt-1 list-disc pl-4">
            {task.xPlan.slice(0, 3).map((step, i) => (
              <li key={`${task.id}-x-${i}`} className="text-xs text-gray-600">{step}</li>
            ))}
          </ul>
        </div>
      )}

      {task.wConstraints && task.wConstraints.length > 0 && (
        <div className="border-t px-4 py-2">
          <p className="text-[11px] font-medium text-gray-500">W軸 Constraints</p>
          <p className="mt-1 text-xs text-gray-600">{task.wConstraints.slice(0, 2).join(' / ')}</p>
        </div>
      )}

      {/* Diff summary */}
      {task.diff && (
        <div className="border-t px-4 py-2 text-xs text-gray-600">
          <span className="text-gray-400">評価: </span>{task.diff}
        </div>
      )}

      {/* Toggles */}
      <div className="flex gap-3 border-t px-4 py-2">
        {task.best && (
          <button
            onClick={() => setShowCode((v) => !v)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showCode ? 'コードを隠す' : 'コードを見る'}
          </button>
        )}
        {task.thinkingLog.length > 0 && (
          <button
            onClick={() => setShowLog((v) => !v)}
            className="text-xs text-gray-500 hover:underline"
          >
            {showLog ? 'ログを隠す' : `ログ (${task.thinkingLog.length})`}
          </button>
        )}
      </div>

      {/* Code */}
      {showCode && task.best && (
        <div className="border-t px-4 py-3">
          <CodeBlock code={task.best} />
        </div>
      )}

      {/* Thinking log */}
      {showLog && (
        <div className="border-t bg-gray-50 px-4 py-3">
          <ul className="space-y-0.5">
            {task.thinkingLog.map((line, i) => (
              <li key={i} className="text-xs text-gray-600">
                <span className="mr-2 text-gray-400">{i + 1}.</span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* God buttons */}
      {task.status === 'pending_approval' && (
        <div className="border-t px-4 py-3">
          {rejectMode ? (
            <div className="space-y-2">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="拒否の理由（Archivist に学習させる）"
                rows={2}
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleReject}
                  disabled={acting}
                  className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  拒否して再生成
                </button>
                <button
                  onClick={() => setRejectMode(false)}
                  className="rounded border px-3 py-1.5 text-xs"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={acting}
                className="rounded bg-green-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setRejectMode(true)}
                className="rounded border border-gray-200 px-4 py-1.5 text-xs font-medium hover:bg-gray-50"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function DecisionDeck() {
  const { tasks } = useStore()
  const active = tasks.filter((t) => ['running', 'pending_approval'].includes(t.status))
  const done = tasks.filter((t) => ['rejected', 'error'].includes(t.status))

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-white px-5 py-3">
        <h2 className="font-semibold">Decision Deck</h2>
        <p className="text-xs text-gray-500">
          X / Z軸で処理中のタスク — 承認するとY軸に統合されます
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {active.length === 0 && done.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            タスクはありません。上のプロンプトバーから指示を入力してください。
          </div>
        )}

        {active.length > 0 && (
          <div>
            <p className="sticky top-0 bg-gray-50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 border-b">
              処理中 / 承認待ち
            </p>
            <div className="divide-y">
              {active.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          </div>
        )}

        {done.length > 0 && (
          <div>
            <p className="sticky top-0 bg-gray-50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 border-b">
              失敗 / 却下
            </p>
            <div className="divide-y">
              {done.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
