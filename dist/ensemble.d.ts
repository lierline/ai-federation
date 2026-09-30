import { streamText } from 'ai';
import { type TextRole } from './registry.js';
import type { EnsembleResult, EnsembleTier, ProviderId, WorkerResult } from './types.js';
export interface EnsembleOpts {
    system: string;
    prompt: string;
    tier: EnsembleTier;
    maxTokens?: number;
    fastTimeoutMs?: number;
    headTimeoutMs?: number;
    /** 기록용 작업 이름. 예: 'capa.assist-draft' */
    operation?: string;
}
export interface EnsembleDeps {
    collect?: (o: EnsembleOpts) => Promise<{
        active: ProviderId[];
        drafts: WorkerResult[];
    }>;
    synth?: (system: string, prompt: string, drafts: WorkerResult[], maxTokens: number, timeoutMs?: number) => Promise<string>;
    single?: (o: EnsembleOpts) => Promise<{
        text: string;
        provider: ProviderId;
    }>;
}
/**
 * 단일 폴백에 쓸 역할. 키가 있는 첫 제공자(fast → GPT → Gemini 순).
 * 2026-08-11 감사 1번: 예전에는 Anthropic 으로 고정이라 Claude 키가 없으면 폴백까지 죽었다.
 */
export declare function pickSingle(): {
    role: TextRole;
    provider: ProviderId;
} | null;
/** 관리자 종합 앞의 초안 한도. 최종본 한도 × limits.draftHeadroom(기본 1). */
export declare function draftBudget(bodyTokens: number): number;
/** 초안에 붙이는 분량 안내. 글자 수를 토큰 한도와 같은 수로 잡는다(맞는지는 운영 한도 점검의 잘림 수로 본다). */
export declare function draftLengthHint(bodyTokens: number): string;
/** 비스트리밍 앙상블. JSON 응답 계열(assist-draft 등). */
export declare function ensemble(opts: EnsembleOpts, deps?: EnsembleDeps): Promise<EnsembleResult>;
export interface EnsembleStreamOpts {
    system: string;
    prompt: string;
    maxTokens?: number;
    fastTimeoutMs?: number;
    headTimeoutMs?: number;
    operation?: string;
    onFinish?: Parameters<typeof streamText>[0]['onFinish'];
    onError?: Parameters<typeof streamText>[0]['onError'];
}
/** 스트리밍 앙상블이 «어떤 상태로» 답했는지. 화면이 검토 강도를 정하는 근거. */
export interface EnsembleQuality {
    degraded: boolean;
    fastModels: ProviderId[];
    activeCount: number;
    headUsed: boolean;
}
/**
 * 스트리밍 앙상블. fast 초안을 먼저 다 받은 뒤 Head 종합만 스트리밍한다.
 * fast 가 전부 실패하면 단일 모델 스트림으로 폴백(degraded).
 * ⚠️ Head 가 스트리밍 도중 실패하는 것은 여기서 알 수 없다(onError 로 흐른다).
 */
export declare function ensembleStream(opts: EnsembleStreamOpts, deps?: Pick<EnsembleDeps, 'collect'>): Promise<{
    result: ReturnType<typeof streamText>;
    quality: EnsembleQuality;
}>;
//# sourceMappingURL=ensemble.d.ts.map