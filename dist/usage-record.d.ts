import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from 'ai';
export interface UsageRecord {
    role: string | null;
    provider: 'anthropic' | 'openai' | 'google' | 'gateway';
    model: string;
    kind: 'text' | 'embed';
    inputTokens: number;
    outputTokens: number;
    costUsd: number | null;
    finishReason: string | null;
    latencyMs: number;
    operation: string | null;
}
export type RecordUsage = (r: UsageRecord) => Promise<void> | void;
export interface UsageTag {
    provider: UsageRecord['provider'];
    model: string;
    role: string | null;
}
/** configure() 가 부른다. undefined 면 기록하지 않는다. */
export declare function setUsageSink(fn: RecordUsage | undefined): void;
/** 이 안에서 부른 모델 호출에 작업 이름을 붙인다(예: 'capa.assist' · 'health.probe'). */
export declare function withAiOperation<T>(name: string, fn: () => Promise<T>): Promise<T>;
export declare function usageMiddleware(tag: UsageTag): LanguageModelMiddleware;
export declare function embedUsageMiddleware(tag: UsageTag): EmbeddingModelMiddleware;
//# sourceMappingURL=usage-record.d.ts.map