// =============================================================================
// 사용 기록: 모델을 부를 때마다 한 건(토큰 · 추정 비용 · 종료 사유 · 걸린 시간)
// =============================================================================
// 라이브러리는 기록을 «어디로 보낼지» 모른다. 제품이 configure({ recordUsage }) 로 넘긴 함수를 부른다.
// 🔴 서버리스는 응답 뒤 인스턴스를 얼린다. 그래서 기록은 호출 흐름 안에서 기다린다(await).
//    대신 2초 상한을 둔다. 기록 함수가 던지거나 멈춰도 AI 결과는 그대로 돌려준다.
// 스트림은 끝 조각(finish)을 본 경우에만 기록한다. 중간에 취소되면 기록하지 않는다
// (끝 조각이 없어 토큰 수를 모른다. 두 번 남기는 것보다 빠뜨리는 쪽을 택했다).

import { AsyncLocalStorage } from 'node:async_hooks'
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from 'ai'
import { estimateCostUsd } from './cost.js'

export interface UsageRecord {
  role: string | null
  provider: 'anthropic' | 'openai' | 'google' | 'gateway'
  model: string
  kind: 'text' | 'embed'
  inputTokens: number
  outputTokens: number
  costUsd: number | null
  finishReason: string | null
  latencyMs: number
  operation: string | null
}

export type RecordUsage = (r: UsageRecord) => Promise<void> | void

export interface UsageTag {
  provider: UsageRecord['provider']
  model: string
  role: string | null
}

const LIMIT_MS = 2000
let sink: RecordUsage | undefined

/** configure() 가 부른다. undefined 면 기록하지 않는다. */
export function setUsageSink(fn: RecordUsage | undefined): void {
  sink = fn
}

const operationStore = new AsyncLocalStorage<string>()

/** 이 안에서 부른 모델 호출에 작업 이름을 붙인다(예: 'capa.assist' · 'health.probe'). */
export function withAiOperation<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return operationStore.run(name, fn)
}

function currentOperation(): string | null {
  return operationStore.getStore() ?? null
}

async function emit(r: UsageRecord): Promise<void> {
  const fn = sink
  if (!fn) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.resolve().then(() => fn(r)),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, LIMIT_MS)
      }),
    ])
  } catch (e) {
    console.warn('[ai-federation] 사용 기록을 남기지 못했습니다:', e instanceof Error ? e.message : e)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

type TokenCount = number | { total?: number } | undefined

function tokens(v: TokenCount): number {
  if (typeof v === 'number') return v
  return v?.total ?? 0
}

function reasonText(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'unified' in v) return String((v as { unified: unknown }).unified)
  return null
}

function textRecord(
  tag: UsageTag,
  usage: { inputTokens?: TokenCount; outputTokens?: TokenCount } | undefined,
  finishReason: unknown,
  latencyMs: number,
  operation: string | null,
): UsageRecord {
  const inputTokens = tokens(usage?.inputTokens)
  const outputTokens = tokens(usage?.outputTokens)
  return {
    role: tag.role,
    provider: tag.provider,
    model: tag.model,
    kind: 'text',
    inputTokens,
    outputTokens,
    costUsd: estimateCostUsd(tag.model, inputTokens, outputTokens),
    finishReason: reasonText(finishReason),
    latencyMs,
    operation,
  }
}

export function usageMiddleware(tag: UsageTag): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate }) => {
      const t0 = Date.now()
      const result = await doGenerate()
      await emit(textRecord(tag, result.usage, result.finishReason, Date.now() - t0, currentOperation()))
      return result
    },
    wrapStream: async ({ doStream }) => {
      const t0 = Date.now()
      // flush 는 다른 비동기 문맥에서 돌 수 있어 작업 이름을 여기서 잡아 둔다.
      const operation = currentOperation()
      const { stream, ...rest } = await doStream()
      let finish: { usage?: { inputTokens?: TokenCount; outputTokens?: TokenCount }; finishReason?: unknown } | undefined
      const watched = stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            if (chunk.type === 'finish') finish = chunk
            controller.enqueue(chunk)
          },
          async flush() {
            if (finish) await emit(textRecord(tag, finish.usage, finish.finishReason, Date.now() - t0, operation))
          },
        }),
      )
      return { ...rest, stream: watched }
    },
  }
}

export function embedUsageMiddleware(tag: UsageTag): EmbeddingModelMiddleware {
  return {
    specificationVersion: 'v3',
    wrapEmbed: async ({ doEmbed }) => {
      const t0 = Date.now()
      const result = await doEmbed()
      const inputTokens = result.usage?.tokens ?? 0
      await emit({
        role: tag.role,
        provider: tag.provider,
        model: tag.model,
        kind: 'embed',
        inputTokens,
        outputTokens: 0,
        costUsd: estimateCostUsd(tag.model, inputTokens, 0),
        finishReason: null,
        latencyMs: Date.now() - t0,
        operation: currentOperation(),
      })
      return result
    },
  }
}
