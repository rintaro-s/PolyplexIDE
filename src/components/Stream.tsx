import { useState } from 'react'
import { useStore } from '../store'

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  if (!code) return null
  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-blue-600 hover:underline"
      >
        {expanded ? 'コードを隠す' : 'コードを表示'}
      </button>
      {expanded && (
        <div className="relative mt-1">
          <pre className="max-h-56 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed">
            <code>{code}</code>
          </pre>
          <button
            onClick={() => {
              navigator.clipboard.writeText(code)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            className="absolute right-2 top-2 rounded border border-gray-200 bg-white px-2 py-0.5 text-xs hover:bg-gray-50"
          >
            {copied ? '✓' : 'コピー'}
          </button>
        </div>
      )}
    </div>
  )
}

export function Stream() {
  const { stream } = useStore()

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-white px-5 py-3">
        <h2 className="font-semibold">Y軸 — Mainstream</h2>
        <p className="text-xs text-gray-500">承認済みのコードのみが存在します</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {stream.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            まだ承認済みのコードはありません
          </div>
        ) : (
          <div className="divide-y">
            {stream.map((item, i) => (
              <div key={item.id} className="px-5 py-4 bg-white hover:bg-gray-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 tabular-nums">
                        Y-{String(stream.length - i).padStart(4, '0')}
                      </span>
                      <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700">
                        approved
                      </span>
                      <span className="text-xs uppercase text-gray-400">{item.provider}</span>
                    </div>
                    <p className="mt-1 text-sm">{item.title}</p>
                    {item.diff && (
                      <p className="mt-0.5 text-xs text-gray-500">{item.diff}</p>
                    )}
                    {item.code && <CodeBlock code={item.code} />}
                  </div>
                  <div className="shrink-0 text-right text-xs text-gray-400">
                    {item.score != null && (
                      <p className="font-medium text-gray-600">{item.score}%</p>
                    )}
                    <p>{new Date(item.approvedAt).toLocaleString('ja-JP')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
