import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import { configure, type FailureEvent } from './providers.js'
import type { WorkerSpec } from './models.js'
import type { ProviderId } from './types.js'
import { vote, VOTE_ROLES } from './vote.js'

const Fruit = z.object({ name: z.string() })
type FruitT = z.infer<typeof Fruit>

function spec(provider: ProviderId, enabled = true): WorkerSpec {
  return {
    provider,
    model: `m-${provider}`,
    enabled: () => enabled,
    build: () => {
      throw new Error('시험에서는 실제 모델을 만들지 않습니다')
    },
  }
}

function opts(): Parameters<typeof vote<FruitT>>[0] {
  return { schema: Fruit, system: 's', prompt: 'p', key: (v) => v.name, operation: 'test.vote' }
}

/** 회사별로 정해진 답을 돌려주는 가짜 ask. 값이 Error 면 던진다. */
function asker(table: Partial<Record<ProviderId, FruitT | Error>>) {
  return async (s: WorkerSpec): Promise<FruitT> => {
    const v = table[s.provider]
    if (v instanceof Error) throw v
    if (!v) throw new Error(`답 없음: ${s.provider}`)
    return v
  }
}

describe('vote', () => {
  beforeEach(() => {
    configure({})
  })

  it('세 회사가 같은 답이면 unanimous 에 그 값이 들어간다', async () => {
    const r = await vote(opts(), {
      specs: () => VOTE_ROLES.map((p) => spec(p)),
      ask: asker({ claude: { name: '사과' }, openai: { name: '사과' }, gemini: { name: '사과' } }),
    })
    expect(r.answered).toBe(3)
    expect(r.unanimous).toEqual({ name: '사과' })
    expect(r.majority).toEqual({ value: { name: '사과' }, count: 3 })
    expect(r.answers.map((a) => a.provider)).toEqual(['claude', 'openai', 'gemini'])
  })

  it('둘이 같고 하나가 다르면 unanimous 는 null, majority 는 2', async () => {
    const r = await vote(opts(), {
      specs: () => VOTE_ROLES.map((p) => spec(p)),
      ask: asker({ claude: { name: '사과' }, openai: { name: '사과' }, gemini: { name: '배' } }),
    })
    expect(r.answered).toBe(3)
    expect(r.unanimous).toBeNull()
    expect(r.majority).toEqual({ value: { name: '사과' }, count: 2 })
  })

  it('한 회사가 실패하면 나머지 둘이 같아도 unanimous 는 null (둘 중 둘은 만장일치가 아니다)', async () => {
    const r = await vote(opts(), {
      specs: () => VOTE_ROLES.map((p) => spec(p)),
      ask: asker({ claude: { name: '사과' }, openai: { name: '사과' }, gemini: new Error('timeout') }),
    })
    expect(r.answered).toBe(2)
    expect(r.unanimous).toBeNull()
    expect(r.majority).toEqual({ value: { name: '사과' }, count: 2 })
    const g = r.answers.find((a) => a.provider === 'gemini')
    expect(g?.ok).toBe(false)
    expect(g?.error).toBe('timeout')
  })

  it('키 없는 회사는 ask 를 부르지 않고 «키 없음» 으로 답하지 않은 것으로 센다', async () => {
    const ask = vi.fn(asker({ claude: { name: '사과' }, openai: { name: '사과' }, gemini: { name: '사과' } }))
    const r = await vote(opts(), {
      specs: () => [spec('claude'), spec('openai'), spec('gemini', false)],
      ask,
    })
    expect(ask).toHaveBeenCalledTimes(2)
    expect(r.answered).toBe(2)
    expect(r.unanimous).toBeNull()
    const g = r.answers.find((a) => a.provider === 'gemini')
    expect(g).toMatchObject({ ok: false, error: '키 없음', model: 'm-gemini' })
  })

  it('실패는 reportFailure 로 보고된다(작업 이름 · 회사 포함)', async () => {
    const events: FailureEvent[] = []
    configure({ reportFailure: async (e) => { events.push(e) } })
    await vote(opts(), {
      specs: () => VOTE_ROLES.map((p) => spec(p)),
      ask: asker({ claude: { name: '사과' }, openai: new Error('402 잔액'), gemini: { name: '사과' } }),
    })
    expect(events).toHaveLength(1)
    expect(events[0]?.provider).toBe('openai')
    expect(events[0]?.operation).toBe('test.vote.vote.m-openai')
    expect((events[0]?.error as Error).message).toBe('402 잔액')
  })

  it('roles 로 일부 회사만 물을 수 있고, 그때는 그 수가 «전원» 이다', async () => {
    const r = await vote({ ...opts(), roles: ['claude', 'openai'] }, {
      specs: () => VOTE_ROLES.map((p) => spec(p)),
      ask: asker({ claude: { name: '사과' }, openai: { name: '사과' }, gemini: { name: '배' } }),
    })
    expect(r.answers).toHaveLength(2)
    expect(r.unanimous).toEqual({ name: '사과' })
  })

  it('셋이 다 다르면 majority 도 null', async () => {
    const r = await vote(opts(), {
      specs: () => VOTE_ROLES.map((p) => spec(p)),
      ask: asker({ claude: { name: '사과' }, openai: { name: '배' }, gemini: { name: '감' } }),
    })
    expect(r.unanimous).toBeNull()
    expect(r.majority).toBeNull()
  })

  it('요청한 역할 중 spec 이 없는 회사는 «키 없음» 한 줄로 채우고, 둘 중 둘은 만장일치가 아니다', async () => {
    const ask = vi.fn(asker({ claude: { name: '사과' }, openai: { name: '사과' } }))
    const r = await vote(opts(), {
      specs: () => [spec('claude'), spec('openai')],
      ask,
    })
    expect(ask).toHaveBeenCalledTimes(2)
    expect(r.answers).toHaveLength(3)
    expect(r.answers[2]).toMatchObject({ provider: 'gemini', ok: false, error: '키 없음' })
    expect(r.answered).toBe(2)
    expect(r.unanimous).toBeNull()
    expect(r.majority).toEqual({ value: { name: '사과' }, count: 2 })
  })

  it('roles 에 같은 회사가 겹쳐도 한 번만 묻고 한 줄만 낸다', async () => {
    const ask = vi.fn(asker({ claude: { name: '사과' }, openai: { name: '사과' } }))
    const r = await vote({ ...opts(), roles: ['claude', 'claude', 'openai'] }, {
      specs: () => VOTE_ROLES.map((p) => spec(p)),
      ask,
    })
    expect(ask).toHaveBeenCalledTimes(2)
    expect(r.answers.map((a) => a.provider)).toEqual(['claude', 'openai'])
    expect(r.unanimous).toEqual({ name: '사과' })
  })
})
