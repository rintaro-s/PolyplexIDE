import { useStore } from '../store'

const AXIS = [
  { key: 'Y', label: 'Y軸 Mainstream', owner: 'Director', desc: '承認済みの本番コード' },
  { key: 'X', label: 'X軸 Parallel Task', owner: 'Manager AI', desc: '機能実装・バグ修正が並走' },
  { key: 'Z', label: 'Z軸 Quantum Trial', owner: 'Generator Swarm', desc: '複数パターンを同時生成' },
  { key: 'W', label: 'W軸 Context & Wisdom', owner: 'Archivist AI', desc: '拒否理由・制約を学習' },
] as const

export function AxisStatus() {
  const { tasks, stream, orchestrator } = useStore()

  const running = tasks.filter((t) => t.status === 'running').length
  const pending = tasks.filter((t) => t.status === 'pending_approval').length
  const zCount = tasks.reduce((n, t) => n + t.zTrials.filter((z) => z.ok).length, 0)
  const wisdom = tasks.filter((t) => t.status === 'rejected' && t.feedback).length
  const withPlan = tasks.filter((t) => (t.xPlan?.length || 0) > 0).length

  const counts: Record<string, string> = {
    Y: `${stream.length} commits`,
    X: running + pending > 0 ? `${running + pending} タスク稼働 / plan:${withPlan}` : 'アイドル',
    Z: zCount > 0 ? `${zCount} トライアル生成済み` : 'アイドル',
    W: wisdom > 0 ? `${wisdom} 制約を学習` : '待機中',
  }

  return (
    <div className="border-b bg-white px-5 py-3">
      <div className="flex items-center gap-6">
        {AXIS.map((a) => (
          <div key={a.key} className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-gray-400">{a.key}</span>
            <div>
              <p className="text-xs font-medium">{a.owner}</p>
              <p className="text-xs text-gray-400">{counts[a.key]}</p>
            </div>
          </div>
        ))}
        <div className="ml-auto text-xs text-gray-500">
          Director: {orchestrator?.enabled ? 'AUTO' : 'MANUAL'}
        </div>
      </div>
    </div>
  )
}
