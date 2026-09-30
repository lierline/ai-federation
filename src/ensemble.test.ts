import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ensemble, ensembleStream, pickSingle } from './ensemble.js'
import { configure } from './providers.js'
import type { ProviderId, WorkerResult } from './types.js'

const two: WorkerResult[] = [
  { provider: 'claude', model: 'm', ok: true, text: '짧다', ms: 1 },
  { provider: 'openai', model: 'm', ok: true, text: '더 긴 초안입니다', ms: 1 },
]
const both = (drafts: WorkerResult[], active: ProviderId[] = ['claude', 'openai']) => async () => ({ active, drafts })
const one = async () => ({ text: '단일답', provider: 'claude' as const })

const saved = { ...process.env }
beforeEach(() => {
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']) delete process.env[k]
  configure({})
})
afterEach(() => {
  process.env = { ...saved }
  configure({})
})

describe('ensemble', () => {
  it('head tier: synth 결과를 반환하고 headUsed=true', async () => {
    const r = await ensemble({ system: 's', prompt: 'p', tier: 'head' }, { collect: both(two), synth: async () => '종합본' })
    expect(r).toMatchObject({ text: '종합본', tier: 'head', headUsed: true, degraded: false })
    expect(r.fastModels).toEqual(['claude', 'openai'])
  })
  it('head tier: 계획한 갈래 일부만 살면 degraded', async () => {
    const r = await ensemble(
      { system: 's', prompt: 'p', tier: 'head' },
      { collect: both(two, ['claude', 'openai', 'gemini']), synth: async () => '종합본' },
    )
    expect(r).toMatchObject({ headUsed: true, degraded: true })
  })
  it('consensus tier: Head 스킵, 첫 초안', async () => {
    const r = await ensemble({ system: 's', prompt: 'p', tier: 'consensus' }, { collect: both(two), synth: async () => '안불림' })
    expect(r).toMatchObject({ text: '짧다', tier: 'consensus', headUsed: false, degraded: false })
  })
  it('consensus tier: 초안이 하나뿐이면 합의가 아니다(degraded)', async () => {
    const r = await ensemble({ system: 's', prompt: 'p', tier: 'consensus' }, { collect: both([two[0]], ['claude']) })
    expect(r.degraded).toBe(true)
  })
  it('fast 전부 실패: 단일 폴백 + degraded', async () => {
    const r = await ensemble(
      { system: 's', prompt: 'p', tier: 'head' },
      { collect: both([]), single: async () => ({ text: '폴백', provider: 'openai' }), synth: async () => 'x' },
    )
    expect(r).toMatchObject({ text: '폴백', headUsed: false, degraded: true, fastModels: [] })
  })
  it('Head 실패: 최장 초안 반환 + degraded + 기록', async () => {
    const seen: string[] = []
    configure({ reportFailure: (e) => void seen.push(e.operation) })
    const r = await ensemble(
      { system: 's', prompt: 'p', tier: 'head', operation: 'capa.assist' },
      {
        collect: both(two),
        synth: async () => {
          throw new Error('down')
        },
      },
    )
    expect(r).toMatchObject({ text: '더 긴 초안입니다', headUsed: false, degraded: true })
    expect(seen).toEqual(['capa.assist.head'])
  })
  it('single tier: 단일 호출', async () => {
    const r = await ensemble({ system: 's', prompt: 'p', tier: 'single' }, { single: one })
    expect(r).toMatchObject({ text: '단일답', tier: 'single', headUsed: false, fastModels: ['claude'] })
  })
})

describe('pickSingle', () => {
  it('Claude 키가 있으면 fast 역할', () => {
    process.env.ANTHROPIC_API_KEY = 'a'
    process.env.OPENAI_API_KEY = 'o'
    expect(pickSingle()).toEqual({ role: 'fast', provider: 'claude' })
  })
  it('Claude 키가 없으면 키 있는 다음 제공자(감사 1번 회귀)', () => {
    process.env.OPENAI_API_KEY = 'o'
    expect(pickSingle()).toEqual({ role: 'worker.openai', provider: 'openai' })
    delete process.env.OPENAI_API_KEY
    process.env.GEMINI_API_KEY = 'g'
    expect(pickSingle()).toEqual({ role: 'worker.gemini', provider: 'gemini' })
  })
  it('키가 하나도 없으면 null', () => {
    expect(pickSingle()).toBeNull()
  })
})

describe('ensembleStream', () => {
  it('fast 가 모두 실패하고 키도 없으면 분명히 실패한다', async () => {
    await expect(ensembleStream({ system: 's', prompt: 'p' }, { collect: both([]) })).rejects.toThrow(/키 없음/)
  })
  it('초안이 있으면 Head 스트림 + 품질 정보', async () => {
    process.env.ANTHROPIC_API_KEY = 'a'
    const { quality } = await ensembleStream(
      { system: 's', prompt: 'p' },
      { collect: both(two, ['claude', 'openai', 'gemini']) },
    )
    expect(quality).toEqual({ degraded: true, fastModels: ['claude', 'openai'], activeCount: 3, headUsed: true })
  })
})
