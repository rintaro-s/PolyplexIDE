import { useState } from 'react'
import { useStore } from '../store'

const PROVIDERS = ['openai', 'gemini', 'lmstudio'] as const

export function PromptBar() {
  const { submitPrompt, providers } = useStore()
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState(providers?.defaultProvider || 'openai')
  const [model, setModel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || loading) return
    setError(null)
    setLoading(true)
    try {
      await submitPrompt(prompt.trim(), provider, model.trim())
      setPrompt('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-b bg-white px-5 py-3">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1.5 text-sm"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p === 'lmstudio' ? 'LM Studio' : p === 'openai' ? 'OpenAI' : 'Gemini'}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="モデル名（空白=デフォルト）"
            className="w-32 rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-500"
          />
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e as never)
            }}
            placeholder="実装したい機能を自然言語で記述してください... (Ctrl+Enter で実行)"
            rows={2}
            className="w-full rounded border border-gray-200 px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="self-start rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
        >
          {loading ? '送信中...' : '実行'}
        </button>
      </div>
    </form>
  )
}
