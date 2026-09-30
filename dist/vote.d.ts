import type { z } from 'zod';
import { type WorkerSpec } from './models.js';
import { type ProviderId } from './types.js';
export declare const VOTE_ROLES: readonly ProviderId[];
export interface VoteOpts<T> {
    schema: z.ZodType<T>;
    system: string;
    prompt: string;
    /** 답을 비교 가능한 문자열로 줄인다. 같은 문자열이면 같은 답이다. */
    key: (value: T) => string;
    /** 물을 회사. 기본은 셋 다. */
    roles?: readonly ProviderId[];
    timeoutMs?: number;
    maxOutputTokens?: number;
    /** 기록용 작업 이름. 예: 'engine.vocab-vote' */
    operation?: string;
}
export interface VoteAnswer<T> {
    provider: ProviderId;
    model: string;
    ok: boolean;
    value?: T;
    key?: string;
    error?: string;
    ms: number;
}
export interface VoteResult<T> {
    /** 요청한 역할마다 한 줄. 키 없는 회사도 ok:false 로 들어 있다. */
    answers: VoteAnswer<T>[];
    answered: number;
    /** 모든 역할이 답했고 key 가 전부 같을 때만 값. */
    unanimous: T | null;
    /** 참고용. 같은 key 가 2 이상이고 다른 어느 key 보다 많을 때. */
    majority: {
        value: T;
        count: number;
    } | null;
}
export interface VoteDeps<T> {
    specs?: () => WorkerSpec[];
    ask?: (spec: WorkerSpec, o: VoteOpts<T>) => Promise<T>;
}
export declare function vote<T>(o: VoteOpts<T>, deps?: VoteDeps<T>): Promise<VoteResult<T>>;
//# sourceMappingURL=vote.d.ts.map