export type Provider = 'anthropic' | 'openai' | 'google';
export declare const TEXT_ROLES: readonly ["fast", "draft", "head", "worker.claude", "worker.openai", "worker.gemini"];
export type TextRole = (typeof TEXT_ROLES)[number];
export declare const EMBED_ROLES: readonly ["embed.small", "embed.large"];
export type EmbedRole = (typeof EMBED_ROLES)[number];
export type Role = TextRole | EmbedRole;
export interface ModelSpec {
    provider: Provider;
    id: string;
}
/** 기본값. 모델 교체는 이 표에서 한다(평가 근거는 docs/model-eval-*.md). */
export declare const DEFAULT_MODELS: Record<Role, ModelSpec>;
export declare function envNameFor(role: Role): string;
export interface CatalogEntry {
    id: string;
    label: string;
    provider: Provider;
    price: {
        input: number;
        output: number;
    };
    /** 기본으로 생각하는 모델이면 같은 일에 출력 토큰을 더 쓴다(단가만 보고 고르면 안 됨). */
    thinks?: boolean;
}
export declare const MODEL_CATALOG: readonly CatalogEntry[];
/** 역할이 고를 수 있는 모델(역할의 제공자와 같은 것만). 임베딩 역할은 빈 목록. */
export declare function catalogFor(role: Role): CatalogEntry[];
export declare function catalogEntry(id: string): CatalogEntry | undefined;
export declare function setModelOverrides(next: Partial<Record<TextRole, string>>): void;
export declare function modelOverrides(): Partial<Record<TextRole, string>>;
/** 역할의 모델이 어디서 왔는가. 운영 화면이 «지금 무엇이 이기고 있는지» 를 보여 줄 때 쓴다. */
export declare function modelSource(role: Role): 'screen' | 'env' | 'default';
/** 역할의 모델. 운영 화면 값 > 환경변수 > 기본값. 제공자는 역할이 정한다. */
export declare function modelFor(role: Role): ModelSpec;
export declare function modelId(role: Role): string;
/** 지금 쓰는 역할별 모델 전부. 상태판 · 기록용. */
export declare function currentModels(): Record<Role, ModelSpec>;
//# sourceMappingURL=registry.d.ts.map