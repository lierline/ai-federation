// =============================================================================
// 원격 제품(Login · Q-Maison)과 평가 도구가 Q-Atelier 의 AI 총괄로 기록을 보내는 도우미
// =============================================================================
// 🔴 이 저장소는 공개다. 주소와 비밀값은 여기에 적지 않는다. 제품이 환경변수로 넘긴다.
// 보내기는 2초에서 끊는다. 실패는 던지고, 라이브러리의 기록 자리(usage-record · reportFailure)가 삼킨다.
import { setModelOverrides } from './registry.js';
const TIMEOUT_MS = 2000;
const SETTINGS_TTL_MS = 60_000;
function base(url) {
    return url.replace(/\/+$/, '');
}
function statusOf(error) {
    const s = error?.statusCode ?? error?.status;
    return typeof s === 'number' ? s : null;
}
export function createIngestSender(o) {
    const doFetch = o.fetch ?? fetch;
    const post = async (body) => {
        const res = await doFetch(`${base(o.url)}/api/ai-control/ingest`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-ai-ingest-key': o.secret },
            body: JSON.stringify({ product: o.product, ...body }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok)
            throw new Error(`AI 총괄 창구 응답 ${res.status}`);
    };
    const failure = (provider, operation, message, status, meta) => post({ type: 'failure', provider, operation, message: message.slice(0, 500), status, meta });
    return {
        recordUsage: (r) => post({ type: 'usage', records: [r] }),
        reportFailure: (e) => failure(e.provider, e.operation, e.error instanceof Error ? e.error.message : String(e.error ?? ''), statusOf(e.error), e.meta ?? null),
        postEvalRun: (run) => post({ type: 'eval_run', run }),
        /**
         * 제공자 호출을 지켜보는 fetch. 4xx · 5xx 나 네트워크 실패를 장애로 보낸다(잔액 소진이 여기서 잡힌다).
         * 응답은 손대지 않고 그대로 돌려준다. 보내기 실패는 삼킨다.
         */
        observedFetch(provider, inner = fetch) {
            return (async (input, init) => {
                let res;
                try {
                    res = await inner(input, init);
                }
                catch (e) {
                    await failure(provider, 'http', e instanceof Error ? e.message : String(e), null, null).catch(() => { });
                    throw e;
                }
                if (res.status >= 400) {
                    const text = await res.clone().text().catch(() => '');
                    await failure(provider, 'http', text || `HTTP ${res.status}`, res.status, null).catch(() => { });
                }
                return res;
            });
        },
    };
}
/** 60초마다 자기 제품의 모델 설정을 받아 넣는다. 못 받으면 마지막 값(없으면 환경변수 · 기본값)으로 계속한다. */
export function createRemoteSettingsSync(o) {
    const doFetch = o.fetch ?? fetch;
    let loadedAt = 0;
    let inflight = null;
    const load = async () => {
        const res = await doFetch(`${base(o.url)}/api/ai-control/settings?product=${encodeURIComponent(o.product)}`, {
            headers: { 'x-ai-ingest-key': o.secret },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok)
            throw new Error(`AI 설정 창구 응답 ${res.status}`);
        const j = (await res.json());
        setModelOverrides(j.overrides ?? {});
    };
    return async () => {
        if (Date.now() - loadedAt < SETTINGS_TTL_MS)
            return;
        inflight ??= load().finally(() => {
            inflight = null;
        });
        try {
            await inflight;
        }
        catch (e) {
            console.warn('[ai-federation] 모델 설정을 받지 못해 이전 값으로 계속합니다:', e instanceof Error ? e.message : e);
        }
        finally {
            loadedAt = Date.now();
        }
    };
}
//# sourceMappingURL=remote.js.map