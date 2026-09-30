import { generateObject } from 'ai';
import { workerSpecs } from './models.js';
import { limits } from './config.js';
import { reportFailure, reportUsage } from './providers.js';
import { withAiOperation } from './usage-record.js';
import { PROVIDER_IDS } from './types.js';
// =============================================================================
// 합의 모드 · 세 작업자에게 같은 구조화 질문 → 만장일치일 때만 값
// =============================================================================
// 생성 모드(ensemble)와 다르다. 여기서는 답을 «섞지» 않는다. 셋이 같은 답을 냈는지만 본다.
// «둘 중 둘» 은 만장일치가 아니다. 한 회사가 키가 없거나 죽으면 그 호출은 만장일치를 낼 수 없다.
// 그래야 한 회사만 살아 있는 날에 자동 채택이 몰래 늘지 않는다.
// 판단은 부르는 쪽 몫이다. 이 함수는 «같은가» 만 말한다.
export const VOTE_ROLES = PROVIDER_IDS;
function failureProvider(p) {
    return p === 'claude' ? 'anthropic' : p === 'openai' ? 'openai' : 'google';
}
async function defaultAsk(spec, o) {
    const { object, usage, finishReason } = await generateObject({
        model: spec.build(),
        schema: o.schema,
        system: o.system,
        prompt: o.prompt,
        maxOutputTokens: o.maxOutputTokens ?? limits.maxTokens(),
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(o.timeoutMs ?? limits.workerTimeoutMs()),
    });
    reportUsage(spec.model, 'worker', usage, finishReason);
    return object;
}
export function vote(o, deps = {}) {
    return withAiOperation(o.operation ?? 'vote', async () => {
        // 요청한 역할이 «전원» 의 기준이다. 겹친 항목은 하나로 보고, spec 이 없는 역할도 한 줄로 남긴다.
        const roles = [...new Set(o.roles ?? VOTE_ROLES)];
        const all = (deps.specs ?? workerSpecs)();
        const ask = deps.ask ?? (defaultAsk);
        const rawErrors = new Map();
        const answers = await Promise.all(roles.map(async (role) => {
            const started = Date.now();
            const s = all.find((x) => x.provider === role);
            if (!s)
                return { provider: role, model: '', ok: false, error: '키 없음', ms: 0 };
            if (!s.enabled())
                return { provider: s.provider, model: s.model, ok: false, error: '키 없음', ms: 0 };
            try {
                const value = await ask(s, o);
                return { provider: s.provider, model: s.model, ok: true, value, key: o.key(value), ms: Date.now() - started };
            }
            catch (e) {
                rawErrors.set(s.provider, e);
                return {
                    provider: s.provider,
                    model: s.model,
                    ok: false,
                    error: e instanceof Error ? e.message : String(e),
                    ms: Date.now() - started,
                };
            }
        }));
        await Promise.all(answers
            .filter((a) => !a.ok && rawErrors.has(a.provider))
            .map((a) => reportFailure({
            provider: failureProvider(a.provider),
            operation: `${o.operation ?? 'vote'}.vote.${a.model}`,
            error: rawErrors.get(a.provider) ?? new Error(a.error ?? '실패'),
            meta: { asked: roles.length, answered: answers.filter((x) => x.ok).length, model: a.model },
        })));
        const ok = answers.filter((a) => a.ok && a.key !== undefined);
        const counts = new Map();
        for (const a of ok) {
            const cur = counts.get(a.key);
            if (cur)
                cur.count += 1;
            else
                counts.set(a.key, { value: a.value, count: 1 });
        }
        const sorted = [...counts.values()].sort((x, y) => y.count - x.count);
        const top = sorted[0];
        const second = sorted[1];
        const majority = top && top.count >= 2 && (!second || second.count < top.count) ? top : null;
        const unanimous = ok.length === roles.length && roles.length > 0 && counts.size === 1 && top ? top.value : null;
        return { answers, answered: ok.length, unanimous, majority };
    });
}
//# sourceMappingURL=vote.js.map