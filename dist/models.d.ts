import type { LanguageModel } from 'ai';
import type { ProviderId } from './types.js';
export interface WorkerSpec {
    provider: ProviderId;
    model: string;
    enabled: () => boolean;
    build: () => LanguageModel;
}
export declare function workerSpecs(): WorkerSpec[];
export declare function enabledWorkerSpecs(): WorkerSpec[];
export declare function headModel(): LanguageModel;
//# sourceMappingURL=models.d.ts.map