// ─── 5D Git Axes ─────────────────────────────────────────────────────────
// X: horizontal — which branch/attempt
// Y: vertical   — the approved mainline
// Z: depth      — refinement round count per branch
// W: wisdom     — accumulated constraints from past work
// T: time       — version lineage

export type TaskStatus =
  | 'running'
  | 'pending_approval'
  | 'needs_work'
  | 'approved'
  | 'rejected'
  | 'error'

// ─── File-level types ────────────────────────────────────────────────────
export interface FileCritique {
  score:    number
  summary:  string
  critical: string[]
  major:    string[]
  minor:    string[]
  security: string[]
  missing:  string[]
}

export interface GeneratedFile {
  path:     string
  purpose:  string
  code:     string
  score:    number | null
  critique: FileCritique | null
  zDepth:   number
  refined:  boolean
  error?:   string
}

// ─── Architecture ────────────────────────────────────────────────────────
export interface TechStack {
  runtime:   string
  framework: string
  database:  string
  auth:      string
  testing?:  string
  other?:    string[]
}

export interface DataModel {
  name:      string
  fields:    Record<string, string>
  relations: string[]
}

export interface ApiEndpoint {
  method:      string
  path:        string
  auth:        boolean
  description: string
}

export interface Architecture {
  projectName:         string
  description:         string
  techStack:           TechStack
  architecture:        string
  dataModels:          DataModel[]
  apiEndpoints:        ApiEndpoint[]
  files:               { path: string; purpose: string; exports: string[]; dependencies: string[]; priority: number }[]
  environmentVars:     string[]
  implementationNotes: string
}

export interface IntegrationResult {
  overallScore: number
  compatible:   boolean
  issues:       { file: string; other: string; problem: string }[]
  missing:      string[]
  envVars:      string[]
  summary:      string
}

// ─── Task ─────────────────────────────────────────────────────────────────
export interface Task {
  id:             string
  prompt:         string
  originalPrompt: string
  provider:       string
  model:          string | null
  status:         TaskStatus
  // 5D axes
  xBranch:     string
  yVersion:    number
  zDepth:      number
  wConstraints: string[]
  // content
  architecture: Architecture | null
  files:        GeneratedFile[]
  integration:  IntegrationResult | null
  // scores
  score:    number | null
  diff:     string | null
  // meta
  thinkingLog: string[]
  createdAt:   string
  approvedAt:  string | null
  parentId:    string | null
  source:      string
  feedback:    string | null
}

// ─── Y-Axis Stream Item ───────────────────────────────────────────────────
export interface StreamItem {
  id:          string
  title:       string
  projectName: string
  description: string
  techStack:   TechStack
  score:       number | null
  zDepth:      number
  fileCount:   number
  files:       GeneratedFile[]
  architecture: Architecture | null
  integration:  IntegrationResult | null
  provider:    string
  approvedAt:  string
  reason:      string
}

// ─── Settings ─────────────────────────────────────────────────────────────
export interface Settings {
  defaultProvider:       string
  defaultModel:          string
  autoApprove:           boolean
  autoApproveThreshold:  number
}

export interface ProvidersConfig {
  openai:          boolean
  gemini:          boolean
  lmstudio:        boolean
  defaultProvider: string
  lmstudioUrl:     string
}
