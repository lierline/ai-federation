import { describe, it, expect } from 'vitest'
import { estimateCostUsd, priceOf, EXTRA_PRICE } from './cost.js'
import { catalogEntry } from './registry.js'

// 평가 도구가 따로 들고 있던 PRICE 표(2026-09-30)의 값. 옮긴 뒤에도 같아야 한다.
const OLD_PRICE: Record<string, [number, number]> = {
  'claude-haiku-4-5-20251001': [1, 5],
  'claude-haiku-4-5': [1, 5],
  'claude-sonnet-4-5-20250929': [3, 15],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-4-8': [5, 25],
  'claude-opus-5-5': [4, 20],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-6-luna': [0.1, 0.5],
  'gpt-6.1-sol': [2, 10],
  'gpt-6-astra': [10, 50],
  'gemini-2.5-flash': [0.3, 2.5],
  'gemini-3.8-flash': [1.5, 7.5],
  'gemini-3.1-pro-preview': [2, 12],
}

describe('단가', () => {
  it('평가 도구의 옛 단가표와 값이 같다', () => {
    for (const [id, [i, o]] of Object.entries(OLD_PRICE)) {
      expect(priceOf(id), id).toEqual({ input: i, output: o })
    }
  })
  it('임베딩 두 모델의 단가가 있다(출력 0)', () => {
    expect(priceOf('text-embedding-3-small')).toEqual({ input: 0.02, output: 0 })
    expect(priceOf('text-embedding-3-large')).toEqual({ input: 0.13, output: 0 })
  })
  it('덧붙인 단가는 목록(MODEL_CATALOG)과 겹치지 않는다(같은 사실을 두 곳에 두지 않는다)', () => {
    for (const id of Object.keys(EXTRA_PRICE)) expect(catalogEntry(id), id).toBeUndefined()
  })
  it('게이트웨이 접두어를 떼고 찾는다', () => {
    expect(priceOf('anthropic/claude-opus-5-5')).toEqual({ input: 4, output: 20 })
  })
  it('비용 = 입력 × 입력 단가 + 출력 × 출력 단가 (100만 토큰 기준)', () => {
    expect(estimateCostUsd('claude-opus-5-5', 1_000_000, 500_000)).toBeCloseTo(4 + 10, 10)
  })
  it('목록 밖 모델은 null (0 으로 치지 않는다)', () => {
    expect(estimateCostUsd('no-such-model', 100, 100)).toBeNull()
  })
})
