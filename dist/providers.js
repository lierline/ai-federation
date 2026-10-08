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
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGateway, wrapEmbeddingModel, wrapLanguageModel, } from 'ai';
import { modelFor } from './registry.js';
import { embedUsageMiddleware, setUsageSink, usageMiddleware } from './usage-record.js';
export function reportUsage(model, stage, usage, finishReason) {
    try {
        config.onUsage?.({ model, stage, inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0, finishReason });
    }
    catch {
        // 집계 실패가 본 작업을 깨면 안 된다.
    }
}
export async function reportFailure(event) {
    try {
        await config.reportFailure?.(event);
    }
    catch {
        // 기록 실패가 본 작업을 깨면 안 된다.
    }
}
let config = {};
let cache = {};
/** 앱이 뜰 때 한 번. 다시 부르면 이전 설정을 버리고 새로 만든다. */
export function configure(next) {
    config = next;
    cache = {};
    setUsageSink(next.recordUsage);
}
const DEFAULT_KEYS = {
    anthropic: () => process.env.ANTHROPIC_API_KEY,
    openai: () => process.env.OPENAI_API_KEY,
    // 제품마다 이름이 달랐다(GOOGLE_API_KEY · GEMINI_API_KEY · GOOGLE_GENERATIVE_AI_API_KEY). 셋 다 읽는다.
    google: () => process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    gateway: () => process.env.AI_GATEWAY_API_KEY,
};
export function apiKey(provider) {
    const v = (config.keys?.[provider] ?? DEFAULT_KEYS[provider])();
    return v && v.trim() ? v.trim() : undefined;
}
export function hasKey(provider) {
    return !!apiKey(provider);
}
export function resolveAnthropicBaseURL(raw = process.env.ANTHROPIC_BASE_URL) {
    const v = raw?.trim();
    if (!v)
        return 'https://api.anthropic.com/v1';
    const stripped = v.replace(/\/+$/, '');
    return /\/v\d+$/.test(stripped) ? stripped : `${stripped}/v1`;
}
function anthropicProvider() {
    return (cache.anthropic ??= createAnthropic({
        apiKey: apiKey('anthropic'),
        baseURL: config.anthropicBaseURL ?? resolveAnthropicBaseURL(),
        headers: config.anthropicHeaders,
        fetch: config.fetchFor?.('anthropic'),
    }));
}
function openaiProvider() {
    return (cache.openai ??= createOpenAI({ apiKey: apiKey('openai'), fetch: config.fetchFor?.('openai') }));
}
function googleProvider() {
    return (cache.google ??= createGoogleGenerativeAI({
        apiKey: apiKey('google'),
        fetch: config.fetchFor?.('google'),
    }));
}
function gatewayProvider() {
    return (cache.gateway ??= createGateway({ apiKey: apiKey('gateway'), fetch: config.fetchFor?.('gateway') }));
}
/** 샘플링 값(temperature · topP · topK)을 거절하는 Claude 모델. */
export function rejectsSampling(modelId) {
    return /claude-(opus-4-[7-9]|opus-[5-9]|sonnet-[5-9]|haiku-[5-9]|fable|mythos)/.test(modelId);
}
/** 생각을 끄지 않으면(또는 끌 수 없으면) 기본으로 생각하는 Claude 모델. 출력 상한 안에서 생각 토큰을 쓴다. */
export function thinksByDefault(modelId) {
    return /claude-(opus-[5-9]|sonnet-[5-9]|haiku-[5-9]|fable|mythos)/.test(modelId);
}
/** 구조화 출력을 모델 고유 기능(output_config.format)으로 보내야 하는 Claude 모델. */
export function usesNativeStructuredOutput(modelId) {
    return /claude-(haiku-4-5|haiku-[5-9]|sonnet-4-[5-9]|opus-4-[5-9]|opus-[5-9]|sonnet-[5-9]|fable|mythos)/.test(modelId);
}
function claudeGuard(modelId) {
    return {
        specificationVersion: 'v3',
        transformParams: async ({ params }) => {
            const next = { ...params };
            if (rejectsSampling(modelId)) {
                delete next.temperature;
                delete next.topP;
                delete next.topK;
            }
            if (next.responseFormat?.type === 'json' && usesNativeStructuredOutput(modelId)) {
                const current = (next.providerOptions?.anthropic ?? {});
                if (current.structuredOutputMode === undefined) {
                    next.providerOptions = {
                        ...next.providerOptions,
                        anthropic: { ...current, structuredOutputMode: 'outputFormat' },
                    };
                }
            }
            return next;
        },
    };
}
/** 모델 id 로 바로 만든다. 제품 코드는 languageModel(역할) 을 쓸 것. 평가 · 시험용. role 은 기록에만 쓴다. */
export function languageModelById(provider, id, role) {
    const record = usageMiddleware({ provider, model: id, role: role ?? null });
    if (provider === 'anthropic') {
        return wrapLanguageModel({ model: anthropicProvider()(id), middleware: [claudeGuard(id), record] });
    }
    const base = provider === 'openai' ? openaiProvider()(id) : googleProvider()(id);
    return wrapLanguageModel({ model: base, middleware: record });
}
/** 역할의 모델 객체. AI SDK 의 generateText · generateObject · streamText 에 그대로 넣는다. */
export function languageModel(role) {
    if (config.beforeModelCall)
        return lateBoundModel(role, config.beforeModelCall);
    const m = modelFor(role);
    return languageModelById(m.provider, m.id, role);
}
/** 운영 화면 값을 지금 맞춘다(beforeModelCall). 모델 이름을 미리 적어 두는 3사 병렬 앞에서 부른다. */
export async function syncModels() {
    try {
        await config.beforeModelCall?.();
    }
    catch {
        // 못 읽으면 이전 값으로 계속한다.
    }
}
/**
 * 역할만 쥐고 있다가 호출 순간에 모델을 고르는 객체. 모델 객체를 만든 뒤 호출까지 사이에
 * 운영 화면 값이 바뀌어도(또는 서버가 막 떠서 아직 못 읽었어도) 호출 때의 값을 쓴다.
 */
function lateBoundModel(role, before) {
    const current = () => {
        const m = modelFor(role);
        return languageModelById(m.provider, m.id, role);
    };
    const ready = async () => {
        try {
            await before();
        }
        catch {
            // 설정을 못 읽어도 AI 호출은 이전 값(또는 기본값)으로 계속한다.
        }
        return current();
    };
    return {
        specificationVersion: 'v3',
        get provider() {
            return current().provider;
        },
        get modelId() {
            return modelFor(role).id;
        },
        get supportedUrls() {
            return current().supportedUrls;
        },
        doGenerate: async (options) => (await ready()).doGenerate(options),
        doStream: async (options) => (await ready()).doStream(options),
    };
}
/** 역할의 임베딩 모델. */
export function embeddingModel(role) {
    const m = modelFor(role);
    const record = embedUsageMiddleware({ provider: m.provider, model: m.id, role });
    if (m.provider === 'openai')
        return wrapEmbeddingModel({ model: openaiProvider().embedding(m.id), middleware: record });
    if (m.provider === 'google')
        return wrapEmbeddingModel({ model: googleProvider().textEmbeddingModel(m.id), middleware: record });
    throw new Error(`임베딩을 지원하지 않는 제공자: ${m.provider}`);
}
/** 역할이 쓰는 제공자의 키가 있는가. */
export function roleAvailable(role) {
    return hasKey(modelFor(role).provider);
}
const GATEWAY_PREFIX = { anthropic: 'anthropic', openai: 'openai', google: 'google' };
/** 게이트웨이 모델 id(`제공자/모델`). 이미 `/` 가 있으면 그대로. */
export function gatewayId(provider, id) {
    return id.includes('/') ? id : `${GATEWAY_PREFIX[provider]}/${id}`;
}
/** 역할들을 게이트웨이 id 목록으로. 폴백 사슬을 만들 때 쓴다. */
export function gatewayIds(roles) {
    return roles.map((r) => {
        const m = modelFor(r);
        return gatewayId(m.provider, m.id);
    });
}
export function isGatewayConfigured() {
    return hasKey('gateway');
}
/** 게이트웨이를 거치는 모델 객체. 1차 제공자가 죽었을 때의 폴백 경로. 기록의 모델은 «요청한» id 다(사슬의 다음 모델로 넘어가도). */
export function gatewayModel(id) {
    return wrapLanguageModel({ model: gatewayProvider()(id), middleware: usageMiddleware({ provider: 'gateway', model: id, role: null }) });
}
/** 게이트웨이 사슬 옵션. 프롬프트 학습 금지를 항상 켠다. */
export function gatewayOptions(fallbackIds) {
    return { gateway: { disallowPromptTraining: true, models: fallbackIds } };
}
//# sourceMappingURL=providers.js.map