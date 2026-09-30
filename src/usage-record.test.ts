import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateText, streamText, embed, simulateReadableStream, wrapLanguageModel, wrapEmbeddingModel } from 'ai'
import { MockLanguageModelV3, MockEmbeddingModelV3 } from 'ai/test'
import { usageMiddleware, embedUsageMiddleware, setUsageSink, withAiOperation, type UsageRecord } from './usage-record.js'

const usage = { inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 200, text: 200, reasoning: 0 } }
const finishReason = { unified: 'stop' as const, raw: 'end_turn' }
const tag = { provider: 'anthropic' as const, model: 'claude-opus-5-5', role: 'head' }

function genModel() {
  return new MockLanguageModelV3({
    doGenerate: async () => ({ content: [{ type: 'text', text: '답' }], usage, finishReason, warnings: [] }),
  })
}
function streamModel() {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: '가' },
          { type: 'text-delta', id: '1', delta: '나' },
          { type: 'text-end', id: '1' },
          { type: 'finish', usage, finishReason: { unified: 'length', raw: 'max_tokens' } },
        ],
      }),
    }),
  })
}

let seen: UsageRecord[] = []
beforeEach(() => {
  seen = []
  setUsageSink((r) => void seen.push(r))
})
afterEach(() => setUsageSink(undefined))

describe('사용 기록 미들웨어', () => {
  it('generate: 토큰 · 비용 · 종료 사유를 한 번 기록한다', async () => {
    const model = wrapLanguageModel({ model: genModel(), middleware: usageMiddleware(tag) })
    const r = await generateText({ model, prompt: 'p' })
    expect(r.text).toBe('답')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ kind: 'text', role: 'head', provider: 'anthropic', model: 'claude-opus-5-5', inputTokens: 1000, outputTokens: 200, finishReason: 'stop', operation: null })
    expect(seen[0].costUsd).toBeCloseTo((1000 * 4 + 200 * 20) / 1e6, 12)
    expect(seen[0].latencyMs).toBeGreaterThanOrEqual(0)
  })
  it('stream: 끝까지 읽으면 정확히 한 번 · 잘림(length)을 남긴다', async () => {
    const model = wrapLanguageModel({ model: streamModel(), middleware: usageMiddleware(tag) })
    const r = streamText({ model, prompt: 'p' })
    expect(await r.text).toBe('가나')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ outputTokens: 200, finishReason: 'length' })
  })
  it('stream: 중간에 취소하면 기록하지 않는다(두 번 남기지 않는다)', async () => {
    const model = wrapLanguageModel({ model: streamModel(), middleware: usageMiddleware(tag) })
    const { stream } = await model.doStream({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'p' }] }] })
    const reader = stream.getReader()
    await reader.read()
    await reader.cancel()
    expect(seen).toHaveLength(0)
  })
  it('기록 함수가 던져도 AI 결과는 그대로 온다', async () => {
    setUsageSink(() => {
      throw new Error('기록 창구 죽음')
    })
    const model = wrapLanguageModel({ model: genModel(), middleware: usageMiddleware(tag) })
    expect((await generateText({ model, prompt: 'p' })).text).toBe('답')
  })
  it('기록 함수가 멈춰도 2초 안에 끝난다', async () => {
    setUsageSink(() => new Promise<void>(() => {}))
    const model = wrapLanguageModel({ model: genModel(), middleware: usageMiddleware(tag) })
    const t0 = Date.now()
    await generateText({ model, prompt: 'p' })
    expect(Date.now() - t0).toBeLessThan(2600)
  }, 5000)
  it('작업 이름을 붙인다(generate · stream 모두)', async () => {
    const g = wrapLanguageModel({ model: genModel(), middleware: usageMiddleware(tag) })
    const s = wrapLanguageModel({ model: streamModel(), middleware: usageMiddleware(tag) })
    await withAiOperation('health.probe', () => generateText({ model: g, prompt: 'p' }))
    await withAiOperation('capa.assist', async () => streamText({ model: s, prompt: 'p' }).text)
    expect(seen.map((r) => r.operation)).toEqual(['health.probe', 'capa.assist'])
  })
  it('단가 모르는 모델은 비용 null', async () => {
    const model = wrapLanguageModel({ model: genModel(), middleware: usageMiddleware({ ...tag, model: 'no-such-model' }) })
    await generateText({ model, prompt: 'p' })
    expect(seen[0].costUsd).toBeNull()
  })
  it('임베딩: 토큰을 입력으로 기록한다', async () => {
    const base = new MockEmbeddingModelV3({ doEmbed: async () => ({ embeddings: [[0.1, 0.2]], usage: { tokens: 42 }, warnings: [] }) })
    const model = wrapEmbeddingModel({ model: base, middleware: embedUsageMiddleware({ provider: 'openai', model: 'text-embedding-3-small', role: 'embed.small' }) })
    await embed({ model, value: '가' })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ kind: 'embed', inputTokens: 42, outputTokens: 0, finishReason: null })
    expect(seen[0].costUsd).toBeCloseTo((42 * 0.02) / 1e6, 14)
  })
})
