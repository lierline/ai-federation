/** 답변에 기대 키워드가 얼마나 포함됐는지 비율(0..1)로 채점(대소문자 무시). 키워드 없으면 1. */
export function gradeContains(answer: string, expectedKeywords: string[]): number {
  if (expectedKeywords.length === 0) return 1
  const hay = answer.toLowerCase()
  const hit = expectedKeywords.filter((k) => hay.includes(k.toLowerCase())).length
  return hit / expectedKeywords.length
}
