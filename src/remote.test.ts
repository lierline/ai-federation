import { describe, it, expect, beforeEach } from 'vitest'
import { createIngestSender, createRemoteSettingsSync } from './remote.js'
import { modelOverrides, setModelOverrides } from './registry.js'
import type { UsageRecord } from './usage-record.js'

const rec: UsageRecord = { role: 'fast', provider: 'anthropic', model: 'claude-haiku-4-5-20251001', kind: 'text', inputTokens: 10, outputTokens: 5, costUsd: 0.000035, finishReason: 'stop', latencyMs: 12, operation: null }

function fakeFetch(handler: (url: string, init: RequestInit) => Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const f = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return handler(String(url), init ?? {})
  }) as typeof fetch
  return { f, calls }
}

beforeEach(() => setModelOverrides({}))

describe('받는 창구로 보내기', () => {
  it('사용 기록: 주소 · 머리글 · 본문 모양', async () => {
    const { f, calls } = fakeFetch(async () => new Response('{}', { status: 200 }))
    await createIngestSender({ url: 'https://example.test/', secret: 's'.repeat(40), product: 'login', fetch: f }).recordUsage(rec)
    expect(calls[0].url).toBe('https://example.test/api/ai-control/ingest')
    expect((calls[0].init.headers as Record<string, string>)['x-ai-ingest-key']).toBe('s'.repeat(40))
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ product: 'login', type: 'usage', records: [rec] })
  })
  it('창구가 500 이면 던진다(라이브러리가 삼킨다: Task 2 의 2초 상한 · try)', async () => {
    const { f } = fakeFetch(async () => new Response('x', { status: 500 }))
    await expect(createIngestSender({ url: 'https://e.test', secret: 's', product: 'login', fetch: f }).recordUsage(rec)).rejects.toThrow(/500/)
  })
  it('장애: 상태 코드와 메시지를 넘긴다', async () => {
    const { f, calls } = fakeFetch(async () => new Response('{}', { status: 200 }))
    const err = Object.assign(new Error('Your credit balance is too low'), { statusCode: 400 })
    await createIngestSender({ url: 'https://e.test', secret: 's', product: 'q-maison', fetch: f }).reportFailure({ provider: 'anthropic', operation: 'chat', error: err })
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ product: 'q-maison', type: 'failure', provider: 'anthropic', operation: 'chat', message: 'Your credit balance is too low', status: 400, meta: null })
  })
  it('관측 fetch: 제공자가 400 을 주면 장애로 보내고, 응답은 그대로 돌려준다', async () => {
    const posted: string[] = []
    const ingest = fakeFetch(async (_u, init) => (posted.push(String(init.body)), new Response('{}', { status: 200 })))
    const sender = createIngestSender({ url: 'https://e.test', secret: 's', product: 'login', fetch: ingest.f })
    const upstream = fakeFetch(async () => new Response('{"error":{"message":"credit balance is too low"}}', { status: 400 }))
    const observed = sender.observedFetch('anthropic', upstream.f)
    const res = await observed('https://api.anthropic.com/v1/messages', { method: 'POST' })
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('credit balance')
    expect(JSON.parse(posted[0])).toMatchObject({ type: 'failure', provider: 'anthropic', status: 400, operation: 'http' })
  })
})

describe('설정 받아 오기', () => {
  it('받은 값을 넣고, 60초 안에는 다시 묻지 않는다', async () => {
    const { f, calls } = fakeFetch(async () => new Response(JSON.stringify({ overrides: { fast: 'claude-sonnet-5-5' } }), { status: 200 }))
    const sync = createRemoteSettingsSync({ url: 'https://e.test', secret: 's', product: 'login', fetch: f })
    await sync()
    await sync()
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://e.test/api/ai-control/settings?product=login')
    expect(modelOverrides().fast).toBe('claude-sonnet-5-5')
  })
  it('창구가 죽으면 마지막 값으로 계속한다(던지지 않는다)', async () => {
    setModelOverrides({ fast: 'claude-sonnet-5-5' })
    const { f } = fakeFetch(async () => {
      throw new Error('ECONNREFUSED')
    })
    await expect(createRemoteSettingsSync({ url: 'https://e.test', secret: 's', product: 'login', fetch: f })()).resolves.toBeUndefined()
    expect(modelOverrides().fast).toBe('claude-sonnet-5-5')
  })
})
