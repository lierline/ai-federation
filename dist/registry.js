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
// 운영 화면에서 고른 값(setModelOverrides)이 가장 먼저 이긴다. 다음이 환경변수:
// AIFED_MODEL_<역할>(점은 밑줄, 대문자)
//   예: AIFED_MODEL_HEAD=claude-opus-4-8(되돌리기) · AIFED_MODEL_WORKER_OPENAI=gpt-6-luna
// 예전 이름(CLAUDE_MODEL · OPENAI_MODEL · GEMINI_MODEL · HEAD_MODEL)도 계속 읽는다.
export const TEXT_ROLES = [
    'fast',
    'draft',
    'head',
    'worker.claude',
    'worker.openai',
    'worker.gemini',
];
export const EMBED_ROLES = ['embed.small', 'embed.large'];
/** 기본값. 모델 교체는 이 표에서 한다(평가 근거는 docs/model-eval-*.md). */
export const DEFAULT_MODELS = {
    fast: { provider: 'anthropic', id: 'claude-haiku-4-5-20251001' },
    draft: { provider: 'anthropic', id: 'claude-sonnet-4-5-20250929' },
    // 2026-09-30 오너 결정: 관리자(head)는 Opus 5.5. 평가(docs/model-eval-2026-09-30.md)에서 맞힘은 4.8 과
    // 1건 차이, 건당 비용 약 1.7배. 새 Opus 가 나오면 올리고 비용 변화를 재서 보고한다(오너 지시).
    head: { provider: 'anthropic', id: 'claude-opus-5-5' },
    'worker.claude': { provider: 'anthropic', id: 'claude-haiku-4-5-20251001' },
    'worker.openai': { provider: 'openai', id: 'gpt-4o-mini' },
    'worker.gemini': { provider: 'google', id: 'gemini-2.5-flash' },
    'embed.small': { provider: 'openai', id: 'text-embedding-3-small' },
    'embed.large': { provider: 'openai', id: 'text-embedding-3-large' },
};
const LEGACY_ENV = {
    'worker.claude': 'CLAUDE_MODEL',
    'worker.openai': 'OPENAI_MODEL',
    'worker.gemini': 'GEMINI_MODEL',
    head: 'HEAD_MODEL',
};
export function envNameFor(role) {
    return `AIFED_MODEL_${role.replace(/\./g, '_').toUpperCase()}`;
}
export const MODEL_CATALOG = [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'anthropic', price: { input: 1, output: 5 } },
    // 프롬프트 10만 토큰 이하 단가. 넘으면 입력 $0.5 · 출력 $2.5 로 5배(공식 가격표 2026-10-08).
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', provider: 'anthropic', price: { input: 0.1, output: 0.5 }, thinks: true },
    { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', provider: 'anthropic', price: { input: 3, output: 15 } },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', provider: 'anthropic', price: { input: 2, output: 10 }, thinks: true },
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', provider: 'anthropic', price: { input: 5, output: 25 } },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'anthropic', price: { input: 4, output: 20 }, thinks: true },
    { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', provider: 'anthropic', price: { input: 10, output: 50 }, thinks: true },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai', price: { input: 0.15, output: 0.6 } },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna', provider: 'openai', price: { input: 0.1, output: 0.5 } },
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', provider: 'openai', price: { input: 2, output: 10 } },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google', price: { input: 0.3, output: 2.5 } },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', provider: 'google', price: { input: 1.5, output: 7.5 } },
];
/** 역할이 고를 수 있는 모델(역할의 제공자와 같은 것만). 임베딩 역할은 빈 목록. */
export function catalogFor(role) {
    if (!TEXT_ROLES.includes(role))
        return [];
    return MODEL_CATALOG.filter((m) => m.provider === DEFAULT_MODELS[role].provider);
}
export function catalogEntry(id) {
    return MODEL_CATALOG.find((m) => m.id === id);
}
// ── 운영 화면에서 고른 값 ────────────────────────────────────────────────────
// 제품이 DB 에서 읽어 넣는다(setModelOverrides). 목록에 없는 값 · 제공자가 다른 값은 무시한다.
// 우선순위: 운영 화면 > 환경변수 > 기본값.
let overrides = {};
export function setModelOverrides(next) {
    const clean = {};
    for (const role of TEXT_ROLES) {
        const id = next[role]?.trim();
        if (id && catalogFor(role).some((m) => m.id === id))
            clean[role] = id;
    }
    overrides = clean;
}
export function modelOverrides() {
    return { ...overrides };
}
function envOverride(role) {
    const legacy = LEGACY_ENV[role];
    return process.env[envNameFor(role)]?.trim() || (legacy ? process.env[legacy]?.trim() : '') || '';
}
/** 역할의 모델이 어디서 왔는가. 운영 화면이 «지금 무엇이 이기고 있는지» 를 보여 줄 때 쓴다. */
export function modelSource(role) {
    if (overrides[role])
        return 'screen';
    return envOverride(role) ? 'env' : 'default';
}
/** 역할의 모델. 운영 화면 값 > 환경변수 > 기본값. 제공자는 역할이 정한다. */
export function modelFor(role) {
    const base = DEFAULT_MODELS[role];
    const override = overrides[role] || envOverride(role);
    return override ? { provider: base.provider, id: override } : base;
}
export function modelId(role) {
    return modelFor(role).id;
}
/** 지금 쓰는 역할별 모델 전부. 상태판 · 기록용. */
export function currentModels() {
    return Object.fromEntries([...TEXT_ROLES, ...EMBED_ROLES].map((r) => [r, modelFor(r)]));
}
//# sourceMappingURL=registry.js.map