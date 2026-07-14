import { describe, it, expect } from 'vitest'
import { gradeContains } from './grade.js'

describe('gradeContains', () => {
  it('키워드 전부 포함이면 1', () => {
    expect(gradeContains('오늘은 맑고 따뜻하다', ['맑', '따뜻'])).toBe(1)
  })
  it('절반만 포함이면 0.5', () => {
    expect(gradeContains('맑음', ['맑', '비'])).toBe(0.5)
  })
  it('대소문자 무시', () => {
    expect(gradeContains('The answer is H2O', ['h2o'])).toBe(1)
  })
  it('키워드 없으면 1', () => {
    expect(gradeContains('무엇이든', [])).toBe(1)
  })
})
