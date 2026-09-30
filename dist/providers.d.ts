import { type EmbeddingModel, type LanguageModel } from 'ai';
import { type EmbedRole, type Provider, type TextRole } from './registry.js';
export type FetchProvider = Provider | 'gateway';
type FetchFn = typeof globalThis.fetch;
export interface FederationConfig {
    /** 제공자별 fetch. 실패 관측 · 기록을 여기에 끼운다. undefined 면 기본 fetch. */
    fetchFor?: (provider: FetchProvider) => FetchFn | undefined;
    /** 키를 읽는 곳. 기본은 표준 환경변수. */
    keys?: Partial<Record<FetchProvider, () => string | undefined>>;
    /** Anthropic 주소. 기본은 ANTHROPIC_BASE_URL 을 보정한 값(/v1 이 빠진 값을 고친다). */
    anthropicBaseURL?: string;
    /** Anthropic 요청에 붙일 머리글. */
    anthropicHeaders?: Record<string, string>;
    /**
     * 3사 병렬에서 한 갈래가 죽어 «조용히 줄어든» 순간을 제품의 장애 기록으로 넘긴다.
     * 동작은 그대로 계속한다(나머지로 진행). 기록만 붙인다. await 되므로 서버리스에서도 끊기지 않는다.
     */
    reportFailure?: (event: FailureEvent) => Promise<void> | void;
    /** 라이브러리 안에서 부른 호출의 토큰 사용량. 비용 집계 · 평가용. */
    onUsage?: (event: UsageEvent) => void;
    /**
     * 모델을 부르기 «직전» 에 한 번 기다린다. 제품이 운영 화면에서 고른 모델(DB)을 여기서
     * 최신으로 맞추면(setModelOverrides), 그 호출부터 새 모델이 쓰인다. 넘기면 languageModel(역할)은
     * 역할만 쥔 채로 돌려주고, 실제 모델은 호출 때 고른다. 이 함수가 던지면 이전 값으로 계속한다.
     */
    beforeModelCall?: () => Promise<void>;
}
export interface UsageEvent {
    model: string;
    stage: 'worker' | 'head' | 'single';
    inputTokens: number;
    outputTokens: number;
    /** 모델이 멈춘 까닭. 'length' 면 출력 한도에서 잘린 것이다(평가 · 운영 한도 점검용). */
    finishReason?: string;
}
export declare function reportUsage(model: string, stage: UsageEvent['stage'], usage: {
    inputTokens?: number;
    outputTokens?: number;
} | undefined, finishReason?: string): void;
export interface FailureEvent {
    provider: Provider;
    operation: string;
    error: unknown;
    meta?: Record<string, unknown>;
}
export declare function reportFailure(event: FailureEvent): Promise<void>;
/** 앱이 뜰 때 한 번. 다시 부르면 이전 설정을 버리고 새로 만든다. */
export declare function configure(next: FederationConfig): void;
export declare function apiKey(provider: FetchProvider): string | undefined;
export declare function hasKey(provider: FetchProvider): boolean;
export declare function resolveAnthropicBaseURL(raw?: string | undefined): string;
/** 샘플링 값(temperature · topP · topK)을 거절하는 Claude 모델. */
export declare function rejectsSampling(modelId: string): boolean;
/** 생각을 끄지 않으면(또는 끌 수 없으면) 기본으로 생각하는 Claude 모델. 출력 상한 안에서 생각 토큰을 쓴다. */
export declare function thinksByDefault(modelId: string): boolean;
/** 구조화 출력을 모델 고유 기능(output_config.format)으로 보내야 하는 Claude 모델. */
export declare function usesNativeStructuredOutput(modelId: string): boolean;
/** 모델 id 로 바로 만든다. 제품 코드는 languageModel(역할) 을 쓸 것. 평가 · 시험용. */
export declare function languageModelById(provider: Provider, id: string): LanguageModel;
/** 역할의 모델 객체. AI SDK 의 generateText · generateObject · streamText 에 그대로 넣는다. */
export declare function languageModel(role: TextRole): LanguageModel;
/** 운영 화면 값을 지금 맞춘다(beforeModelCall). 모델 이름을 미리 적어 두는 3사 병렬 앞에서 부른다. */
export declare function syncModels(): Promise<void>;
/** 역할의 임베딩 모델. */
export declare function embeddingModel(role: EmbedRole): EmbeddingModel;
/** 역할이 쓰는 제공자의 키가 있는가. */
export declare function roleAvailable(role: TextRole | EmbedRole): boolean;
/** 게이트웨이 모델 id(`제공자/모델`). 이미 `/` 가 있으면 그대로. */
export declare function gatewayId(provider: Provider, id: string): string;
/** 역할들을 게이트웨이 id 목록으로. 폴백 사슬을 만들 때 쓴다. */
export declare function gatewayIds(roles: TextRole[]): string[];
export declare function isGatewayConfigured(): boolean;
/** 게이트웨이를 거치는 모델 객체. 1차 제공자가 죽었을 때의 폴백 경로. */
export declare function gatewayModel(id: string): LanguageModel;
/** 게이트웨이 사슬 옵션. 프롬프트 학습 금지를 항상 켠다. */
export declare function gatewayOptions(fallbackIds: string[]): {
    gateway: {
        disallowPromptTraining: true;
        models: string[];
    };
};
export {};
//# sourceMappingURL=providers.d.ts.map