import type { LanguageModel } from 'ai'
import type { ProviderId } from './types.js'
import { modelFor, type TextRole } from './registry.js'
import { hasKey, languageModel } from './providers.js'

export interface WorkerSpec {
  provider: ProviderId
  model: string
  enabled: () => boolean
  build: () => LanguageModel
}

const WORKER_ROLES: Record<ProviderId, TextRole> = {
  claude: 'worker.claude',
  openai: 'worker.openai',
  gemini: 'worker.gemini',
}

/** 3사 병렬 워커. 모델은 등록부의 worker.* 역할이 정한다. 키가 없는 제공자는 enabled()=false. */
export function workerSpecs(): WorkerSpec[] {
  return (Object.keys(WORKER_ROLES) as ProviderId[]).map((provider) => {
    const role = WORKER_ROLES[provider]
    const m = modelFor(role)
    return {
      provider,
      model: m.id,
      enabled: () => hasKey(m.provider),
      build: () => languageModel(role),
    }
  })
}

export function enabledWorkerSpecs(): WorkerSpec[] {
  return workerSpecs().filter((s) => s.enabled())
}

export function headModel(): LanguageModel {
  return languageModel('head')
}
