export const PROVIDER_IDS = ['claude', 'openai', 'gemini'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export interface WorkerResult {
  provider: ProviderId
  model: string
  ok: boolean
  text: string
  error?: string
  ms: number
}

export interface ReliabilityJudgment {
  provider: ProviderId
  reliability: number // 0..1
  rationale: string
}

export interface HeadReview {
  rankings: ReliabilityJudgment[]
  consensus: string
  conflicts: string
  finalAnswer: string
  confidence: number // 0..1
}

export interface FederationResult {
  question: string
  workers: WorkerResult[]
  head: HeadReview | null
  headError?: string
  ms: number
}

export type EnsembleTier = 'head' | 'consensus' | 'single'

export interface EnsembleResult {
  text: string
  tier: EnsembleTier
  fastModels: string[]
  headUsed: boolean
  degraded: boolean
}
