import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DEFAULT_MODELS, EMBED_ROLES, TEXT_ROLES, envNameFor, modelFor, currentModels } from './registry.js'
import {
  configure,
  gatewayId,
  gatewayIds,
  hasKey,
  rejectsSampling,
  resolveAnthropicBaseURL,
  thinksByDefault,
  usesNativeStructuredOutput,
} from './providers.js'

const saved = { ...process.env }
beforeEach(() => {
  for (const k of Object.keys(process.env)) if (k.startsWith('AIFED_MODEL_')) delete process.env[k]
  for (const k of ['CLAUDE_MODEL', 'OPENAI_MODEL', 'GEMINI_MODEL', 'HEAD_MODEL']) delete process.env[k]
  configure({})
})
afterEach(() => {
  process.env = { ...saved }
  configure({})
})

describe('registry', () => {
  it('모든 역할에 기본 모델이 있다', () => {
    for (const r of [...TEXT_ROLES, ...EMBED_ROLES]) expect(DEFAULT_MODELS[r].id).toBeTruthy()
    expect(Object.keys(currentModels()).sort()).toEqual([...TEXT_ROLES, ...EMBED_ROLES].sort())
  })
  it('환경변수 이름은 점을 밑줄로 바꾼 대문자', () => {
    expect(envNameFor('worker.openai')).toBe('AIFED_MODEL_WORKER_OPENAI')
    expect(envNameFor('embed.small')).toBe('AIFED_MODEL_EMBED_SMALL')
  })
  it('AIFED_MODEL_* 가 기본값을 덮는다(제공자는 역할이 정한다)', () => {
    process.env.AIFED_MODEL_HEAD = 'claude-opus-5-5'
    expect(modelFor('head')).toEqual({ provider: 'anthropic', id: 'claude-opus-5-5' })
  })
  it('예전 이름(HEAD_MODEL 등)도 읽되 새 이름이 이긴다', () => {
    process.env.HEAD_MODEL = 'old'
    expect(modelFor('head').id).toBe('old')
    process.env.AIFED_MODEL_HEAD = 'new'
    expect(modelFor('head').id).toBe('new')
  })
})

describe('Claude 모델 판별', () => {
  it('샘플링 값을 거절하는 모델', () => {
    for (const id of ['claude-opus-4-7', 'claude-opus-4-8', 'claude-opus-5', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1'])
      expect(rejectsSampling(id), id).toBe(true)
    for (const id of ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-sonnet-4-6', 'claude-opus-4-6'])
      expect(rejectsSampling(id), id).toBe(false)
  })
  it('구조화 출력을 모델 고유 기능으로 보내는 모델', () => {
    for (const id of ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-opus-4-8', 'claude-opus-5-5', 'claude-sonnet-5-5'])
      expect(usesNativeStructuredOutput(id), id).toBe(true)
    expect(usesNativeStructuredOutput('claude-3-5-haiku-20241022')).toBe(false)
  })
  it('기본으로 생각하는 모델', () => {
    expect(thinksByDefault('claude-opus-5-5')).toBe(true)
    expect(thinksByDefault('claude-sonnet-5-5')).toBe(true)
    expect(thinksByDefault('claude-opus-4-8')).toBe(false)
    expect(thinksByDefault('claude-haiku-4-5-20251001')).toBe(false)
  })
})

describe('providers', () => {
  it('Anthropic 주소: 비면 기본, /v1 이 빠지면 붙인다', () => {
    expect(resolveAnthropicBaseURL('')).toBe('https://api.anthropic.com/v1')
    expect(resolveAnthropicBaseURL('https://api.anthropic.com/')).toBe('https://api.anthropic.com/v1')
    expect(resolveAnthropicBaseURL('https://proxy.local/v1')).toBe('https://proxy.local/v1')
  })
  it('Google 키는 세 이름을 모두 읽는다', () => {
    for (const k of ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']) {
      delete process.env.GOOGLE_API_KEY
      delete process.env.GEMINI_API_KEY
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
      expect(hasKey('google')).toBe(false)
      process.env[k] = 'g'
      expect(hasKey('google'), k).toBe(true)
    }
  })
  it('configure 의 keys 가 환경변수보다 앞선다', () => {
    delete process.env.OPENAI_API_KEY
    configure({ keys: { openai: () => 'injected' } })
    expect(hasKey('openai')).toBe(true)
  })
  it('게이트웨이 id', () => {
    expect(gatewayId('google', 'gemini-2.5-flash')).toBe('google/gemini-2.5-flash')
    expect(gatewayId('openai', 'openai/gpt-4o-mini')).toBe('openai/gpt-4o-mini')
    expect(gatewayIds(['worker.openai', 'worker.gemini'])).toEqual([
      `openai/${DEFAULT_MODELS['worker.openai'].id}`,
      `google/${DEFAULT_MODELS['worker.gemini'].id}`,
    ])
  })
})
