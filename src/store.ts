import { create } from 'zustand'
import axios from 'axios'
import type { Task, StreamItem, ProvidersConfig, OrchestratorState } from './types'

const API = '/api'

interface Store {
  tasks: Task[]
  stream: StreamItem[]
  providers: ProvidersConfig | null
  orchestrator: OrchestratorState | null
  polling: Map<string, ReturnType<typeof setInterval>>

  // Actions
  loadState: () => Promise<void>
  loadProviders: () => Promise<void>
  loadOrchestrator: () => Promise<void>
  saveProviders: (cfg: Partial<ProvidersConfig> & { openaiKey?: string; geminiKey?: string }) => Promise<void>

  startOrchestrator: (cfg: {
    seedPrompt: string
    provider: string
    model: string
    targetY: number
    infinite: boolean
    maxActive: number
    tickMs: number
    autoApproveThreshold: number
  }) => Promise<void>
  stopOrchestrator: () => Promise<void>

  submitPrompt: (prompt: string, provider: string, model: string) => Promise<string>
  pollTask: (taskId: string) => void
  stopPoll: (taskId: string) => void

  approveTask: (taskId: string) => Promise<void>
  rejectTask: (taskId: string, feedback: string) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
}

export const useStore = create<Store>((set, get) => ({
  tasks: [],
  stream: [],
  providers: null,
  orchestrator: null,
  polling: new Map(),

  loadState: async () => {
    const { data } = await axios.get(`${API}/state`)
    set({ tasks: data.tasks, stream: data.stream })
  },

  loadProviders: async () => {
    const { data } = await axios.get(`${API}/providers`)
    set({ providers: data })
  },

  loadOrchestrator: async () => {
    const { data } = await axios.get(`${API}/orchestrator`)
    set({ orchestrator: data })
  },

  saveProviders: async (cfg) => {
    await axios.post(`${API}/providers`, {
      openaiKey: cfg.openaiKey,
      geminiKey: cfg.geminiKey,
      lmstudioUrl: cfg.lmstudioUrl,
      defaultProvider: cfg.defaultProvider,
    })
    await get().loadProviders()
  },

  startOrchestrator: async (cfg) => {
    await axios.post(`${API}/orchestrator/start`, cfg)
    await get().loadOrchestrator()
    await get().loadState()
  },

  stopOrchestrator: async () => {
    await axios.post(`${API}/orchestrator/stop`)
    await get().loadOrchestrator()
  },

  submitPrompt: async (prompt, provider, model) => {
    const { data } = await axios.post(`${API}/prompt`, { prompt, provider, model })
    const taskId: string = data.taskId
    await get().loadState()
    get().pollTask(taskId)
    return taskId
  },

  pollTask: (taskId) => {
    const { polling } = get()
    if (polling.has(taskId)) return

    const interval = setInterval(async () => {
      try {
        const { data } = await axios.get<Task>(`${API}/tasks/${taskId}`)
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === taskId ? data : t)),
        }))
        if (data.status !== 'running') {
          get().stopPoll(taskId)
        }
      } catch {
        get().stopPoll(taskId)
      }
    }, 1500)

    set((s) => {
      const m = new Map(s.polling)
      m.set(taskId, interval)
      return { polling: m }
    })
  },

  stopPoll: (taskId) => {
    const { polling } = get()
    const interval = polling.get(taskId)
    if (interval) clearInterval(interval)
    set((s) => {
      const m = new Map(s.polling)
      m.delete(taskId)
      return { polling: m }
    })
  },

  approveTask: async (taskId) => {
    await axios.post(`${API}/tasks/${taskId}/approve`)
    await get().loadState()
  },

  rejectTask: async (taskId, feedback) => {
    const { data } = await axios.post(`${API}/tasks/${taskId}/reject`, { feedback })
    await get().loadState()
    if (data.newTaskId) {
      get().pollTask(data.newTaskId)
    }
  },

  deleteTask: async (taskId) => {
    get().stopPoll(taskId)
    await axios.delete(`${API}/tasks/${taskId}`)
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== taskId) }))
  },
}))
