export declare const models: {
    claudeWorker: () => string;
    openaiWorker: () => string;
    geminiWorker: () => string;
    head: () => string;
};
export declare const limits: {
    maxTokens: () => number;
    workerTimeoutMs: () => number;
    headTimeoutMs: () => number;
};
/** Gemini 키 — GOOGLE_API_KEY 우선, 없으면 GEMINI_API_KEY 폴백(플랫폼별 명칭 차이 흡수). */
export declare function geminiKey(): string | undefined;
/** 누락된 키를 사람이 읽을 수 있게 반환(실행 전 점검). */
export declare function missingKeys(): string[];
/** 워커 호출에 타임아웃을 씌운다(한 제공자가 늘어져도 전체가 멈추지 않게). */
export declare function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T>;
//# sourceMappingURL=config.d.ts.map