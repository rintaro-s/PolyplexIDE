import { useState, useEffect } from 'react'
import { useStore } from '../store'
import type { ProvidersConfig } from '../types'

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { providers, saveProviders, settings, loadSettings, saveSettings } = useStore()

  const [keys, setKeys] = useState({
    openaiKey:       '',
    geminiKey:       '',
    lmstudioUrl:     providers?.lmstudioUrl || 'http://localhost:1234',
    defaultProvider: providers?.defaultProvider || 'openai',
  })

  const [cfg, setCfg] = useState({
    autoApprove:          settings?.autoApprove ?? false,
    autoApproveThreshold: settings?.autoApproveThreshold ?? 98,
    defaultModel:         settings?.defaultModel ?? '',
  })

  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (settings) setCfg({
      autoApprove:          settings.autoApprove,
      autoApproveThreshold: settings.autoApproveThreshold,
      defaultModel:         settings.defaultModel,
    })
  }, [settings])

  const handleSave = async () => {
    setSaving(true)
    await saveProviders(keys)
    await saveSettings({
      autoApprove:          cfg.autoApprove,
      autoApproveThreshold: cfg.autoApproveThreshold,
      defaultProvider:      keys.defaultProvider,
      defaultModel:         cfg.defaultModel,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const providerStatus = (p: ProvidersConfig | null, id: string) => {
    if (!p) return null
    if (id === 'openai')   return p.openai   ? '✓ 設定済み' : '未設定'
    if (id === 'gemini')   return p.gemini   ? '✓ 設定済み' : '未設定'
    if (id === 'lmstudio') return 'ローカル'
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30" onClick={onClose}>
      <div
        className="relative h-full w-96 overflow-y-auto bg-neutral-900 border-l border-neutral-700 text-neutral-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700 px-5 py-4">
          <h2 className="font-semibold tracking-wide text-sm uppercase">設定</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="space-y-8 p-5">

          {/* ── Workflow ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-4">ワークフロー</h3>

            {/* Auto-approve */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium">自動Y軸コミット</div>
                <div className="text-xs text-neutral-500">閾値以上で自動承認 (デフォルト無効)</div>
              </div>
              <button
                onClick={() => setCfg(c => ({ ...c, autoApprove: !c.autoApprove }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  cfg.autoApprove ? 'bg-emerald-600' : 'bg-neutral-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  cfg.autoApprove ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {cfg.autoApprove && (
              <div className="mb-3">
                <label className="block text-xs text-neutral-400 mb-1">自動承認閾値: <span className="text-white font-mono">{cfg.autoApproveThreshold}%</span></label>
                <input
                  type="range"
                  min={90} max={100} step={1}
                  value={cfg.autoApproveThreshold}
                  onChange={(e) => setCfg(c => ({ ...c, autoApproveThreshold: Number(e.target.value) }))}
                  className="w-full accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-neutral-600 mt-1">
                  <span>90%</span><span className="text-amber-500">推奨: 98%+</span><span>100%</span>
                </div>
              </div>
            )}
          </section>

          {/* ── LLM Provider ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-4">LLM プロバイダー</h3>

            <div className="mb-4">
              <label className="block text-xs text-neutral-400 mb-1">デフォルトプロバイダー</label>
              <select
                value={keys.defaultProvider}
                onChange={(e) => setKeys(f => ({ ...f, defaultProvider: e.target.value }))}
                className="w-full rounded bg-neutral-800 border border-neutral-600 px-3 py-2 text-sm text-white"
              >
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
                <option value="lmstudio">LM Studio (Local)</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-neutral-400 mb-1">デフォルトモデル (空欄=プロバイダーデフォルト)</label>
              <input
                type="text"
                value={cfg.defaultModel}
                onChange={(e) => setCfg(c => ({ ...c, defaultModel: e.target.value }))}
                placeholder="例: gpt-4o / gemini-2.0-flash"
                className="w-full rounded bg-neutral-800 border border-neutral-600 px-3 py-2 text-sm font-mono text-white placeholder-neutral-600"
              />
            </div>

            {/* OpenAI */}
            <div className="mb-3">
              <div className="flex justify-between mb-1">
                <label className="text-xs text-neutral-400">OpenAI API Key</label>
                <span className={`text-xs ${providers?.openai ? 'text-emerald-400' : 'text-neutral-500'}`}>
                  {providerStatus(providers, 'openai')}
                </span>
              </div>
              <input
                type="password"
                placeholder="sk-..."
                onChange={(e) => setKeys(f => ({ ...f, openaiKey: e.target.value }))}
                className="w-full rounded bg-neutral-800 border border-neutral-600 px-3 py-2 text-sm font-mono text-white placeholder-neutral-600"
              />
            </div>

            {/* Gemini */}
            <div className="mb-3">
              <div className="flex justify-between mb-1">
                <label className="text-xs text-neutral-400">Gemini API Key</label>
                <span className={`text-xs ${providers?.gemini ? 'text-emerald-400' : 'text-neutral-500'}`}>
                  {providerStatus(providers, 'gemini')}
                </span>
              </div>
              <input
                type="password"
                placeholder="AIza..."
                onChange={(e) => setKeys(f => ({ ...f, geminiKey: e.target.value }))}
                className="w-full rounded bg-neutral-800 border border-neutral-600 px-3 py-2 text-sm font-mono text-white placeholder-neutral-600"
              />
            </div>

            {/* LM Studio */}
            <div className="mb-3">
              <div className="flex justify-between mb-1">
                <label className="text-xs text-neutral-400">LM Studio URL</label>
                <span className="text-xs text-neutral-500">ローカル</span>
              </div>
              <input
                type="text"
                value={keys.lmstudioUrl}
                onChange={(e) => setKeys(f => ({ ...f, lmstudioUrl: e.target.value }))}
                className="w-full rounded bg-neutral-800 border border-neutral-600 px-3 py-2 text-sm font-mono text-white"
              />
            </div>
          </section>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2 text-sm font-semibold text-white transition-colors"
          >
            {saved ? '✓ 保存しました' : saving ? '保存中...' : '保存'}
          </button>

          <p className="text-xs text-neutral-600">
            APIキーはサーバー側の .env に保存されます。
          </p>
        </div>
      </div>
    </div>
  )
}

