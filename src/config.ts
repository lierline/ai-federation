import { config as loadEnv } from 'dotenv'

// .env.local(키 보관, gitignore) 우선 → .env 폴백. 기존 process.env 는 덮지 않음.
loadEnv({ path: '.env.local' })
loadEnv()

export const models = {
  claudeWorker: () => process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
  openaiWorker: () => process.env.OPENAI_MODEL || 'gpt-4o-mini',
  geminiWorker: () => process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  head: () => process.env.HEAD_MODEL || 'claude-opus-4-8',
}

export const limits = {
  maxTokens: () => Number(process.env.MAX_TOKENS) || 1200,
  workerTimeoutMs: () => Number(process.env.WORKER_TIMEOUT_MS) || 30_000,
  headTimeoutMs: () => Number(process.env.HEAD_TIMEOUT_MS) || 60_000,
}

/** Gemini 키 — GOOGLE_API_KEY 우선, 없으면 GEMINI_API_KEY 폴백(플랫폼별 명칭 차이 흡수). */
export function geminiKey(): string | undefined {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || undefined
}

/** 누락된 키를 사람이 읽을 수 있게 반환(실행 전 점검). */
export function missingKeys(): string[] {
  const m: string[] = []
  if (!process.env.ANTHROPIC_API_KEY) m.push('ANTHROPIC_API_KEY')
  if (!process.env.OPENAI_API_KEY) m.push('OPENAI_API_KEY')
  if (!geminiKey()) m.push('GOOGLE_API_KEY')
  return m
}

/** 워커 호출에 타임아웃을 씌운다(한 제공자가 늘어져도 전체가 멈추지 않게). */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} 타임아웃(${ms}ms)`)), ms)),
  ])
}
