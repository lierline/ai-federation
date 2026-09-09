#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { federate } from './federate.js'
import { ensemble } from './ensemble.js'
import { missingKeys } from './config.js'
import { enabledWorkerSpecs } from './models.js'
import type { FederationResult } from './types.js'

const ASK_SYSTEM = '너는 정확하고 간결한 조력자다. 모르면 모른다고 정직하게 답한다.'

/** 판단 결과를 터미널용 문자열로 포매팅(순수). */
export function formatFederation(r: FederationResult): string {
  const lines: string[] = []
  lines.push(`❓ ${r.question}`)
  lines.push('')
  lines.push('── 워커 원답변 ──')
  for (const w of r.workers) {
    lines.push(w.ok ? `• ${w.provider} (${w.ms}ms): ${w.text}` : `• ${w.provider}: [실패: ${w.error ?? '?'}]`)
  }
  lines.push('')
  if (r.head) {
    lines.push('── Head 신뢰도 ──')
    for (const rk of r.head.rankings) {
      lines.push(`• ${rk.provider}: ${rk.reliability.toFixed(2)} · ${rk.rationale}`)
    }
    if (r.head.consensus) lines.push(`\n합의: ${r.head.consensus}`)
    if (r.head.conflicts) lines.push(`상충: ${r.head.conflicts}`)
    lines.push('')
    lines.push(`✅ 최종답변 (확신도 ${r.head.confidence.toFixed(2)}):`)
    lines.push(r.head.finalAnswer)
  } else {
    lines.push(`⚠ Head 없음 · ${r.headError ?? '알 수 없음'}`)
  }
  lines.push('')
  lines.push(`(${r.ms}ms)`)
  return lines.join('\n')
}

const USAGE = `사용법:
  aifed judge "질문"    판단 모드 · 3사 답 → Head 신뢰도 재평가 + 확신도
  aifed ask "작업"      생성 모드 · 여러 초안 → Head 종합`

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  const input = rest.join(' ').trim()
  if (!command || !['ask', 'judge'].includes(command) || !input) {
    console.log(USAGE)
    return command ? 1 : 0
  }
  if (enabledWorkerSpecs().length === 0) {
    console.error(`실행할 수 있는 provider 가 없습니다. 다음 키 중 최소 1개를 .env.local 에 설정하세요:\n  ${missingKeys().join(', ')}`)
    return 1
  }
  const missing = missingKeys()
  if (missing.length) console.error(`(참고) 미설정 키: ${missing.join(', ')} · 해당 provider 는 제외하고 진행합니다.\n`)

  if (command === 'judge') {
    const r = await federate(input)
    console.log(formatFederation(r))
  } else {
    const r = await ensemble({ system: ASK_SYSTEM, prompt: input, tier: 'head' })
    console.log(r.text)
    console.error(`\n(tier=${r.tier} · 워커=${r.fastModels.join(',') || '없음'} · headUsed=${r.headUsed}${r.degraded ? ' · degraded' : ''})`)
  }
  return 0
}

const isMain = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : String(e))
      process.exit(1)
    })
}
