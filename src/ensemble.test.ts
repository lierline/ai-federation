import { describe, it, expect } from 'vitest'
import { ensemble } from './ensemble.js'
import type { WorkerResult } from './types.js'

const two: WorkerResult[] = [
  { provider: 'claude', model: 'm', ok: true, text: '짧다', ms: 1 },
  { provider: 'openai', model: 'm', ok: true, text: '더 긴 초안입니다', ms: 1 },
]

describe('ensemble', () => {
  it('head tier: synth 결과를 반환하고 headUsed=true', async () => {
    const r = await ensemble(
      { system: 's', prompt: 'p', tier: 'head' },
      { collect: async () => two, synth: async () => '종합본' },
    )
    expect(r).toMatchObject({ text: '종합본', tier: 'head', headUsed: true, degraded: false })
    expect(r.fastModels).toEqual(['claude', 'openai'])
  })
  it('consensus tier: Head 스킵, 첫 초안', async () => {
    const r = await ensemble(
      { system: 's', prompt: 'p', tier: 'consensus' },
      { collect: async () => two, synth: async () => '안불림' },
    )
    expect(r).toMatchObject({ text: '짧다', tier: 'consensus', headUsed: false })
  })
  it('fast 전부 실패: 단일 폴백 + degraded', async () => {
    const r = await ensemble(
      { system: 's', prompt: 'p', tier: 'head' },
      { collect: async () => [], single: async () => '폴백', synth: async () => 'x' },
    )
    expect(r).toMatchObject({ text: '폴백', headUsed: false, degraded: true, fastModels: [] })
  })
  it('Head 실패: 최장 초안 반환 + degraded', async () => {
    const r = await ensemble(
      { system: 's', prompt: 'p', tier: 'head' },
      {
        collect: async () => two,
        synth: async () => {
          throw new Error('down')
        },
      },
    )
    expect(r).toMatchObject({ text: '더 긴 초안입니다', headUsed: false, degraded: true })
  })
  it('single tier: 단일 호출', async () => {
    const r = await ensemble(
      { system: 's', prompt: 'p', tier: 'single' },
      { single: async () => '단일답' },
    )
    expect(r).toMatchObject({ text: '단일답', tier: 'single', headUsed: false })
  })
})
