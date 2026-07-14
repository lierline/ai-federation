import { describe, it, expect } from 'vitest'
import { federate } from './federate.js'
import type { WorkerResult } from './types.js'

const ok: WorkerResult[] = [{ provider: 'claude', model: 'm', ok: true, text: 'A', ms: 1 }]
const allFail: WorkerResult[] = [{ provider: 'claude', model: 'm', ok: false, text: '', error: 'x', ms: 0 }]

describe('federate', () => {
  it('워커 성공 시 Head 를 호출해 결과를 담는다', async () => {
    const r = await federate('q', {}, {
      collect: async () => ok,
      judge: async () => ({ rankings: [], consensus: '', conflicts: '', finalAnswer: 'F', confidence: 0.5 }),
    })
    expect(r.head?.finalAnswer).toBe('F')
    expect(r.headError).toBeUndefined()
  })
  it('워커 전부 실패면 Head 스킵 + headError', async () => {
    const r = await federate('q', {}, {
      collect: async () => allFail,
      judge: async () => {
        throw new Error('should not run')
      },
    })
    expect(r.head).toBeNull()
    expect(r.headError).toMatch(/모든 워커/)
  })
  it('Head 실패는 headError 로 담고 워커는 보존', async () => {
    const r = await federate('q', {}, {
      collect: async () => ok,
      judge: async () => {
        throw new Error('head down')
      },
    })
    expect(r.head).toBeNull()
    expect(r.headError).toBe('head down')
    expect(r.workers).toHaveLength(1)
  })
})
