import { describe, it, expect } from 'vitest'
import { formatFederation } from './cli.js'
import type { FederationResult } from './types.js'

describe('formatFederation', () => {
  it('판단 결과를 사람이 읽는 문자열로 만든다', () => {
    const r: FederationResult = {
      question: 'q',
      workers: [{ provider: 'claude', model: 'm', ok: true, text: 'A', ms: 5 }],
      head: {
        rankings: [{ provider: 'claude', reliability: 0.9, rationale: 'r' }],
        consensus: 'c',
        conflicts: '',
        finalAnswer: '최종',
        confidence: 0.8,
      },
      ms: 10,
    }
    const s = formatFederation(r)
    expect(s).toContain('최종')
    expect(s).toContain('0.8')
    expect(s).toContain('claude')
  })
  it('Head 실패 시 headError 를 표시한다', () => {
    const r: FederationResult = {
      question: 'q',
      workers: [{ provider: 'claude', model: 'm', ok: false, text: '', error: 'x', ms: 0 }],
      head: null,
      headError: '모든 워커가 실패해 Head 검토를 건너뜀',
      ms: 3,
    }
    expect(formatFederation(r)).toContain('Head 없음')
  })
})
