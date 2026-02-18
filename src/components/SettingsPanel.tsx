import { useState } from 'react'
import { useStore } from '../store'
import type { ProvidersConfig } from '../types'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'gemini', label: 'Gemini', placeholder: 'AIza...' },
  { id: 'lmstudio', label: 'LM Studio (Local)', placeholder: 'http://localhost:1234' },
]

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { providers, saveProviders } = useStore()
  const [form, setForm] = useState<{
    openaiKey: string
    geminiKey: string
    lmstudioUrl: string
    defaultProvider: string
  }>({
    openaiKey: '',
    geminiKey: '',
    lmstudioUrl: providers?.lmstudioUrl || 'http://localhost:1234',
    defaultProvider: providers?.defaultProvider || 'openai',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await saveProviders(form)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const status = (p: ProvidersConfig | null, id: string) => {
    if (!p) return null
    if (id === 'openai') return p.openai ? '設定済み' : '未設定'
    if (id === 'gemini') return p.gemini ? '設定済み' : '未設定'
    if (id === 'lmstudio') return 'ローカル'
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/20" onClick={onClose}>
      <div
        className="relative mt-0 h-full w-96 overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">LLM 設定</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
              デフォルトプロバイダー
            </label>
            <select
              value={form.defaultProvider}
              onChange={(e) => setForm((f) => ({ ...f, defaultProvider: e.target.value }))}
              className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="lmstudio">LM Studio (Local)</option>
            </select>
          </div>

          <div className="space-y-4">
            {PROVIDERS.map((p) => (
              <div key={p.id}>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {p.label}
                  </label>
                  <span
                    className={`text-xs ${
                      status(providers, p.id) === '設定済み' || status(providers, p.id) === 'ローカル'
                        ? 'text-green-600'
                        : 'text-gray-400'
                    }`}
                  >
                    {status(providers, p.id)}
                  </span>
                </div>
                {p.id === 'lmstudio' ? (
                  <input
                    type="text"
                    value={form.lmstudioUrl}
                    onChange={(e) => setForm((f) => ({ ...f, lmstudioUrl: e.target.value }))}
                    placeholder={p.placeholder}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-sm font-mono"
                  />
                ) : (
                  <input
                    type="password"
                    placeholder={`APIキーを入力 (${p.placeholder})`}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [`${p.id}Key`]: e.target.value,
                      }))
                    }
                    className="w-full rounded border border-gray-200 px-3 py-2 text-sm font-mono"
                  />
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {saved ? '保存しました' : saving ? '保存中...' : '保存'}
          </button>

          <p className="text-xs text-gray-400">
            APIキーはサーバー側の .env ファイルに保存されます。
            LM Studio は localhost での起動が必要です。
          </p>
        </div>
      </div>
    </div>
  )
}
