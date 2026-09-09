import { generateText } from 'ai';
import { enabledWorkerSpecs } from './models.js';
import { runWorkers } from './engine.js';
import { judge as realJudge } from './head-judge.js';
import { limits } from './config.js';
async function defaultCollect(question) {
    const specs = enabledWorkerSpecs();
    return runWorkers(specs.map((s) => ({
        provider: s.provider,
        model: s.model,
        run: async (signal) => {
            const { text } = await generateText({
                model: s.build(),
                prompt: question,
                maxOutputTokens: limits.maxTokens(),
                abortSignal: signal,
            });
            return text;
        },
    })), limits.workerTimeoutMs());
}
/**
 * 판단 모드 · 같은 질문을 3사에 병렬 전송 → 성공분을 고지능 Head 가 신뢰도 재평가·종합.
 * graceful: 워커 일부 실패해도 진행 / 전부 실패 시 Head 스킵(headError) / Head 실패 시 워커 원답변 보존.
 */
export async function federate(question, _opts = {}, deps = {}) {
    const started = Date.now();
    const collect = deps.collect ?? defaultCollect;
    const judge = deps.judge ?? realJudge;
    const workers = await collect(question);
    let head = null;
    let headError;
    if (workers.some((w) => w.ok)) {
        try {
            head = await judge(question, workers);
        }
        catch (e) {
            headError = e instanceof Error ? e.message : String(e);
        }
    }
    else {
        headError = '모든 워커가 실패해 Head 검토를 건너뜀';
    }
    return { question, workers, head, headError, ms: Date.now() - started };
}
//# sourceMappingURL=federate.js.map