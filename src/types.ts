export type TaskStatus = 'running' | 'pending_approval' | 'approved' | 'rejected' | 'error'

export interface ZTrial {
  id: string
  code: string
  ok: boolean
}

export interface Task {
  id: string
  prompt: string
  originalPrompt?: string
  provider: string
  model: string | null
  status: TaskStatus
  axis: string
  xPlan?: string[]
  zTrials: ZTrial[]
  wConstraints?: string[]
  best: string | null
  score: number | null
  diff: string | null
  thinkingLog: string[]
  createdAt: string
  approvedAt?: string
  feedback?: string
  parentId?: string
}

export interface StreamItem {
  id: string
  title: string
  score: number | null
  code: string | null
  diff: string | null
  provider: string
  approvedAt: string
}

export interface ProvidersConfig {
  openai: boolean
  gemini: boolean
  lmstudio: boolean
  defaultProvider: string
  lmstudioUrl: string
}

export interface OrchestratorState {
  enabled: boolean
  infinite: boolean
  targetY: number
  seedPrompt: string
  provider: string
  model: string
  maxActive: number
  tickMs: number
  autoApproveThreshold: number
  totalCreated: number
  lastTickAt: string | null
  statusMessage: string
}
