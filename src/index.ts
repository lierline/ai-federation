export { federate } from './federate.js'
export { ensemble, ensembleStream, pickSingle } from './ensemble.js'
export { synthesize, HEAD_SYNTHESIS_GUIDE, buildSynthesisPrompt } from './head-synth.js'
export { judge } from './head-judge.js'
export { PROVIDER_IDS } from './types.js'
export { missingKeys } from './config.js'
export {
  TEXT_ROLES,
  EMBED_ROLES,
  DEFAULT_MODELS,
  modelFor,
  modelId,
  currentModels,
  envNameFor,
} from './registry.js'
export {
  configure,
  languageModel,
  languageModelById,
  embeddingModel,
  roleAvailable,
  hasKey,
  apiKey,
  gatewayModel,
  gatewayId,
  gatewayIds,
  gatewayOptions,
  isGatewayConfigured,
  resolveAnthropicBaseURL,
  rejectsSampling,
  usesNativeStructuredOutput,
  thinksByDefault,
} from './providers.js'
export type { Provider, TextRole, EmbedRole, Role, ModelSpec } from './registry.js'
export type { FederationConfig, FailureEvent, FetchProvider, UsageEvent } from './providers.js'
export type {
  ProviderId,
  WorkerResult,
  HeadReview,
  ReliabilityJudgment,
  FederationResult,
  EnsembleResult,
  EnsembleTier,
} from './types.js'
export type { EnsembleOpts, EnsembleStreamOpts, EnsembleQuality } from './ensemble.js'
