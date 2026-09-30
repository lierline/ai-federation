import type { LanguageModel } from 'ai';
import type { ProviderId } from './types.js';
export interface WorkerSpec {
    provider: ProviderId;
    model: string;
    enabled: () => boolean;
    build: () => LanguageModel;
}
/** 3사 병렬 워커. 모델은 등록부의 worker.* 역할이 정한다. 키가 없는 제공자는 enabled()=false. */
export declare function workerSpecs(): WorkerSpec[];
export declare function enabledWorkerSpecs(): WorkerSpec[];
export declare function headModel(): LanguageModel;
//# sourceMappingURL=models.d.ts.map