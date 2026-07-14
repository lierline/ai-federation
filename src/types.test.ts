import { describe, it, expect } from 'vitest'
import type { WorkerResult, FederationResult } from './types.js'
import { PROVIDER_IDS } from './types.js'

describe('types', () => {
  it('PROVIDER_IDS 는 3사 고정', () => {
    expect(PROVIDER_IDS).toEqual(['claude', 'openai', 'gemini'])
  })
  it('WorkerResult 형태를 만족하는 객체를 구성할 수 있다', () => {
    const w: WorkerResult = { provider: 'claude', model: 'x', ok: true, text: 'hi', ms: 10 }
    const f: FederationResult = { question: 'q', workers: [w], head: null, ms: 20 }
    expect(f.workers[0].provider).toBe('claude')
  })
})
