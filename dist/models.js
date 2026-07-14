import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { models, geminiKey } from './config.js';
// @ai-sdk/google 는 기본 GOOGLE_GENERATIVE_AI_API_KEY 를 읽지만, 본 패키지는 GOOGLE_API_KEY
// (없으면 GEMINI_API_KEY 폴백)로 통일 → 명시적 매핑.
const google = createGoogleGenerativeAI({ apiKey: geminiKey() });
export function workerSpecs() {
    return [
        {
            provider: 'claude',
            model: models.claudeWorker(),
            enabled: () => !!process.env.ANTHROPIC_API_KEY,
            build: () => anthropic(models.claudeWorker()),
        },
        {
            provider: 'openai',
            model: models.openaiWorker(),
            enabled: () => !!process.env.OPENAI_API_KEY,
            build: () => openai(models.openaiWorker()),
        },
        {
            provider: 'gemini',
            model: models.geminiWorker(),
            enabled: () => !!geminiKey(),
            build: () => google(models.geminiWorker()),
        },
    ];
}
export function enabledWorkerSpecs() {
    return workerSpecs().filter((s) => s.enabled());
}
export function headModel() {
    return anthropic(models.head());
}
//# sourceMappingURL=models.js.map