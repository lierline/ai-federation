import { modelFor } from './registry.js';
import { hasKey, languageModel } from './providers.js';
const WORKER_ROLES = {
    claude: 'worker.claude',
    openai: 'worker.openai',
    gemini: 'worker.gemini',
};
/** 3사 병렬 워커. 모델은 등록부의 worker.* 역할이 정한다. 키가 없는 제공자는 enabled()=false. */
export function workerSpecs() {
    return Object.keys(WORKER_ROLES).map((provider) => {
        const role = WORKER_ROLES[provider];
        const m = modelFor(role);
        return {
            provider,
            model: m.id,
            enabled: () => hasKey(m.provider),
            build: () => languageModel(role),
        };
    });
}
export function enabledWorkerSpecs() {
    return workerSpecs().filter((s) => s.enabled());
}
export function headModel() {
    return languageModel('head');
}
//# sourceMappingURL=models.js.map