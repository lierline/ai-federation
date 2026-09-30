import { config as loadEnv } from 'dotenv'
import { hasKey } from './providers.js'

// .env.local(키 보관, gitignore) 우선 → .env 폴백. 기존 process.env 는 덮지 않음.
// 🔑 명령줄 · 평가 전용. 제품(Next.js)은 자기 환경변수를 쓰므로 index 에서는 불러오지 않는다.
export function loadLocalEnv(): void {
  loadEnv({ path: '.env.local', quiet: true })
  loadEnv({ quiet: true })
}

export const limits = {
  maxTokens: () => Number(process.env.MAX_TOKENS) || 1200,
  workerTimeoutMs: () => Number(process.env.WORKER_TIMEOUT_MS) || 30_000,
  headTimeoutMs: () => Number(process.env.HEAD_TIMEOUT_MS) || 60_000,
  /** 관리자 종합 앞 3사 초안 한도 = 최종본 한도 × 이 값(기본 1: 예전과 같음) */
  draftHeadroom: () => Number(process.env.AIFED_DRAFT_HEADROOM) || 1,
  /** 3사 초안에 분량 안내를 붙일지('1' 이면 켬 · 기본 끔) */
  draftHint: () => process.env.AIFED_DRAFT_HINT === '1',
}

/** Gemini 키 · GOOGLE_API_KEY 우선, 없으면 GEMINI_API_KEY 폴백(플랫폼별 명칭 차이 흡수). */
export function geminiKey(): string | undefined {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || undefined
}

/** 누락된 키를 사람이 읽을 수 있게 반환(실행 전 점검). */
export function missingKeys(): string[] {
  const m: string[] = []
  if (!hasKey('anthropic')) m.push('ANTHROPIC_API_KEY')
  if (!hasKey('openai')) m.push('OPENAI_API_KEY')
  if (!hasKey('google')) m.push('GOOGLE_API_KEY')
  return m
}

/** 워커 호출에 타임아웃을 씌운다(한 제공자가 늘어져도 전체가 멈추지 않게). */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} 타임아웃(${ms}ms)`)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}
