// =============================================================================
// 모델 후보 평가 · 판정(정답 있는 위험도 분류)과 작성(블라인드 짝 비교)
// =============================================================================
// 사용:
//   AIFED_EVAL_CASES=<정답 사례 JSON 경로> AIFED_EVAL_OUT=<결과 폴더> npx tsx src/eval/models-eval.ts [judge|write|prodcap|all]
//   초안 한도 비교: AIFED_EVAL_BASE=<prodcap-*.json> AIFED_DRAFT_HEADROOM=.. AIFED_DRAFT_HINT=0|1 ... models-eval.ts draftcap
//   다시 채점: AIFED_EVAL_DRAFTS=<write-*.json> AIFED_EVAL_RESCORE_JUDGE=openai:gpt-6.1-sol ... models-eval.ts rescore
//
// 🔴 정답 사례는 제품의 비공개 자료다. 이 저장소는 공개라서 사례 파일을 저장소 밖에서 읽고,
//    결과 폴더도 저장소 밖으로 둔다. 저장소에 남기는 것은 집계 숫자뿐이다.
//
// 판정: 사례마다 LOW · MEDIUM · HIGH 를 맞히는지. 정확도와 «낮게 부른» 비율(위험을 놓친 쪽)을 함께 본다.
// 작성: 현행 구성(A)과 후보를 같은 과제에 돌려, 다른 회사 심사 모델 둘이 이름을 가린 채 A/B 양방향으로 비교한다.
//       심사 모델은 Head(Claude)와 다른 회사를 쓴다(제 편 들기 방지).

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { AsyncLocalStorage } from 'node:async_hooks'
import path from 'node:path'
import { generateText } from 'ai'
import { loadLocalEnv } from '../config.js'
import { configure, languageModelById, thinksByDefault, type UsageEvent } from '../providers.js'
import { federate } from '../federate.js'
import { ensemble } from '../ensemble.js'
import type { Provider } from '../registry.js'
import { WRITING_TASKS } from './writing-tasks.js'

loadLocalEnv()

// ── 단가(USD / 1M 토큰, 2026-09-30 각 사 공식 가격표) ───────────────────────
// gemini-3.8-flash 는 12-31 까지 할인가(0.75/3.75)이고 2027-01-01 부터 두 배다. 오래 쓸 값을 보려고 정가로 잰다.
const PRICE: Record<string, [number, number]> = {
  'claude-haiku-4-5-20251001': [1, 5],
  'claude-haiku-4-5': [1, 5],
  'claude-sonnet-4-5-20250929': [3, 15],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-4-8': [5, 25],
  'claude-opus-5-5': [4, 20],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-6-luna': [0.1, 0.5],
  'gpt-6.1-sol': [2, 10],
  'gpt-6-astra': [10, 50],
  'gemini-2.5-flash': [0.3, 2.5],
  'gemini-3.8-flash': [1.5, 7.5],
  'gemini-3.1-pro-preview': [2, 12],
}
function cost(u: UsageEvent): number {
  const p = PRICE[u.model]
  if (!p) throw new Error(`단가 없음: ${u.model}`)
  return (u.inputTokens * p[0] + u.outputTokens * p[1]) / 1e6
}

// ── 구성 ────────────────────────────────────────────────────────────────────
interface Ensemble3 {
  kind: 'federation'
  key: string
  label: string
  env: Record<string, string>
}
interface Single {
  kind: 'single'
  key: string
  label: string
  provider: Provider
  id: string
}
type Config = Ensemble3 | Single

const fed = (key: string, label: string, claude: string, openai: string, gemini: string, head: string): Ensemble3 => ({
  kind: 'federation',
  key,
  label,
  env: {
    AIFED_MODEL_WORKER_CLAUDE: claude,
    AIFED_MODEL_WORKER_OPENAI: openai,
    AIFED_MODEL_WORKER_GEMINI: gemini,
    AIFED_MODEL_HEAD: head,
    AIFED_MODEL_FAST: claude,
  },
})
const single = (key: string, label: string, provider: Provider, id: string): Single => ({ kind: 'single', key, label, provider, id })

const A48 = fed('A48', '현행 3사 + Opus 4.8 (이전 관리자)', 'claude-haiku-4-5-20251001', 'gpt-4o-mini', 'gemini-2.5-flash', 'claude-opus-4-8')
// 2026-09-30 오후부터 운영 관리자는 Opus 5.5. 작성 비교의 기준(A)은 운영 구성이다.
const A = fed('A', '현행 3사 + Opus 5.5 (운영)', 'claude-haiku-4-5-20251001', 'gpt-4o-mini', 'gemini-2.5-flash', 'claude-opus-5-5')
const B = fed('B', '같은 급 최신 3사 + Opus 5.5', 'claude-haiku-4-5-20251001', 'gpt-6-luna', 'gemini-3.8-flash', 'claude-opus-5-5')
const C = fed('C', '한 급 위 3사 + Opus 5.5', 'claude-sonnet-5-5', 'gpt-6.1-sol', 'gemini-3.8-flash', 'claude-opus-5-5')

const JUDGE_CONFIGS: Config[] = [
  A48,
  B,
  C,
  single('S-haiku45', '단일 Haiku 4.5 (현 fast)', 'anthropic', 'claude-haiku-4-5-20251001'),
  single('S-sonnet45', '단일 Sonnet 4.5 (현 draft)', 'anthropic', 'claude-sonnet-4-5-20250929'),
  single('S-sonnet55', '단일 Sonnet 5.5', 'anthropic', 'claude-sonnet-5-5'),
  single('S-opus48', '단일 Opus 4.8 (현 head)', 'anthropic', 'claude-opus-4-8'),
  single('S-opus55', '단일 Opus 5.5', 'anthropic', 'claude-opus-5-5'),
]
const WRITE_CONFIGS: Config[] = [
  A,
  A48,
  B,
  C,
  single('S-opus55', '단일 Opus 5.5', 'anthropic', 'claude-opus-5-5'),
  single('S-sonnet55', '단일 Sonnet 5.5', 'anthropic', 'claude-sonnet-5-5'),
]
const JUDGES: { provider: Provider; id: string }[] = [
  // 2026-09-30: GPT-6 Astra($10/$50)가 평가 도중 OpenAI 잔액을 바닥냈다. 한 단계 아래 Sol 로도
  // 판정 방향이 같았다(재채점). 비싼 심사 모델은 쓰지 않는다.
  { provider: 'openai', id: 'gpt-6.1-sol' },
  { provider: 'google', id: 'gemini-3.1-pro-preview' },
]

// ── 공용 ────────────────────────────────────────────────────────────────────
// 사례마다 비용을 따로 모은다. 동시에 여러 사례를 돌려도 섞이지 않게 비동기 문맥에 담는다.
const usageStore = new AsyncLocalStorage<UsageEvent[]>()
const record = (u: UsageEvent) => void usageStore.getStore()?.push(u)
configure({ onUsage: record })
async function metered<T>(fn: () => Promise<T>): Promise<{ value: T; cost: number; events: UsageEvent[] }> {
  const mine: UsageEvent[] = []
  const value = await usageStore.run(mine, fn)
  return { value, cost: mine.reduce((s, u) => s + cost(u), 0), events: mine }
}

function withEnv<T>(env: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
}

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

async function singleCall(c: Single, system: string | undefined, prompt: string, maxTokens: number): Promise<string> {
  const { text, usage, finishReason } = await generateText({
    model: languageModelById(c.provider, c.id),
    system,
    prompt,
    maxOutputTokens: maxTokens,
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(240_000),
  })
  record({ model: c.id, stage: 'single', inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0, finishReason })
  return text.trim()
}

// ── 판정 평가 ───────────────────────────────────────────────────────────────
type Level = 'LOW' | 'MEDIUM' | 'HIGH'
const RANK: Record<Level, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 }

interface Case {
  caseId: string
  title: string
  market: string
  target: string
  product: Record<string, unknown>
  beforeKey?: string
  afterKey?: string
  subTypes?: string[]
  reasons?: string[]
  actualRiskLevel: Level
}

const RUBRIC = `판정 기준(이것만 쓴다):
- LOW: 경미. 문서화 · 보고로 충분하고 사전 허가가 필요 없다.
- MEDIUM: 추가 검토 · 평가가 필요하다(변경허가 · 동등성 입증 · 추가 자료). 신규 제출까지는 아니다.
- HIGH: 신규 허가 · 510(k) · MDR 제출이 필요할 수 있다.
시장별 차이(MFDS 변경허가 · 변경신고, FDA 510(k) 변경 판단 지침, EU MDCG 2020-3)를 고려하되 사례만 보고 판단한다.
애매하면 보수적으로(놓치는 쪽이 과하게 부르는 쪽보다 훨씬 나쁘다).`

export function casePrompt(c: Case): string {
  return `의료기기 변경 한 건의 규제 위험도를 판정하라.

${RUBRIC}

[사례]
제목: ${c.title}
시장: ${c.market}
변경 대상: ${c.target}${c.subTypes?.length ? ` (${c.subTypes.join(', ')})` : ''}
제품 속성: ${JSON.stringify(c.product)}
변경 전: ${c.beforeKey ?? '-'}
변경 후: ${c.afterKey ?? '-'}${c.reasons?.length ? `\n변경 사유: ${c.reasons.join(', ')}` : ''}

근거를 짧게 쓰고, 마지막 줄에 «판정: LOW» · «판정: MEDIUM» · «판정: HIGH» 중 하나만 써라.`
}

export function parseLevel(text: string): Level | null {
  const tagged = [...text.matchAll(/판정\s*[:：]\s*\**\s*(LOW|MEDIUM|HIGH)/gi)]
  if (tagged.length) return tagged[tagged.length - 1][1].toUpperCase() as Level
  const any = [...text.matchAll(/\b(LOW|MEDIUM|HIGH)\b/g)]
  return any.length ? (any[any.length - 1][1] as Level) : null
}

interface JudgeRow {
  caseId: string
  label: Level
  pred: Level | null
  ms: number
  cost: number
  degraded?: boolean
  error?: string
}

async function runJudgeConfig(c: Config, cases: Case[]): Promise<JudgeRow[]> {
  const run = async (k: Case): Promise<JudgeRow> => {
    const started = Date.now()
    const mine: UsageEvent[] = []
    const spent = () => mine.reduce((s, u) => s + cost(u), 0)
    try {
      const { text, degraded } = await usageStore.run(mine, async () => {
        if (c.kind === 'single') return { text: await singleCall(c, undefined, casePrompt(k), 16_000), degraded: false }
        const r = await federate(casePrompt(k))
        if (!r.head) throw new Error(r.headError ?? 'Head 없음')
        return { text: r.head.finalAnswer, degraded: r.workers.some((w) => !w.ok) }
      })
      return { caseId: k.caseId, label: k.actualRiskLevel, pred: parseLevel(text), ms: Date.now() - started, cost: spent(), degraded }
    } catch (e) {
      return { caseId: k.caseId, label: k.actualRiskLevel, pred: null, ms: Date.now() - started, cost: spent(), error: e instanceof Error ? e.message.slice(0, 200) : String(e) }
    }
  }
  // 구성 사이는 환경변수(역할 덮어쓰기)가 겹치므로 federation 구성은 차례로, 한 구성 안의 사례는 동시에.
  const exec = () => pool(cases, 6, run)
  return c.kind === 'federation' ? withEnv(c.env, exec) : exec()
}

function summarizeJudge(rows: JudgeRow[]) {
  const n = rows.length
  const answered = rows.filter((r) => r.pred)
  const correct = rows.filter((r) => r.pred === r.label).length
  const under = rows.filter((r) => r.pred && RANK[r.pred] < RANK[r.label]).length
  const missedHigh = rows.filter((r) => r.label === 'HIGH' && r.pred !== 'HIGH').length
  const highs = rows.filter((r) => r.label === 'HIGH').length
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b)
  return {
    n,
    accuracy: correct / n,
    underCall: under / n,
    highRecall: highs ? (highs - missedHigh) / highs : 1,
    noAnswer: n - answered.length,
    errors: rows.filter((r) => r.error).length,
    degraded: rows.filter((r) => r.degraded).length,
    costPerCase: rows.reduce((s, r) => s + r.cost, 0) / n,
    p50ms: ms[Math.floor(n * 0.5)],
    p90ms: ms[Math.floor(n * 0.9)],
  }
}

// ── 작성 평가 ───────────────────────────────────────────────────────────────
// 🔑 2026-09-30 재측정: 첫 측정은 현행 초안만 1,600토큰에서 잘려 무효였다. 이번에는 모든 구성의
//    «보이는 본문» 한도를 BODY 하나로 맞춘다. 생각하는 모델은 생각 몫(8,000)을 더 받는다
//    (headOutputBudget 과 같은 규칙). 잘렸는지는 모델이 돌려준 종료 사유('length')로 센다.
const BODY = Number(process.env.AIFED_EVAL_BODY) || 4000

interface Draft {
  text: string
  ms: number
  cost: number
  degraded: boolean
  /** 최종본(관리자 또는 단일 모델)이 한도에서 잘렸다 */
  cut: boolean
  /** 3사 초안 가운데 한도에서 잘린 수 */
  workerCuts: number
  error?: string
}

async function produce(c: Config, t: (typeof WRITING_TASKS)[number], body = BODY): Promise<Draft> {
  const started = Date.now()
  const { value, cost: spent, events } = await metered(async () => {
    if (c.kind === 'single') {
      const cap = thinksByDefault(c.id) ? body + 8000 : body
      return { text: await singleCall(c, t.system, t.prompt, cap), degraded: false }
    }
    const r = await ensemble({ system: t.system, prompt: t.prompt, tier: 'head', maxTokens: body, headTimeoutMs: 240_000, fastTimeoutMs: 90_000 })
    return { text: r.text, degraded: r.degraded }
  })
  return {
    ...value,
    ms: Date.now() - started,
    cost: spent,
    cut: events.some((e) => (e.stage === 'head' || e.stage === 'single') && e.finishReason === 'length'),
    workerCuts: events.filter((e) => e.stage === 'worker' && e.finishReason === 'length').length,
  }
}

const AXES = ['완결성', '정확성', '규제정합', '명확성'] as const
const JUDGE_SYS = '당신은 엄정한 의료기기 규제문서 품질 심사관이다. 두 초안 A/B 를 규제문서 관점에서 비교 채점한다. 길이가 아니라 내용의 정확성과 쓸모를 본다. 편견 없이 내용만 본다.'
function judgePrompt(task: string, a: string, b: string): string {
  return `[작업]\n${task}\n\n[초안 A]\n${a}\n\n[초안 B]\n${b}\n\n각 초안을 4축(${AXES.join('·')}) 1~10 점으로 채점하고 종합 우수한 쪽을 고르시오. JSON 만 출력: {"a":{"완결성":n,"정확성":n,"규제정합":n,"명확성":n},"b":{...},"winner":"A"|"B"|"TIE"}`
}

interface Verdict {
  judge: string
  order: 'base-first' | 'cand-first'
  winner: 'base' | 'cand' | 'tie' | 'error'
  baseScore: number
  candScore: number
}

async function compare(
  task: (typeof WRITING_TASKS)[number],
  base: string,
  cand: string,
  judges: { provider: Provider; id: string }[] = JUDGES,
): Promise<Verdict[]> {
  const out: Verdict[] = []
  for (const j of judges) {
    for (const order of ['base-first', 'cand-first'] as const) {
      const [a, b] = order === 'base-first' ? [base, cand] : [cand, base]
      try {
        const { text, usage } = await generateText({
          model: languageModelById(j.provider, j.id),
          system: JUDGE_SYS,
          prompt: judgePrompt(`${task.system}\n${task.prompt}`, a, b),
          maxOutputTokens: 8000,
          maxRetries: 2,
          abortSignal: AbortSignal.timeout(180_000),
        })
        record({ model: j.id, stage: 'single', inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 })
        const m = text.match(/\{[\s\S]*\}/)
        const v = JSON.parse(m ? m[0] : text) as { a: Record<string, number>; b: Record<string, number>; winner: string }
        const sum = (s: Record<string, number>) => AXES.reduce((acc, k) => acc + Number(s[k] ?? 0), 0)
        const [sa, sb] = [sum(v.a), sum(v.b)]
        const w = String(v.winner).toUpperCase()
        const winnerAB = w === 'A' ? 'a' : w === 'B' ? 'b' : 'tie'
        const winner = winnerAB === 'tie' ? 'tie' : (winnerAB === 'a') === (order === 'base-first') ? 'base' : 'cand'
        out.push({ judge: j.id, order, winner, baseScore: order === 'base-first' ? sa : sb, candScore: order === 'base-first' ? sb : sa })
      } catch {
        out.push({ judge: j.id, order, winner: 'error', baseScore: 0, candScore: 0 })
      }
    }
  }
  return out
}

type Comparison = { task: string; skipped?: string; verdicts: Verdict[] }

function logComparison(key: string, rows: Comparison[]) {
  const all = rows.flatMap((x) => x.verdicts)
  const vs = all.filter((v) => v.winner !== 'error')
  const wins = vs.filter((v) => v.winner === 'cand').length
  const losses = vs.filter((v) => v.winner === 'base').length
  const delta = vs.reduce((s, v) => s + (v.candScore - v.baseScore), 0) / Math.max(1, vs.length) / 4
  const skipped = rows.filter((x) => x.skipped).length
  const byJudge = [...new Set(all.map((v) => v.judge))]
    .map((j) => `${j} ${vs.filter((v) => v.judge === j).length}/${all.filter((v) => v.judge === j).length}`)
    .join(' · ')
  console.log(
    `[작성] ${key} 대 A · 비교 ${rows.length - skipped}과제(뺀 과제 ${skipped}) · 후보 승 ${wins} · 기준 승 ${losses} · 비김 ${vs.length - wins - losses} · 축 평균 차 ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}/10 · 유효 심사 ${byJudge}`,
  )
}

// ── 실행 ────────────────────────────────────────────────────────────────────
async function main(): Promise<number> {
  const mode = process.argv[2] ?? 'all'
  const outDir = process.env.AIFED_EVAL_OUT
  if (!outDir) throw new Error('AIFED_EVAL_OUT(저장소 밖 결과 폴더)를 주십시오')
  mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  if (mode === 'judge' || mode === 'all') {
    const casesPath = process.env.AIFED_EVAL_CASES
    if (!casesPath) throw new Error('AIFED_EVAL_CASES(정답 사례 JSON)를 주십시오')
    const cases = JSON.parse(readFileSync(casesPath, 'utf8')) as Case[]
    const limit = Number(process.env.AIFED_EVAL_LIMIT) || cases.length
    const sample = cases.slice(0, limit)
    const only = process.env.AIFED_EVAL_ONLY?.split(',')
    const configs = only ? JUDGE_CONFIGS.filter((c) => only.includes(c.key)) : JUDGE_CONFIGS
    const result: Record<string, { label: string; summary: ReturnType<typeof summarizeJudge>; rows: JudgeRow[] }> = {}
    // 구성끼리는 환경변수가 겹치지 않는 단일 구성만 동시에 돌린다. federation 구성은 차례로.
    const singles = configs.filter((c) => c.kind === 'single')
    const feds = configs.filter((c) => c.kind === 'federation')
    const runOne = async (c: Config) => {
      const t0 = Date.now()
      const rows = await runJudgeConfig(c, sample)
      result[c.key] = { label: c.label, summary: summarizeJudge(rows), rows }
      const s = result[c.key].summary
      console.log(`[판정] ${c.key} ${c.label} · 정확도 ${(s.accuracy * 100).toFixed(1)}% · 낮게 부름 ${(s.underCall * 100).toFixed(1)}% · HIGH 재현 ${(s.highRecall * 100).toFixed(1)}% · 무응답 ${s.noAnswer} · 오류 ${s.errors} · 건당 $${s.costPerCase.toFixed(4)} · 중앙 ${(s.p50ms / 1000).toFixed(1)}초 · (${((Date.now() - t0) / 60000).toFixed(1)}분)`)
    }
    await Promise.all([pool(singles, singles.length, runOne), (async () => { for (const c of feds) await runOne(c) })()])
    writeFileSync(path.join(outDir, `judge-${stamp}.json`), JSON.stringify(result, null, 1))
  }

  if (mode === 'write' || mode === 'all') {
    const drafts: Record<string, Draft[]> = {}
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
    const failed = (e: unknown): Draft => ({ text: '', ms: 0, cost: 0, degraded: true, cut: false, workerCuts: 0, error: String(e) })
    for (const c of WRITE_CONFIGS) {
      const gen = () => pool(WRITING_TASKS, 6, (t) => produce(c, t).catch(failed))
      drafts[c.key] = await (c.kind === 'federation' ? withEnv(c.env, gen) : gen())
      const d = drafts[c.key]
      console.log(
        `[작성] ${c.key} ${c.label} · 빈 답 ${d.filter((x) => !x.text).length} · 최종본 잘림 ${d.filter((x) => x.cut).length} · 초안 잘림 ${d.reduce((s, x) => s + x.workerCuts, 0)} · 길이 중앙 ${median(d.map((x) => x.text.length))}자 · 건당 $${(d.reduce((s, x) => s + x.cost, 0) / d.length).toFixed(4)} · 중앙 ${(median(d.map((x) => x.ms)) / 1000).toFixed(1)}초`,
      )
    }
    const comparisons: Record<string, Comparison[]> = {}
    for (const c of WRITE_CONFIGS.filter((x) => x.key !== 'A')) {
      comparisons[c.key] = await pool(WRITING_TASKS, 4, async (t, i) => {
        const [a, b] = [drafts.A[i], drafts[c.key][i]]
        // 잘린 답이 끼면 비교하지 않는다(지난번 무효의 원인). 따로 센다.
        if (!a.text || !b.text) return { task: t.name, skipped: '빈 답', verdicts: [] }
        if (a.cut || b.cut) return { task: t.name, skipped: '잘림', verdicts: [] }
        return { task: t.name, verdicts: await compare(t, a.text, b.text) }
      })
      logComparison(c.key, comparisons[c.key])
    }
    writeFileSync(path.join(outDir, `write-${stamp}.json`), JSON.stringify({ body: BODY, drafts, comparisons }, null, 1))
  }

  // 운영 한도 점검: Q-Atelier 작성 도우미는 본문 한도 500 · 600 · 700토큰으로 부른다.
  // 지금 운영 구성(A)이 그 한도에서 잘리는지 센다(품질 비교는 하지 않는다).
  if (mode === 'prodcap' || mode === 'all') {
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
    const failed = (e: unknown): Draft => ({ text: '', ms: 0, cost: 0, degraded: true, cut: false, workerCuts: 0, error: String(e) })
    const out: Record<number, Draft[]> = {}
    for (const cap of [500, 600, 700]) {
      out[cap] = await withEnv(A.env, () => pool(WRITING_TASKS, 6, (t) => produce(A, t, cap).catch(failed)))
      const d = out[cap]
      console.log(
        `[운영 한도 ${cap}] 최종본 잘림 ${d.filter((x) => x.cut).length}/${d.length} · 초안 잘림 ${d.reduce((s, x) => s + x.workerCuts, 0)}/${d.length * 3} · 빈 답 ${d.filter((x) => !x.text).length} · 건당 $${(d.reduce((s, x) => s + x.cost, 0) / d.length).toFixed(4)} · 중앙 ${(median(d.map((x) => x.ms)) / 1000).toFixed(1)}초 · 길이 중앙 ${median(d.map((x) => x.text.length))}자`,
      )
    }
    writeFileSync(path.join(outDir, `prodcap-${stamp}.json`), JSON.stringify(out, null, 1))
  }

  // 초안 한도 비교: 운영 한도 600에서 지금 초안 규칙(환경변수)으로 A 구성을 돌리고,
  // 예전 규칙(초안도 600)으로 만든 최종본(prodcap 저장본)과 두 심사 모델로 비교한다. 심사 비용까지 잰다.
  if (mode === 'draftcap') {
    const basePath = process.env.AIFED_EVAL_BASE
    if (!basePath) throw new Error('AIFED_EVAL_BASE(prodcap-*.json)를 주십시오')
    const cap = Number(process.env.AIFED_EVAL_CAP) || 600
    const base = (JSON.parse(readFileSync(basePath, 'utf8')) as Record<string, Draft[]>)[String(cap)]
    if (!base || base.length !== WRITING_TASKS.length) throw new Error(`저장본에 한도 ${cap} 결과가 없습니다`)
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
    const failed = (e: unknown): Draft => ({ text: '', ms: 0, cost: 0, degraded: true, cut: false, workerCuts: 0, error: String(e) })
    const label = `초안 한도 ×${process.env.AIFED_DRAFT_HEADROOM || '1.5'} · 분량 안내 ${process.env.AIFED_DRAFT_HINT === '0' ? '끔' : '켬'}`
    const d = await withEnv(A.env, () => pool(WRITING_TASKS, 6, (t) => produce(A, t, cap).catch(failed)))
    console.log(
      `[초안 한도] ${label} · 최종본 잘림 ${d.filter((x) => x.cut).length}/${d.length} · 초안 잘림 ${d.reduce((s, x) => s + x.workerCuts, 0)}/${d.length * 3} · 빈 답 ${d.filter((x) => !x.text).length} · 건당 $${(d.reduce((s, x) => s + x.cost, 0) / d.length).toFixed(4)} · 중앙 ${(median(d.map((x) => x.ms)) / 1000).toFixed(1)}초 · 길이 중앙 ${median(d.map((x) => x.text.length))}자`,
    )
    const { value: rows, cost: judgeCost } = await metered(() =>
      pool(WRITING_TASKS, 4, async (t, i): Promise<Comparison> => {
        if (!base[i].text || !d[i].text) return { task: t.name, skipped: '빈 답', verdicts: [] }
        if (base[i].cut || d[i].cut) return { task: t.name, skipped: '잘림', verdicts: [] }
        return { task: t.name, verdicts: await compare(t, base[i].text, d[i].text) }
      }),
    )
    logComparison(`초안 새 규칙(${label})`, rows)
    console.log(`[초안 한도] 심사 비용 $${judgeCost.toFixed(2)} · 생성 비용 $${d.reduce((s, x) => s + x.cost, 0).toFixed(2)}`)
    writeFileSync(path.join(outDir, `draftcap-${stamp}.json`), JSON.stringify({ label, cap, drafts: d, comparisons: rows }, null, 1))
  }

  // 다시 채점: 이미 써 둔 글(write-*.json)을 새로 쓰지 않고, 한 심사 모델의 판정만 바꿔 다시 매긴다.
  // 2026-09-30 첫 재측정은 도중에 OpenAI 잔액이 바닥나 GPT 심사가 절반 넘게 비었다.
  // 바꾸는 심사 모델과 같은 회사의 옛 판정을 빼고 새 판정을 넣는다(다른 회사 심사는 그대로 둔다).
  if (mode === 'rescore') {
    const draftsPath = process.env.AIFED_EVAL_DRAFTS
    const spec = process.env.AIFED_EVAL_RESCORE_JUDGE
    if (!draftsPath || !spec) throw new Error('AIFED_EVAL_DRAFTS(write-*.json)와 AIFED_EVAL_RESCORE_JUDGE(회사:모델)를 주십시오')
    const [provider, id] = spec.split(':') as [Provider, string]
    if (!PRICE[id]) throw new Error(`${id} 의 단가가 PRICE 표에 없습니다`)
    const judge = { provider, id }
    const sameMaker = provider === 'openai' ? /^gpt/ : provider === 'google' ? /^gemini/ : /^claude/
    // 잔액이 없으면 수백 건이 모두 «심사 실패» 로 쌓인다. 한 번 불러 보고 시작한다.
    await generateText({ model: languageModelById(provider, id), prompt: '1', maxOutputTokens: 16, maxRetries: 0 })
    const saved = JSON.parse(readFileSync(draftsPath, 'utf8')) as {
      body: number
      drafts: Record<string, Draft[]>
      comparisons: Record<string, Comparison[]>
    }
    const { value: rescored, cost: spent } = await metered(async () => {
      const out: Record<string, Comparison[]> = {}
      for (const key of Object.keys(saved.comparisons)) {
        out[key] = await pool(saved.comparisons[key], 4, async (row, i) => {
          if (row.skipped) return row
          const t = WRITING_TASKS[i]
          if (t.name !== row.task) throw new Error(`과제 순서가 저장본과 다릅니다: ${t.name} ≠ ${row.task}`)
          const kept = row.verdicts.filter((v) => !sameMaker.test(v.judge))
          const fresh = await compare(t, saved.drafts.A[i].text, saved.drafts[key][i].text, [judge])
          return { ...row, verdicts: [...kept, ...fresh] }
        })
        logComparison(key, out[key])
      }
      return out
    })
    console.log(`[다시 채점] ${id} · 쓴 돈 $${spent.toFixed(2)}`)
    writeFileSync(path.join(outDir, `rescore-${stamp}.json`), JSON.stringify({ ...saved, comparisons: rescored, rescoredWith: id }, null, 1))
  }

  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
