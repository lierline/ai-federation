// 갈래 수집(defaultCollect)의 실패 기록. 실제 generateText 를 목으로 바꿔 끝까지 돌린다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const genMock = vi.fn()
vi.mock('ai', async (orig) => ({
  ...(await orig<typeof import('ai')>()),
  generateText: (...args: unknown[]) => genMock(...args),
}))

import { ensemble } from './ensemble.js'
import { configure, type FailureEvent } from './providers.js'
import { modelId } from './registry.js'

const saved = { ...process.env }
beforeEach(() => {
  genMock.mockReset()
  process.env.ANTHROPIC_API_KEY = 'a'
  process.env.OPENAI_API_KEY = 'o'
  process.env.GEMINI_API_KEY = 'g'
})
afterEach(() => {
  process.env = { ...saved }
  configure({})
})

describe('갈래 하나가 죽으면', () => {
  it('원본 오류 그대로 · 모델 이름으로 기록한다 (분류기가 상태 코드를 봐야 한다)', async () => {
    const seen: FailureEvent[] = []
    configure({ reportFailure: (e) => void seen.push(e) })
    const credit = Object.assign(new Error('Your credit balance is too low'), { statusCode: 402 })
    const openaiId = modelId('worker.openai')
    genMock.mockImplementation(async (arg: { model: { modelId: string } }) => {
      if (arg.model.modelId === openaiId) throw credit
      return { text: '초안', usage: {} }
    })

    const r = await ensemble(
      { system: 's', prompt: 'p', tier: 'head', operation: 'capa.assist' },
      { synth: async () => '종합본' },
    )

    expect(r).toMatchObject({ text: '종합본', headUsed: true, degraded: true })
    expect(seen).toHaveLength(1)
    expect(seen[0].provider).toBe('openai')
    expect(seen[0].operation).toBe(`capa.assist.fast.${openaiId}`)
    expect(seen[0].error, '감싼 사본을 넘기면 402 가 사라진다').toBe(credit)
  })
})
