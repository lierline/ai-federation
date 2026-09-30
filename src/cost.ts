// =============================================================================
// 추정 비용: 단가는 여기 한 곳에서만 계산한다.
// =============================================================================
// 운영 기록(ai_usage_events)과 평가 도구가 같은 함수를 쓴다. 평가 도구가 따로 들고 있던
// PRICE 표는 없앴다(같은 사실을 두 곳에 두면 갈린다).
// 단가는 USD / 100만 토큰이다. 목록 밖 모델은 null 이다(«단가 모름». 0 으로 치지 않는다).
// 캐시 읽기 · 쓰기 할인은 반영하지 않는다(입력 토큰 전체를 정가로 센다). 그래서 «추정» 이다.

import { catalogEntry } from './registry.js'

type Price = { input: number; output: number }

/** 목록(MODEL_CATALOG)에는 없지만 값을 알아야 하는 모델. 임베딩 · 평가 심사 모델 · 짧은 별칭. */
export const EXTRA_PRICE: Record<string, Price> = {
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'gpt-6-astra': { input: 10, output: 50 },
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
}

export function priceOf(model: string): Price | null {
  const id = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model
  return catalogEntry(id)?.price ?? EXTRA_PRICE[id] ?? null
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = priceOf(model)
  if (!p) return null
  return (inputTokens * p.input + outputTokens * p.output) / 1e6
}
