import { describe, it, expect } from 'vitest'
import { judge } from './head-judge.js'
import type { WorkerResult } from './types.js'

const workers: WorkerResult[] = [{ provider: 'claude', model: 'm', ok: true, text: 'A', ms: 1 }]

describe('judge (주입)', () => {
  it('주입된 callHead 결과를 HeadReview 로 정규화한다', async () => {
    const hr = await judge('q', workers, {
      callHead: async () => ({
        rankings: [{ provider: 'claude', reliability: 2, rationale: 'r' }],
        consensus: 'c',
        conflicts: '',
        finalAnswer: 'F',
        confidence: 0.7,
      }),
    })
    expect(hr.finalAnswer).toBe('F')
    expect(hr.rankings[0].reliability).toBe(1) // clamp
    expect(hr.confidence).toBe(0.7)
  })
})
