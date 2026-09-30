import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_MODELS,
  MODEL_CATALOG,
  TEXT_ROLES,
  catalogFor,
  modelFor,
  modelOverrides,
  modelSource,
  setModelOverrides,
} from './registry.js'
import { configure, languageModel } from './providers.js'

const saved = { ...process.env }
beforeEach(() => {
  for (const k of Object.keys(process.env)) if (k.startsWith('AIFED_MODEL_')) delete process.env[k]
  delete process.env.HEAD_MODEL
  setModelOverrides({})
  configure({})
})
afterEach(() => {
  process.env = { ...saved }
  setModelOverrides({})
  configure({})
})

describe('검증된 모델 목록', () => {
  it('기본 모델은 모두 목록에 있다(임베딩 제외)', () => {
    for (const r of TEXT_ROLES) expect(catalogFor(r).map((m) => m.id), r).toContain(DEFAULT_MODELS[r].id)
  })
  it('역할은 자기 제공자의 모델만 고를 수 있다', () => {
    expect(catalogFor('head').every((m) => m.provider === 'anthropic')).toBe(true)
    expect(catalogFor('worker.openai').every((m) => m.provider === 'openai')).toBe(true)
    expect(catalogFor('embed.large')).toEqual([])
  })
  it('같은 모델이 두 번 없다 · 단가가 있다', () => {
    const ids = MODEL_CATALOG.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of MODEL_CATALOG) expect(m.price.input > 0 && m.price.output > 0, m.id).toBe(true)
  })
})

describe('운영 화면 값', () => {
  it('화면 값이 환경변수 · 기본값을 이긴다', () => {
    process.env.AIFED_MODEL_HEAD = 'claude-opus-4-8'
    expect(modelSource('head')).toBe('env')
    setModelOverrides({ head: 'claude-sonnet-4-5-20250929' })
    expect(modelFor('head').id).toBe('claude-sonnet-4-5-20250929')
    expect(modelSource('head')).toBe('screen')
  })
  it('목록에 없는 값 · 제공자가 다른 값은 버린다', () => {
    setModelOverrides({ head: 'claude-opus-9-9', fast: 'gpt-4o-mini', 'worker.gemini': 'gemini-3.8-flash' })
    expect(modelOverrides()).toEqual({ 'worker.gemini': 'gemini-3.8-flash' })
    expect(modelFor('head').id).toBe(DEFAULT_MODELS.head.id)
    expect(modelFor('fast').id).toBe(DEFAULT_MODELS.fast.id)
  })
  it('빈 값으로 넣으면 원래대로 돌아간다', () => {
    setModelOverrides({ head: 'claude-opus-4-8' })
    setModelOverrides({})
    expect(modelSource('head')).toBe('default')
  })
})

describe('호출 직전에 모델을 고른다(beforeModelCall)', () => {
  it('모델 객체를 만든 뒤 값이 바뀌어도 호출 때의 모델을 쓴다', async () => {
    let calls = 0
    configure({
      beforeModelCall: async () => {
        calls++
        setModelOverrides({ head: 'claude-opus-4-8' })
      },
    })
    const m = languageModel('head') as Exclude<ReturnType<typeof languageModel>, string>
    expect(m.modelId).toBe(DEFAULT_MODELS.head.id)
    // 실제 요청은 보내지 않는다. 가짜 fetch 로 보낸 모델 이름만 받아 본다.
    const seen: string[] = []
    configure({
      beforeModelCall: async () => {
        calls++
        setModelOverrides({ head: 'claude-opus-4-8' })
      },
      keys: { anthropic: () => 'test' },
      fetchFor: () => (async (_url: unknown, init?: { body?: unknown }) => {
        seen.push(JSON.parse(String(init?.body)).model)
        return new Response(JSON.stringify({ error: { type: 'x', message: 'stop' } }), { status: 400 })
      }) as typeof fetch,
    })
    const late = languageModel('head') as Exclude<ReturnType<typeof languageModel>, string>
    await Promise.resolve(
      late.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] } as never),
    ).catch(() => undefined)
    expect(calls).toBeGreaterThan(0)
    expect(seen).toEqual(['claude-opus-4-8'])
  })
  it('설정 읽기가 던져도 호출은 이어진다', async () => {
    const seen: string[] = []
    configure({
      beforeModelCall: async () => {
        throw new Error('DB 없음')
      },
      keys: { anthropic: () => 'test' },
      fetchFor: () => (async (_url: unknown, init?: { body?: unknown }) => {
        seen.push(JSON.parse(String(init?.body)).model)
        return new Response('{}', { status: 400 })
      }) as typeof fetch,
    })
    const m = languageModel('fast') as Exclude<ReturnType<typeof languageModel>, string>
    await Promise.resolve(
      m.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] } as never),
    ).catch(() => undefined)
    expect(seen).toEqual([DEFAULT_MODELS.fast.id])
  })
})
