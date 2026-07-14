import { describe, it, expect } from 'vitest'
import * as api from './index.js'

describe('public api', () => {
  it('공개 API 를 노출한다', () => {
    expect(typeof api.federate).toBe('function')
    expect(typeof api.ensemble).toBe('function')
    expect(typeof api.missingKeys).toBe('function')
    expect(api.PROVIDER_IDS).toEqual(['claude', 'openai', 'gemini'])
  })
})
