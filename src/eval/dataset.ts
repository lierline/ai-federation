/** 평가 케이스 · 질문 + 최종답변에 반드시 포함돼야 할 핵심 키워드. */
export interface EvalCase {
  question: string
  expect: string[]
}

export const DATASET: EvalCase[] = [
  { question: '대한민국의 수도는? 도시 이름만 답하라.', expect: ['서울'] },
  { question: '2 더하기 2는? 숫자만 답하라.', expect: ['4'] },
  { question: '지구에서 가장 큰 대양의 이름은?', expect: ['태평양'] },
  { question: '물이 어는 섭씨 온도는? 숫자만 답하라.', expect: ['0'] },
  { question: '희곡 『햄릿』을 쓴 작가는 누구인가?', expect: ['셰익스피어'] },
]
