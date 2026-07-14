import { describe, it, expect } from 'vitest'
import { runWorkers, type Worker } from './engine.js'
import type { ProviderId } from './types.js'

const mk = (provider: ProviderId, fn: () => Promise<string>): Worker => ({
  provider,
  model: 'm',
  run: () => fn(),
})

describe('runWorkers', () => {
  it('일부 실패해도 성공분을 반환한다', async () => {
    const res = await runWorkers(
      [
        mk('claude', async () => 'A'),
        mk('openai', async () => {
          throw new Error('boom')
        }),
        mk('gemini', async () => '  C  '),
      ],
      1000,
    )
    expect(res.find((r) => r.provider === 'claude')).toMatchObject({ ok: true, text: 'A' })
    expect(res.find((r) => r.provider === 'openai')).toMatchObject({ ok: false, error: 'boom', text: '' })
    expect(res.find((r) => r.provider === 'gemini')!.text).toBe('C') // trim
  })
  it('타임아웃 초과 워커는 ok:false', async () => {
    const res = await runWorkers([mk('claude', () => new Promise((r) => setTimeout(() => r('late'), 50)))], 5)
    expect(res[0].ok).toBe(false)
  })
})
