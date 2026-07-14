import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { missingKeys, withTimeout, geminiKey } from './config.js'

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

describe('config', () => {
  it('키가 하나도 없으면 3개 모두 누락', () => {
    expect(missingKeys()).toEqual(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY'])
  })
  it('GEMINI_API_KEY 만 있어도 google 키는 충족(폴백)', () => {
    process.env.GEMINI_API_KEY = 'g'
    expect(missingKeys()).not.toContain('GOOGLE_API_KEY')
    expect(geminiKey()).toBe('g')
  })
  it('withTimeout 는 지연 시 라벨 포함 에러로 reject', async () => {
    const slow = new Promise((r) => setTimeout(r, 50))
    await expect(withTimeout(slow, 5, 'head')).rejects.toThrow(/head/)
  })
})
