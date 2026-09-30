type Price = {
    input: number;
    output: number;
};
/** 목록(MODEL_CATALOG)에는 없지만 값을 알아야 하는 모델. 임베딩 · 평가 심사 모델 · 짧은 별칭. */
export declare const EXTRA_PRICE: Record<string, Price>;
export declare function priceOf(model: string): Price | null;
export declare function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null;
export {};
//# sourceMappingURL=cost.d.ts.map