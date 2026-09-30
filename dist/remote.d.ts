import type { FailureEvent, FetchProvider } from './providers.js';
import type { UsageRecord } from './usage-record.js';
export type RemoteProduct = 'login' | 'q-maison' | 'eval';
export interface RemoteOptions {
    url: string;
    secret: string;
    product: RemoteProduct;
    fetch?: typeof fetch;
}
export interface EvalRun {
    kind: 'eval' | 'watch';
    title: string;
    conclusion: string;
    costUsd: number | null;
    docUrl: string | null;
}
export declare function createIngestSender(o: RemoteOptions): {
    recordUsage: (r: UsageRecord) => Promise<void>;
    reportFailure: (e: FailureEvent) => Promise<void>;
    postEvalRun: (run: EvalRun) => Promise<void>;
    /**
     * 제공자 호출을 지켜보는 fetch. 4xx · 5xx 나 네트워크 실패를 장애로 보낸다(잔액 소진이 여기서 잡힌다).
     * 응답은 손대지 않고 그대로 돌려준다. 보내기 실패는 삼킨다.
     */
    observedFetch(provider: FetchProvider, inner?: typeof fetch): typeof fetch;
};
/** 60초마다 자기 제품의 모델 설정을 받아 넣는다. 못 받으면 마지막 값(없으면 환경변수 · 기본값)으로 계속한다. */
export declare function createRemoteSettingsSync(o: RemoteOptions): () => Promise<void>;
//# sourceMappingURL=remote.d.ts.map