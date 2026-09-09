import type { ProviderId, WorkerResult } from './types.js'

export interface Worker {
  provider: ProviderId
  model: string
  /** signal 은 타임아웃 시 abort 됨 · 실제 네트워크 호출은 이걸로 조기 취소한다. */
  run: (signal: AbortSignal) => Promise<string>
}

/**
 * 워커들을 병렬 실행하고 각자를 독립 타임아웃으로 감싼다.
 * - 한 워커의 실패/지연이 다른 워커·전체를 막지 않는다(부분실패 흡수).
 * - 타임아웃은 signal 전달 + race 로 이중 보장(워커가 signal 을 무시해도 타임아웃 성립).
 */
export async function runWorkers(workers: Worker[], timeoutMs: number): Promise<WorkerResult[]> {
  return Promise.all(
    workers.map(async (w): Promise<WorkerResult> => {
      const started = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const text = await Promise.race([
          w.run(controller.signal),
          new Promise<string>((_, reject) => {
            controller.signal.addEventListener('abort', () =>
              reject(new Error(`타임아웃(${timeoutMs}ms)`)),
            )
          }),
        ])
        return { provider: w.provider, model: w.model, ok: true, text: text.trim(), ms: Date.now() - started }
      } catch (e) {
        return {
          provider: w.provider,
          model: w.model,
          ok: false,
          text: '',
          error: e instanceof Error ? e.message : String(e),
          ms: Date.now() - started,
        }
      } finally {
        clearTimeout(timer)
      }
    }),
  )
}
