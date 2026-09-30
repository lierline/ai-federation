import { generateText, streamText } from 'ai'
import { enabledWorkerSpecs } from './models.js'
import { buildSynthesisPrompt, headOutputBudget, HEAD_SYNTHESIS_GUIDE, synthesize } from './head-synth.js'
import { limits } from './config.js'
import { modelFor, type TextRole } from './registry.js'
import { hasKey, languageModel, reportFailure, reportUsage, syncModels } from './providers.js'
import type { EnsembleResult, EnsembleTier, ProviderId, WorkerResult } from './types.js'

// =============================================================================
// 생성 모드 · 여러 fast 초안 → Head 종합
// =============================================================================
// Q-Atelier lib/ai/head-ensemble.ts(운영 중)의 동작을 옮겨 왔다. 파일럿 실측
// (writing-head-pilot · 6전6승 · Δ+1.6/10)으로 검증된 구조다.
//   tier 'head'      : N fast 병렬 초안 → Head 종합   (작성 · 발산)
//   tier 'consensus' : N fast 만, Head 없음            (수렴 작업 · Head 이득 0 실측)
//   tier 'single'    : 단일 fast                       (사소한 작업)
// 정직보류: fast 일부 실패 → 나머지로 진행 · 전부 실패 → 단일 폴백 · Head 실패 → 가장 긴 초안.
// 어느 경우든 degraded 로 알린다. 한 갈래가 조용히 빠지는 순간은 reportFailure 로 넘긴다.

export interface EnsembleOpts {
  system: string
  prompt: string
  tier: EnsembleTier
  maxTokens?: number
  fastTimeoutMs?: number
  headTimeoutMs?: number
  /** 기록용 작업 이름. 예: 'capa.assist-draft' */
  operation?: string
}

export interface EnsembleDeps {
  collect?: (o: EnsembleOpts) => Promise<{ active: ProviderId[]; drafts: WorkerResult[] }>
  synth?: (system: string, prompt: string, drafts: WorkerResult[], maxTokens: number, timeoutMs?: number) => Promise<string>
  single?: (o: EnsembleOpts) => Promise<{ text: string; provider: ProviderId }>
}

const SINGLE_ORDER: { role: TextRole; provider: ProviderId }[] = [
  { role: 'fast', provider: 'claude' },
  { role: 'worker.openai', provider: 'openai' },
  { role: 'worker.gemini', provider: 'gemini' },
]

/**
 * 단일 폴백에 쓸 역할. 키가 있는 첫 제공자(fast → GPT → Gemini 순).
 * 2026-08-11 감사 1번: 예전에는 Anthropic 으로 고정이라 Claude 키가 없으면 폴백까지 죽었다.
 */
export function pickSingle(): { role: TextRole; provider: ProviderId } | null {
  return SINGLE_ORDER.find((c) => hasKey(modelFor(c.role).provider)) ?? null
}

async function defaultSingle(o: EnsembleOpts): Promise<{ text: string; provider: ProviderId }> {
  const pick = pickSingle()
  if (!pick) throw new Error('실행할 수 있는 제공자가 없습니다(키 없음)')
  const { text, usage, finishReason } = await generateText({
    model: languageModel(pick.role),
    system: o.system,
    prompt: o.prompt,
    maxOutputTokens: o.maxTokens ?? limits.maxTokens(),
    maxRetries: 0,
  })
  reportUsage(modelFor(pick.role).id, 'single', usage, finishReason)
  return { text: text.trim(), provider: pick.provider }
}

async function defaultCollect(o: EnsembleOpts): Promise<{ active: ProviderId[]; drafts: WorkerResult[] }> {
  const specs = enabledWorkerSpecs()
  const timeoutMs = o.fastTimeoutMs ?? limits.workerTimeoutMs()
  // 실패 원본을 그대로 넘긴다. 받는 쪽 분류기가 상태 코드(402 잔액 · 429 한도)를 봐야 한다.
  const rawErrors = new Map<ProviderId, unknown>()
  const results = await Promise.all(
    specs.map(async (s): Promise<WorkerResult> => {
      const started = Date.now()
      try {
        const { text, usage, finishReason } = await generateText({
          model: s.build(),
          system: o.system,
          prompt: o.prompt,
          maxOutputTokens: o.maxTokens ?? limits.maxTokens(),
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(timeoutMs),
        })
        reportUsage(s.model, 'worker', usage, finishReason)
        const t = text.trim()
        return { provider: s.provider, model: s.model, ok: !!t, text: t, error: t ? undefined : '빈 응답', ms: Date.now() - started }
      } catch (e) {
        rawErrors.set(s.provider, e)
        return { provider: s.provider, model: s.model, ok: false, text: '', error: e instanceof Error ? e.message : String(e), ms: Date.now() - started }
      }
    }),
  )
  const drafts = results.filter((r) => r.ok)
  // 한 갈래가 죽어도 화면은 멀쩡하고 품질만 조용히 떨어진다. 그 순간을 남긴다(동작은 계속).
  await Promise.all(
    results
      .filter((r) => !r.ok)
      .map((r) =>
        reportFailure({
          provider: specProvider(r.provider),
          operation: `${o.operation ?? 'ensemble'}.fast.${r.model}`,
          error: rawErrors.get(r.provider) ?? new Error(r.error ?? '실패'),
          meta: { active: specs.length, survived: drafts.length, model: r.model },
        }),
      ),
  )
  return { active: specs.map((s) => s.provider), drafts }
}

function specProvider(p: ProviderId) {
  return p === 'claude' ? 'anthropic' : p === 'openai' ? 'openai' : 'google'
}

/** 비스트리밍 앙상블. JSON 응답 계열(assist-draft 등). */
export async function ensemble(opts: EnsembleOpts, deps: EnsembleDeps = {}): Promise<EnsembleResult> {
  await syncModels()
  const collect = deps.collect ?? defaultCollect
  const synth = deps.synth ?? synthesize
  const single = deps.single ?? defaultSingle
  const maxTok = opts.maxTokens ?? limits.maxTokens()

  if (opts.tier === 'single') {
    const s = await single(opts)
    return { text: s.text, tier: 'single', fastModels: [s.provider], headUsed: false, degraded: false }
  }

  const { active, drafts } = await collect(opts)
  if (drafts.length === 0) {
    const s = await single(opts)
    return { text: s.text, tier: opts.tier, fastModels: [], headUsed: false, degraded: true }
  }
  const fastModels = drafts.map((d) => d.provider)
  const partial = drafts.length < active.length

  if (opts.tier === 'consensus') {
    // 2026-08-11 감사 2번: 초안이 하나뿐이면 «합의» 가 아니다. 줄어든 것으로 알린다.
    return {
      text: drafts[0].text,
      tier: 'consensus',
      fastModels,
      headUsed: false,
      degraded: partial || drafts.length < 2,
    }
  }

  try {
    const text = await synth(opts.system, opts.prompt, drafts, maxTok, opts.headTimeoutMs)
    return { text, tier: 'head', fastModels, headUsed: true, degraded: partial }
  } catch (e) {
    await reportFailure({
      provider: modelFor('head').provider,
      operation: `${opts.operation ?? 'ensemble'}.head`,
      error: e,
      meta: { drafts: drafts.length },
    })
    const best = drafts.reduce((a, b) => (b.text.length > a.text.length ? b : a))
    return { text: best.text, tier: 'head', fastModels, headUsed: false, degraded: true }
  }
}

export interface EnsembleStreamOpts {
  system: string
  prompt: string
  maxTokens?: number
  fastTimeoutMs?: number
  headTimeoutMs?: number
  operation?: string
  onFinish?: Parameters<typeof streamText>[0]['onFinish']
  onError?: Parameters<typeof streamText>[0]['onError']
}

/** 스트리밍 앙상블이 «어떤 상태로» 답했는지. 화면이 검토 강도를 정하는 근거. */
export interface EnsembleQuality {
  degraded: boolean
  fastModels: ProviderId[]
  activeCount: number
  headUsed: boolean
}

/**
 * 스트리밍 앙상블. fast 초안을 먼저 다 받은 뒤 Head 종합만 스트리밍한다.
 * fast 가 전부 실패하면 단일 모델 스트림으로 폴백(degraded).
 * ⚠️ Head 가 스트리밍 도중 실패하는 것은 여기서 알 수 없다(onError 로 흐른다).
 */
export async function ensembleStream(
  opts: EnsembleStreamOpts,
  deps: Pick<EnsembleDeps, 'collect'> = {},
): Promise<{ result: ReturnType<typeof streamText>; quality: EnsembleQuality }> {
  await syncModels()
  const maxTok = opts.maxTokens ?? 1600
  const collect = deps.collect ?? defaultCollect
  const { active, drafts } = await collect({
    system: opts.system,
    prompt: opts.prompt,
    tier: 'head',
    maxTokens: maxTok,
    fastTimeoutMs: opts.fastTimeoutMs,
    operation: opts.operation,
  })
  const headTimeout = opts.headTimeoutMs ?? 85_000

  if (drafts.length === 0) {
    const pick = pickSingle()
    if (!pick) throw new Error('실행할 수 있는 제공자가 없습니다(키 없음)')
    return {
      result: streamText({
        model: languageModel(pick.role),
        system: opts.system,
        prompt: opts.prompt,
        maxOutputTokens: maxTok,
        abortSignal: AbortSignal.timeout(headTimeout),
        onFinish: opts.onFinish,
        onError: opts.onError,
      }),
      quality: { degraded: true, fastModels: [], activeCount: active.length, headUsed: false },
    }
  }

  return {
    result: streamText({
      model: languageModel('head'),
      system: opts.system + HEAD_SYNTHESIS_GUIDE,
      prompt: buildSynthesisPrompt(opts.prompt, drafts),
      maxOutputTokens: headOutputBudget(maxTok),
      abortSignal: AbortSignal.timeout(headTimeout),
      onFinish: opts.onFinish,
      onError: opts.onError,
    }),
    quality: {
      degraded: drafts.length < active.length,
      fastModels: drafts.map((d) => d.provider),
      activeCount: active.length,
      headUsed: true,
    },
  }
}
