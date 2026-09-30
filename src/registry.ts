// =============================================================================
// 모델 등록부 · 모든 제품의 모델 이름은 여기 한 곳에서만 정한다
// =============================================================================
// 2026-09-30 오너 지시: 모든 제품의 AI 호출을 이 라이브러리 하나로 모은다.
// 제품 코드에는 모델 이름을 쓰지 않고 «역할» 만 쓴다. 모델을 바꿀 때는 이 표만 고친다.
//
// 역할
//   fast            짧은 추출 · 분류 · 도움말. 싸고 빠른 것
//   draft           판단이 조금 더 필요한 초안 · 종합
//   head            여러 초안 · 답을 모아 최종본을 만드는 상위 모델
//   worker.claude   3사 병렬(판단 · 생성)의 Claude 몫
//   worker.openai   3사 병렬의 GPT 몫
//   worker.gemini   3사 병렬의 Gemini 몫
//   embed.small     임베딩 1536차원(text-embedding-3-small)
//   embed.large     임베딩(text-embedding-3-large, 차원은 호출 측이 정함)
//
// 🔴 임베딩 역할은 모델을 바꾸면 저장된 벡터와 새 질의 벡터가 서로 안 맞는다.
//    바꿀 때는 저장 벡터를 다시 만드는 일과 한 묶음으로 해야 한다.
//
// 환경변수로 역할 하나를 덮어쓸 수 있다: AIFED_MODEL_<역할>(점은 밑줄, 대문자)
//   예: AIFED_MODEL_HEAD=claude-opus-5-5 · AIFED_MODEL_WORKER_OPENAI=gpt-6-luna
// 예전 이름(CLAUDE_MODEL · OPENAI_MODEL · GEMINI_MODEL · HEAD_MODEL)도 계속 읽는다.

export type Provider = 'anthropic' | 'openai' | 'google'

export const TEXT_ROLES = [
  'fast',
  'draft',
  'head',
  'worker.claude',
  'worker.openai',
  'worker.gemini',
] as const
export type TextRole = (typeof TEXT_ROLES)[number]

export const EMBED_ROLES = ['embed.small', 'embed.large'] as const
export type EmbedRole = (typeof EMBED_ROLES)[number]

export type Role = TextRole | EmbedRole

export interface ModelSpec {
  provider: Provider
  id: string
}

/** 기본값. 모델 교체는 이 표에서 한다(평가 근거는 docs/model-eval-*.md). */
export const DEFAULT_MODELS: Record<Role, ModelSpec> = {
  fast: { provider: 'anthropic', id: 'claude-haiku-4-5-20251001' },
  draft: { provider: 'anthropic', id: 'claude-sonnet-4-5-20250929' },
  head: { provider: 'anthropic', id: 'claude-opus-4-8' },
  'worker.claude': { provider: 'anthropic', id: 'claude-haiku-4-5-20251001' },
  'worker.openai': { provider: 'openai', id: 'gpt-4o-mini' },
  'worker.gemini': { provider: 'google', id: 'gemini-2.5-flash' },
  'embed.small': { provider: 'openai', id: 'text-embedding-3-small' },
  'embed.large': { provider: 'openai', id: 'text-embedding-3-large' },
}

const LEGACY_ENV: Partial<Record<Role, string>> = {
  'worker.claude': 'CLAUDE_MODEL',
  'worker.openai': 'OPENAI_MODEL',
  'worker.gemini': 'GEMINI_MODEL',
  head: 'HEAD_MODEL',
}

export function envNameFor(role: Role): string {
  return `AIFED_MODEL_${role.replace(/\./g, '_').toUpperCase()}`
}

/** 역할의 모델. 환경변수가 있으면 그것, 없으면 기본값. 제공자는 역할이 정한다. */
export function modelFor(role: Role): ModelSpec {
  const base = DEFAULT_MODELS[role]
  const legacy = LEGACY_ENV[role]
  const override = process.env[envNameFor(role)]?.trim() || (legacy ? process.env[legacy]?.trim() : '') || ''
  return override ? { provider: base.provider, id: override } : base
}

export function modelId(role: Role): string {
  return modelFor(role).id
}

/** 지금 쓰는 역할별 모델 전부. 상태판 · 기록용. */
export function currentModels(): Record<Role, ModelSpec> {
  return Object.fromEntries(
    ([...TEXT_ROLES, ...EMBED_ROLES] as Role[]).map((r) => [r, modelFor(r)]),
  ) as Record<Role, ModelSpec>
}
