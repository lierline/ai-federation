import { generateText } from 'ai';
import { headModel } from './models.js';
import { limits } from './config.js';
import { modelId } from './registry.js';
import { reportUsage, thinksByDefault } from './providers.js';
/**
 * Head 출력 상한. 호출 측의 maxTokens 는 «본문 길이» 뜻으로 쓰여 왔다(예: 1200).
 * 생각을 끌 수 없는 새 모델은 그 안에서 생각까지 해야 해서 본문이 잘린다.
 * 본문 몫 + 생각 몫(8,000)으로 넓힌다. 상한은 청구액이 아니다.
 */
export function headOutputBudget(bodyTokens, headId = modelId('head')) {
    return thinksByDefault(headId) ? bodyTokens + 8_000 : bodyTokens;
}
export const HEAD_SYNTHESIS_GUIDE = `

# 종합 지침 (Head)
당신은 위 역할에 더해, 동일 작업에 대한 여러 AI 초안을 고차원적으로 종합하는 최종 Head 전문가다.
- 각 초안의 강점을 취하고 오류·누락·중복을 보정해 하나의 최종 결과물을 만든다.
- 위 작업 규칙을 그대로 지킨다. 초안에 없는 사실을 새로 지어내지 않는다.
- 라벨·머리말 없이 본문만 출력한다.`;
export function buildSynthesisPrompt(userPrompt, drafts) {
    const blocks = drafts.map((d, i) => `--- 초안 ${String.fromCharCode(65 + i)} ---\n${d.text}`).join('\n\n');
    return `[작업]\n${userPrompt}\n\n[${drafts.length}개 AI 초안]\n${blocks}\n\n위 초안들을 종합해 하나의 최종 결과물을 작성하라.`;
}
/** 생성 Head · 여러 초안을 작업 규칙을 지키며 하나로 종합한다. */
export async function synthesize(system, prompt, drafts, maxTokens, timeoutMs = limits.headTimeoutMs()) {
    const { text, usage, finishReason } = await generateText({
        model: headModel(),
        system: system + HEAD_SYNTHESIS_GUIDE,
        prompt: buildSynthesisPrompt(prompt, drafts),
        maxOutputTokens: headOutputBudget(maxTokens),
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(timeoutMs),
    });
    reportUsage(modelId('head'), 'head', usage, finishReason);
    return text.trim();
}
//# sourceMappingURL=head-synth.js.map