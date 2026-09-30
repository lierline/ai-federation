// =============================================================================
// 제공자 연결 · 모델 객체는 여기서만 만든다
// =============================================================================
// 제품은 앱이 뜰 때 configure() 를 한 번 불러 자기 사정(관측용 fetch · 키 이름 ·
// Anthropic 주소 보정)을 넘기고, 그 뒤로는 languageModel(역할) 만 쓴다.
// configure() 를 안 불러도 기본값(표준 환경변수 · 기본 fetch)으로 돈다.
//
// 🔑 새 Claude 모델(Opus 4.7 이후 · Sonnet 5 이후 · Fable)은 두 가지를 거절한다.
//    ① temperature · topP · topK  ② 구조화 출력을 «json 도구 강제» 로 보내는 방식
//    지금 쓰는 @ai-sdk/anthropic 3.0.x 는 모르는 모델(claude-opus-5-5 등)이면 ②를 쓰고
//    ①도 그대로 보낸다. 그래서 모든 모델을 아래 미들웨어로 감싸 호출 측 코드와 무관하게
//    막는다. 호출 측이 temperature 를 적어 둔 곳이 10곳 넘게 있어서, 모델을 바꾸는 순간
//    그곳들이 말없이 400 이 되는 것을 여기서 끊는다.

import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic'
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai'
import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from '@ai-sdk/google'
import {
  createGateway,
  wrapLanguageModel,
  type EmbeddingModel,
  type LanguageModel,
  type LanguageModelMiddleware,
} from 'ai'
import { modelFor, type EmbedRole, type Provider, type TextRole } from './registry.js'

export type FetchProvider = Provider | 'gateway'
type FetchFn = typeof globalThis.fetch

export interface FederationConfig {
  /** 제공자별 fetch. 실패 관측 · 기록을 여기에 끼운다. undefined 면 기본 fetch. */
  fetchFor?: (provider: FetchProvider) => FetchFn | undefined
  /** 키를 읽는 곳. 기본은 표준 환경변수. */
  keys?: Partial<Record<FetchProvider, () => string | undefined>>
  /** Anthropic 주소. 기본은 ANTHROPIC_BASE_URL 을 보정한 값(/v1 이 빠진 값을 고친다). */
  anthropicBaseURL?: string
  /** Anthropic 요청에 붙일 머리글. */
  anthropicHeaders?: Record<string, string>
  /**
   * 3사 병렬에서 한 갈래가 죽어 «조용히 줄어든» 순간을 제품의 장애 기록으로 넘긴다.
   * 동작은 그대로 계속한다(나머지로 진행). 기록만 붙인다. await 되므로 서버리스에서도 끊기지 않는다.
   */
  reportFailure?: (event: FailureEvent) => Promise<void> | void
  /** 라이브러리 안에서 부른 호출의 토큰 사용량. 비용 집계 · 평가용. */
  onUsage?: (event: UsageEvent) => void
}

export interface UsageEvent {
  model: string
  stage: 'worker' | 'head' | 'single'
  inputTokens: number
  outputTokens: number
}

export function reportUsage(model: string, stage: UsageEvent['stage'], usage: { inputTokens?: number; outputTokens?: number } | undefined): void {
  try {
    config.onUsage?.({ model, stage, inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 })
  } catch {
    // 집계 실패가 본 작업을 깨면 안 된다.
  }
}

export interface FailureEvent {
  provider: Provider
  operation: string
  error: unknown
  meta?: Record<string, unknown>
}

export async function reportFailure(event: FailureEvent): Promise<void> {
  try {
    await config.reportFailure?.(event)
  } catch {
    // 기록 실패가 본 작업을 깨면 안 된다.
  }
}

let config: FederationConfig = {}
let cache: {
  anthropic?: AnthropicProvider
  openai?: OpenAIProvider
  google?: GoogleGenerativeAIProvider
  gateway?: ReturnType<typeof createGateway>
} = {}

/** 앱이 뜰 때 한 번. 다시 부르면 이전 설정을 버리고 새로 만든다. */
export function configure(next: FederationConfig): void {
  config = next
  cache = {}
}

const DEFAULT_KEYS: Record<FetchProvider, () => string | undefined> = {
  anthropic: () => process.env.ANTHROPIC_API_KEY,
  openai: () => process.env.OPENAI_API_KEY,
  // 제품마다 이름이 달랐다(GOOGLE_API_KEY · GEMINI_API_KEY · GOOGLE_GENERATIVE_AI_API_KEY). 셋 다 읽는다.
  google: () =>
    process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  gateway: () => process.env.AI_GATEWAY_API_KEY,
}

export function apiKey(provider: FetchProvider): string | undefined {
  const v = (config.keys?.[provider] ?? DEFAULT_KEYS[provider])()
  return v && v.trim() ? v.trim() : undefined
}

export function hasKey(provider: FetchProvider): boolean {
  return !!apiKey(provider)
}

export function resolveAnthropicBaseURL(raw = process.env.ANTHROPIC_BASE_URL): string {
  const v = raw?.trim()
  if (!v) return 'https://api.anthropic.com/v1'
  const stripped = v.replace(/\/+$/, '')
  return /\/v\d+$/.test(stripped) ? stripped : `${stripped}/v1`
}

function anthropicProvider(): AnthropicProvider {
  return (cache.anthropic ??= createAnthropic({
    apiKey: apiKey('anthropic'),
    baseURL: config.anthropicBaseURL ?? resolveAnthropicBaseURL(),
    headers: config.anthropicHeaders,
    fetch: config.fetchFor?.('anthropic'),
  }))
}
function openaiProvider(): OpenAIProvider {
  return (cache.openai ??= createOpenAI({ apiKey: apiKey('openai'), fetch: config.fetchFor?.('openai') }))
}
function googleProvider(): GoogleGenerativeAIProvider {
  return (cache.google ??= createGoogleGenerativeAI({
    apiKey: apiKey('google'),
    fetch: config.fetchFor?.('google'),
  }))
}
function gatewayProvider(): ReturnType<typeof createGateway> {
  return (cache.gateway ??= createGateway({ apiKey: apiKey('gateway'), fetch: config.fetchFor?.('gateway') }))
}

/** 샘플링 값(temperature · topP · topK)을 거절하는 Claude 모델. */
export function rejectsSampling(modelId: string): boolean {
  return /claude-(opus-4-[7-9]|opus-[5-9]|sonnet-[5-9]|fable|mythos)/.test(modelId)
}

/** 생각을 끄지 않으면(또는 끌 수 없으면) 기본으로 생각하는 Claude 모델. 출력 상한 안에서 생각 토큰을 쓴다. */
export function thinksByDefault(modelId: string): boolean {
  return /claude-(opus-[5-9]|sonnet-[5-9]|fable|mythos)/.test(modelId)
}

/** 구조화 출력을 모델 고유 기능(output_config.format)으로 보내야 하는 Claude 모델. */
export function usesNativeStructuredOutput(modelId: string): boolean {
  return /claude-(haiku-4-5|sonnet-4-[5-9]|opus-4-[5-9]|opus-[5-9]|sonnet-[5-9]|fable|mythos)/.test(modelId)
}

function claudeGuard(modelId: string): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      const next = { ...params }
      if (rejectsSampling(modelId)) {
        delete next.temperature
        delete next.topP
        delete next.topK
      }
      if (next.responseFormat?.type === 'json' && usesNativeStructuredOutput(modelId)) {
        const current = (next.providerOptions?.anthropic ?? {}) as Record<string, unknown>
        if (current.structuredOutputMode === undefined) {
          next.providerOptions = {
            ...next.providerOptions,
            anthropic: { ...current, structuredOutputMode: 'outputFormat' },
          }
        }
      }
      return next
    },
  }
}

/** 모델 id 로 바로 만든다. 제품 코드는 languageModel(역할) 을 쓸 것. 평가 · 시험용. */
export function languageModelById(provider: Provider, id: string): LanguageModel {
  if (provider === 'anthropic') {
    return wrapLanguageModel({ model: anthropicProvider()(id), middleware: claudeGuard(id) })
  }
  if (provider === 'openai') return openaiProvider()(id)
  return googleProvider()(id)
}

/** 역할의 모델 객체. AI SDK 의 generateText · generateObject · streamText 에 그대로 넣는다. */
export function languageModel(role: TextRole): LanguageModel {
  const m = modelFor(role)
  return languageModelById(m.provider, m.id)
}

/** 역할의 임베딩 모델. */
export function embeddingModel(role: EmbedRole): EmbeddingModel {
  const m = modelFor(role)
  if (m.provider === 'openai') return openaiProvider().embedding(m.id)
  if (m.provider === 'google') return googleProvider().textEmbeddingModel(m.id)
  throw new Error(`임베딩을 지원하지 않는 제공자: ${m.provider}`)
}

/** 역할이 쓰는 제공자의 키가 있는가. */
export function roleAvailable(role: TextRole | EmbedRole): boolean {
  return hasKey(modelFor(role).provider)
}

const GATEWAY_PREFIX: Record<Provider, string> = { anthropic: 'anthropic', openai: 'openai', google: 'google' }

/** 게이트웨이 모델 id(`제공자/모델`). 이미 `/` 가 있으면 그대로. */
export function gatewayId(provider: Provider, id: string): string {
  return id.includes('/') ? id : `${GATEWAY_PREFIX[provider]}/${id}`
}

/** 역할들을 게이트웨이 id 목록으로. 폴백 사슬을 만들 때 쓴다. */
export function gatewayIds(roles: TextRole[]): string[] {
  return roles.map((r) => {
    const m = modelFor(r)
    return gatewayId(m.provider, m.id)
  })
}

export function isGatewayConfigured(): boolean {
  return hasKey('gateway')
}

/** 게이트웨이를 거치는 모델 객체. 1차 제공자가 죽었을 때의 폴백 경로. */
export function gatewayModel(id: string): LanguageModel {
  return gatewayProvider()(id)
}

/** 게이트웨이 사슬 옵션. 프롬프트 학습 금지를 항상 켠다. */
export function gatewayOptions(fallbackIds: string[]): {
  gateway: { disallowPromptTraining: true; models: string[] }
} {
  return { gateway: { disallowPromptTraining: true, models: fallbackIds } }
}
