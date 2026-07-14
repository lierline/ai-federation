import { federate } from '../federate.js'
import { missingKeys } from '../config.js'
import { enabledWorkerSpecs } from '../models.js'
import { DATASET } from './dataset.js'
import { gradeContains } from './grade.js'

/**
 * 평가 하네스 — 각 케이스를 federate 로 돌려 최종답변의 키워드 포함율(정확도)과
 * Head 확신도를 집계한다. 실제 모델 호출(네트워크)이라 단위테스트 대상이 아니다.
 */
async function main(): Promise<number> {
  if (enabledWorkerSpecs().length === 0) {
    console.error(`실행 가능한 provider 가 없습니다. .env.local 에 키를 설정하세요: ${missingKeys().join(', ')}`)
    return 1
  }
  let scoreSum = 0
  let confSum = 0
  for (const c of DATASET) {
    const r = await federate(c.question)
    const answer = r.head?.finalAnswer ?? ''
    const score = gradeContains(answer, c.expect)
    const conf = r.head?.confidence ?? 0
    scoreSum += score
    confSum += conf
    const okWorkers = r.workers.filter((w) => w.ok).map((w) => w.provider).join(',') || '없음'
    console.log(`[${score === 1 ? 'PASS' : 'MISS'}] score=${score.toFixed(2)} conf=${conf.toFixed(2)} 워커=${okWorkers}`)
    console.log(`  Q: ${c.question}`)
    console.log(`  A: ${answer.replace(/\n/g, ' ').slice(0, 120)}`)
  }
  const n = DATASET.length
  console.log(`\n── 집계 (${n}건) ──`)
  console.log(`평균 정확도: ${(scoreSum / n).toFixed(2)}  ·  평균 확신도: ${(confSum / n).toFixed(2)}`)
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
