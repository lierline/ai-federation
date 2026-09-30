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
/** 역할의 모델. 환경변수가 있으면 그것, 없으면 기본값. 제공자는 역할이 정한다. */
export declare function modelFor(role: Role): ModelSpec;
export declare function modelId(role: Role): string;
/** 지금 쓰는 역할별 모델 전부. 상태판 · 기록용. */
export declare function currentModels(): Record<Role, ModelSpec>;
//# sourceMappingURL=registry.d.ts.map