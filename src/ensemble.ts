import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { enabledWorkerSpecs } from './models.js'
import { runWorkers } from './engine.js'
import { synthesize } from './head-synth.js'
import { models, limits } from './config.js'
import type { EnsembleResult, EnsembleTier, WorkerResult } from './types.js'

export interface EnsembleOpts {
  system: string
  prompt: string
  tier: EnsembleTier
  maxTokens?: number
}

export interface EnsembleDeps {
  collect?: (o: EnsembleOpts) => Promise<WorkerResult[]>
  synth?: (system: string, prompt: string, drafts: WorkerResult[], maxTokens: number) => Promise<string>
  single?: (o: EnsembleOpts) => Promise<string>
}

async function defaultCollect(o: EnsembleOpts): Promise<WorkerResult[]> {
  const specs = enabledWorkerSpecs()
  const res = await runWorkers(
    specs.map((s) => ({
      provider: s.provider,
      model: s.model,
      run: async (signal: AbortSignal) => {
        const { text } = await generateText({
          model: s.build(),
          system: o.system,
          prompt: o.prompt,
          maxOutputTokens: o.maxTokens ?? limits.maxTokens(),
          abortSignal: signal,
        })
        return text
      },
    })),
    limits.workerTimeoutMs(),
  )
  return res.filter((r) => r.ok)
}

async function defaultSingle(o: EnsembleOpts): Promise<string> {
  const { text } = await generateText({
    model: anthropic(models.claudeWorker()),
    system: o.system,
    prompt: o.prompt,
    maxOutputTokens: o.maxTokens ?? limits.maxTokens(),
  })
  return text.trim()
}

/**
 * 생성 모드 — 여러 fast AI 초안을 Head 가 하나로 종합한다.
 * tier: head(Opus 종합) / consensus(fast 첫 초안, Head 스킵) / single(단일 fast).
 * graceful: fast 전부 실패→단일 폴백(degraded) / Head 실패→최장 초안 반환(degraded).
 */
export async function ensemble(opts: EnsembleOpts, deps: EnsembleDeps = {}): Promise<EnsembleResult> {
  const collect = deps.collect ?? defaultCollect
  const synth = deps.synth ?? synthesize
  const single = deps.single ?? defaultSingle
  const maxTok = opts.maxTokens ?? limits.maxTokens()

  if (opts.tier === 'single') {
    return { text: await single(opts), tier: 'single', fastModels: ['claude'], headUsed: false, degraded: false }
  }

  const drafts = await collect(opts)
  if (drafts.length === 0) {
    return { text: await single(opts), tier: opts.tier, fastModels: [], headUsed: false, degraded: true }
  }

  const fastModels = drafts.map((d) => d.provider)
  if (opts.tier === 'consensus') {
    return { text: drafts[0].text, tier: 'consensus', fastModels, headUsed: false, degraded: false }
  }

  try {
    const text = await synth(opts.system, opts.prompt, drafts, maxTok)
    return { text, tier: 'head', fastModels, headUsed: true, degraded: false }
  } catch {
    const best = drafts.reduce((a, b) => (b.text.length > a.text.length ? b : a))
    return { text: best.text, tier: 'head', fastModels, headUsed: false, degraded: true }
  }
}
