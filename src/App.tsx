import { useEffect, useState } from 'react'
import { useStore } from './store'
import { PromptBar } from './components/PromptBar'
import { DecisionDeck } from './components/DecisionDeck'
import { Stream } from './components/Stream'
import { AxisStatus } from './components/AxisStatus'
import { SettingsPanel } from './components/SettingsPanel'
import { OrchestratorPanel } from './components/OrchestratorPanel'

function App() {
  const { loadState, loadProviders, loadOrchestrator } = useStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [backendError, setBackendError] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        await loadState()
        await loadProviders()
        await loadOrchestrator()
      } catch {
        setBackendError(true)
      }
    }
    init()
    const interval = setInterval(async () => {
      try {
        await loadState()
        await loadOrchestrator()
        setBackendError(false)
      } catch {
        setBackendError(true)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [loadState, loadProviders, loadOrchestrator])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-100">
      <header className="flex items-center justify-between border-b bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold tracking-tight">Polyplex IDE</span>
          <span className="text-xs text-gray-400">TensorGit 4D</span>
          {backendError && (
            <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">
              バックエンド未接続 — npm run dev:server を起動してください
            </span>
          )}
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          LLM 設定
        </button>
      </header>
      <AxisStatus />
      <OrchestratorPanel />
      <PromptBar />
      <div className="flex min-h-0 flex-1">
        <div className="flex w-1/2 flex-col border-r"><DecisionDeck /></div>
        <div className="flex w-1/2 flex-col"><Stream /></div>
      </div>
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

export default App
