import type { EnsembleResult, EnsembleTier, WorkerResult } from './types.js';
export interface EnsembleOpts {
    system: string;
    prompt: string;
    tier: EnsembleTier;
    maxTokens?: number;
}
export interface EnsembleDeps {
    collect?: (o: EnsembleOpts) => Promise<WorkerResult[]>;
    synth?: (system: string, prompt: string, drafts: WorkerResult[], maxTokens: number) => Promise<string>;
    single?: (o: EnsembleOpts) => Promise<string>;
}
/**
 * 생성 모드 · 여러 fast AI 초안을 Head 가 하나로 종합한다.
 * tier: head(Opus 종합) / consensus(fast 첫 초안, Head 스킵) / single(단일 fast).
 * graceful: fast 전부 실패→단일 폴백(degraded) / Head 실패→최장 초안 반환(degraded).
 */
export declare function ensemble(opts: EnsembleOpts, deps?: EnsembleDeps): Promise<EnsembleResult>;
//# sourceMappingURL=ensemble.d.ts.map