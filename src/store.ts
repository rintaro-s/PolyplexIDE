import { create } from 'zustand'
import axios from 'axios'
import type { Task, StreamItem, ProvidersConfig, Settings } from './types'

const API = '/api'

interface Store {
  tasks:     Task[]
  stream:    StreamItem[]
  providers: ProvidersConfig | null
  settings:  Settings | null
  polling:   Map<string, ReturnType<typeof setInterval>>

  loadState:     () => Promise<void>
  loadProviders: () => Promise<void>
  loadSettings:  () => Promise<void>

  saveProviders: (cfg: Partial<ProvidersConfig> & { openaiKey?: string; geminiKey?: string }) => Promise<void>
  saveSettings:  (s: Partial<Settings>) => Promise<void>

  submitPrompt: (prompt: string, provider?: string, model?: string) => Promise<string>
  pollTask:     (taskId: string) => void
  stopPoll:     (taskId: string) => void

  approveTask: (taskId: string) => Promise<void>
  rejectTask:  (taskId: string, feedback: string) => Promise<void>
  deleteTask:  (taskId: string) => Promise<void>

  deleteStreamItem: (id: string) => Promise<void>
  resetAll:         () => Promise<void>
}

export const useStore = create<Store>((set, get) => ({
  tasks:     [],
  stream:    [],
  providers: null,
  settings:  null,
  polling:   new Map(),

  loadState: async () => {
    const { data } = await axios.get(`${API}/state`)
    set({ tasks: data.tasks, stream: data.stream })
  },

  loadProviders: async () => {
    const { data } = await axios.get(`${API}/providers`)
    set({ providers: data })
  },

  loadSettings: async () => {
    const { data } = await axios.get(`${API}/settings`)
    set({ settings: data })
  },

  saveProviders: async (cfg) => {
    await axios.post(`${API}/providers`, {
      openaiKey:       cfg.openaiKey,
      geminiKey:       cfg.geminiKey,
      lmstudioUrl:     cfg.lmstudioUrl,
      defaultProvider: cfg.defaultProvider,
    })
    await get().loadProviders()
  },

  saveSettings: async (s) => {
    await axios.post(`${API}/settings`, s)
    await get().loadSettings()
  },

  submitPrompt: async (prompt, provider, model) => {
    const { data } = await axios.post(`${API}/prompt`, { prompt, provider, model })
    const taskId: string = data.taskId
    await get().loadState()
    get().pollTask(taskId)
    return taskId
  },

  pollTask: (taskId) => {
    if (get().polling.has(taskId)) return
    const interval = setInterval(async () => {
      try {
        const { data } = await axios.get<Task>(`${API}/tasks/${taskId}`)
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? data : t)) }))
        if (data.status !== 'running') get().stopPoll(taskId)
      } catch {
        get().stopPoll(taskId)
      }
    }, 2000)
    set((s) => {
      const m = new Map(s.polling)
      m.set(taskId, interval)
      return { polling: m }
    })
  },

  stopPoll: (taskId) => {
    const interval = get().polling.get(taskId)
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
    if (data.newTaskId) get().pollTask(data.newTaskId)
  },

  deleteTask: async (taskId) => {
    get().stopPoll(taskId)
    await axios.delete(`${API}/tasks/${taskId}`)
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== taskId) }))
  },

  deleteStreamItem: async (id) => {
    await axios.delete(`${API}/stream/${id}`)
    set((s) => ({ stream: s.stream.filter((i) => i.id !== id) }))
  },

  resetAll: async () => {
    await axios.post(`${API}/reset`)
    set({ tasks: [], stream: [] })
  },
}))
