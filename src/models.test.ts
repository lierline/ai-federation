import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { workerSpecs, enabledWorkerSpecs } from './models.js'

const saved = { ...process.env }
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.GOOGLE_API_KEY
  delete process.env.GEMINI_API_KEY
})
afterEach(() => {
  process.env = { ...saved }
})

describe('models', () => {
  it('3사 스펙을 항상 노출한다', () => {
    expect(workerSpecs().map((s) => s.provider)).toEqual(['claude', 'openai', 'gemini'])
  })
  it('키 있는 provider 만 enabled', () => {
    process.env.ANTHROPIC_API_KEY = 'a'
    const on = enabledWorkerSpecs().map((s) => s.provider)
    expect(on).toEqual(['claude'])
  })
  it('GEMINI_API_KEY 폴백도 gemini enabled', () => {
    process.env.GEMINI_API_KEY = 'g'
    expect(enabledWorkerSpecs().map((s) => s.provider)).toEqual(['gemini'])
  })
})
