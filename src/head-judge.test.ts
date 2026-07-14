import { describe, it, expect } from 'vitest'
import { reviewSchema, buildJudgePrompt, clamp01, toHeadReview } from './head-judge.js'
import type { WorkerResult } from './types.js'

const workers: WorkerResult[] = [
  { provider: 'claude', model: 'm', ok: true, text: '답A', ms: 1 },
  { provider: 'openai', model: 'm', ok: false, text: '', error: 'x', ms: 0 },
]

describe('head-judge (순수)', () => {
  it('프롬프트에 성공답변과 실패표시가 모두 들어간다', () => {
    const p = buildJudgePrompt('질문?', workers)
    expect(p).toContain('답A')
    expect(p).toMatch(/GPT[\s\S]*응답 실패/)
  })
  it('clamp01 은 범위를 0..1 로 조인다', () => {
    expect(clamp01(1.7)).toBe(1)
    expect(clamp01(-2)).toBe(0)
    expect(clamp01('x')).toBe(0)
  })
  it('reviewSchema 는 유효 객체를 통과시킨다', () => {
    const ok = reviewSchema.safeParse({
      rankings: [{ provider: 'claude', reliability: 0.9, rationale: 'r' }],
      consensus: '',
      conflicts: '',
      finalAnswer: 'F',
      confidence: 0.8,
    })
    expect(ok.success).toBe(true)
  })
  it('toHeadReview 는 신뢰도/확신도를 clamp 한다', () => {
    const hr = toHeadReview({
      rankings: [{ provider: 'claude', reliability: 5, rationale: 'r' }],
      consensus: '',
      conflicts: '',
      finalAnswer: 'F',
      confidence: 9,
    })
    expect(hr.rankings[0].reliability).toBe(1)
    expect(hr.confidence).toBe(1)
  })
})
