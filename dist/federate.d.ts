import type { FederationResult, HeadReview, WorkerResult } from './types.js';
export interface FederateDeps {
    collect?: (question: string) => Promise<WorkerResult[]>;
    judge?: (question: string, workers: WorkerResult[]) => Promise<HeadReview>;
}
/**
 * 판단 모드 — 같은 질문을 3사에 병렬 전송 → 성공분을 고지능 Head 가 신뢰도 재평가·종합.
 * graceful: 워커 일부 실패해도 진행 / 전부 실패 시 Head 스킵(headError) / Head 실패 시 워커 원답변 보존.
 */
export declare function federate(question: string, _opts?: Record<string, never>, deps?: FederateDeps): Promise<FederationResult>;
//# sourceMappingURL=federate.d.ts.map