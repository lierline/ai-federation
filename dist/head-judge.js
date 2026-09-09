import { z } from 'zod';
import { generateText, Output } from 'ai';
import { headModel } from './models.js';
import { limits, withTimeout } from './config.js';
const PROVIDER_LABEL = { claude: 'Claude', openai: 'GPT', gemini: 'Gemini' };
export const reviewSchema = z.object({
    rankings: z.array(z.object({
        provider: z.enum(['claude', 'openai', 'gemini']),
        reliability: z.number(),
        rationale: z.string(),
    })),
    consensus: z.string(),
    conflicts: z.string(),
    finalAnswer: z.string(),
    confidence: z.number(),
});
export function clamp01(n) {
    const v = typeof n === 'number' ? n : Number(n);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
export function buildJudgePrompt(question, workers) {
    const blocks = workers
        .map((w) => {
        const label = PROVIDER_LABEL[w.provider];
        return w.ok
            ? `### ${label} (id=${w.provider})\n${w.text}`
            : `### ${label} (id=${w.provider})\n[응답 실패: ${w.error ?? '알 수 없음'}]`;
    })
        .join('\n\n');
    return `당신은 여러 AI의 답변을 심사하는 고지능 검토자(Head)입니다.
아래 질문에 세 AI(Claude·GPT·Gemini)가 각각 답했습니다. 각 답변의 사실 정확성·근거·일관성을 비판적으로 평가하고,
신뢰도를 종합해 최종 답변을 만드세요. 확신이 없으면 낮은 confidence 로 정직하게 표기하세요.
rankings 에는 claude·openai·gemini 세 provider 를 모두 포함하세요(실패한 워커는 reliability 0).

[질문]
${question}

[세 AI의 답변]
${blocks}`;
}
export function toHeadReview(raw) {
    return {
        rankings: raw.rankings.map((r) => ({
            provider: r.provider,
            reliability: clamp01(r.reliability),
            rationale: r.rationale,
        })),
        consensus: raw.consensus,
        conflicts: raw.conflicts,
        finalAnswer: raw.finalAnswer,
        confidence: clamp01(raw.confidence),
    };
}
async function defaultCallHead(prompt) {
    const { output } = await withTimeout(generateText({
        model: headModel(),
        output: Output.object({ schema: reviewSchema }),
        prompt,
        maxOutputTokens: Math.max(limits.maxTokens(), 2048),
    }), limits.headTimeoutMs(), 'head');
    return output;
}
/** 판단 Head · 세 답변의 신뢰도를 재평가하고 종합 최종 답변을 낸다(구조화 출력으로 파싱 실패 없음). */
export async function judge(question, workers, deps = {}) {
    const call = deps.callHead ?? defaultCallHead;
    const raw = await call(buildJudgePrompt(question, workers));
    return toHeadReview(raw);
}
//# sourceMappingURL=head-judge.js.map