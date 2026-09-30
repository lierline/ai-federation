// =============================================================================
// 사용 기록: 모델을 부를 때마다 한 건(토큰 · 추정 비용 · 종료 사유 · 걸린 시간)
// =============================================================================
// 라이브러리는 기록을 «어디로 보낼지» 모른다. 제품이 configure({ recordUsage }) 로 넘긴 함수를 부른다.
// 🔴 서버리스는 응답 뒤 인스턴스를 얼린다. 그래서 기록은 호출 흐름 안에서 기다린다(await).
//    대신 2초 상한을 둔다. 기록 함수가 던지거나 멈춰도 AI 결과는 그대로 돌려준다.
// 스트림은 끝 조각(finish)을 본 경우에만 기록한다. 중간에 취소되면 기록하지 않는다
// (끝 조각이 없어 토큰 수를 모른다. 두 번 남기는 것보다 빠뜨리는 쪽을 택했다).
import { AsyncLocalStorage } from 'node:async_hooks';
import { estimateCostUsd } from './cost.js';
const LIMIT_MS = 2000;
let sink;
/** configure() 가 부른다. undefined 면 기록하지 않는다. */
export function setUsageSink(fn) {
    sink = fn;
}
const operationStore = new AsyncLocalStorage();
/** 이 안에서 부른 모델 호출에 작업 이름을 붙인다(예: 'capa.assist' · 'health.probe'). */
export function withAiOperation(name, fn) {
    return operationStore.run(name, fn);
}
function currentOperation() {
    return operationStore.getStore() ?? null;
}
async function emit(r) {
    const fn = sink;
    if (!fn)
        return;
    let timer;
    try {
        await Promise.race([
            Promise.resolve().then(() => fn(r)),
            new Promise((resolve) => {
                timer = setTimeout(resolve, LIMIT_MS);
            }),
        ]);
    }
    catch (e) {
        console.warn('[ai-federation] 사용 기록을 남기지 못했습니다:', e instanceof Error ? e.message : e);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
function tokens(v) {
    if (typeof v === 'number')
        return v;
    return v?.total ?? 0;
}
function reasonText(v) {
    if (typeof v === 'string')
        return v;
    if (v && typeof v === 'object' && 'unified' in v)
        return String(v.unified);
    return null;
}
function textRecord(tag, usage, finishReason, latencyMs, operation) {
    const inputTokens = tokens(usage?.inputTokens);
    const outputTokens = tokens(usage?.outputTokens);
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
    };
}
export function usageMiddleware(tag) {
    return {
        specificationVersion: 'v3',
        wrapGenerate: async ({ doGenerate }) => {
            const t0 = Date.now();
            const result = await doGenerate();
            await emit(textRecord(tag, result.usage, result.finishReason, Date.now() - t0, currentOperation()));
            return result;
        },
        wrapStream: async ({ doStream }) => {
            const t0 = Date.now();
            // flush 는 다른 비동기 문맥에서 돌 수 있어 작업 이름을 여기서 잡아 둔다.
            const operation = currentOperation();
            const { stream, ...rest } = await doStream();
            let finish;
            const watched = stream.pipeThrough(new TransformStream({
                transform(chunk, controller) {
                    if (chunk.type === 'finish')
                        finish = chunk;
                    controller.enqueue(chunk);
                },
                async flush() {
                    if (finish)
                        await emit(textRecord(tag, finish.usage, finish.finishReason, Date.now() - t0, operation));
                },
            }));
            return { ...rest, stream: watched };
        },
    };
}
export function embedUsageMiddleware(tag) {
    return {
        specificationVersion: 'v3',
        wrapEmbed: async ({ doEmbed }) => {
            const t0 = Date.now();
            const result = await doEmbed();
            const inputTokens = result.usage?.tokens ?? 0;
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
            });
            return result;
        },
    };
}
//# sourceMappingURL=usage-record.js.map