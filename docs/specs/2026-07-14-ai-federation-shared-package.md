# AI Federation · 크로스플랫폼 공유 패키지 스펙 (v1)

- **날짜**: 2026-07-14
- **상태**: 설계 합의 완료 → 사용자 스펙 리뷰 대기
- **최종 저장 위치(승인 후)**: `lierline/ai-federation` repo의 `docs/specs/`

---

## 1. 배경 & 목표

**계보 (실제 코드 기준)**
- **Q-Atelier `lib/ai/head-ensemble.ts`** · 원조. "여러 fast AI 초안 → Opus Head 종합"의 **생성(발산) 앙상블**. 8개 API에 통합, 파일럿 6전6승으로 검증된 운영 자산. Vercel AI SDK 사용.
- **Veris `claude/ai-federation` 브랜치** · 그 아이디어를 3사(Claude·GPT·Gemini)+Head+접지+검증으로 일반화한 **판단(정확도) 페더레이션**. 강제 tool-use로 JSON 견고. 단 CLI만·미배포·미머지, 모델 ID 구형.

**목표**
- 두 모양을 **하나의 크로스플랫폼 공유 패키지**로 통합해, 모든 플랫폼(Q-Atelier·Login·Veris·MedQraft)에서 `import`해 쓰는 **"AI 기본 기능"**으로 승격.
- 핵심 가치: **다중 AI 합의로 판단 정확도를 올리고, 생성 품질도 올린다** · "AI를 쓸 때마다" 재사용.

---

## 2. 범위 (v1)

**포함**
- 공용 **병렬 엔진** (fan-out · 타임아웃 · graceful degradation)
- **생성 모드** (`ensemble`) · 여러 초안 → Head 종합, 스트리밍 지원
- **판단 모드** (`federate`) · 같은 질문 3사 답 → Head 신뢰도 재평가 + **확신도(0~1)**
- 최신 모델 ID + env 오버라이드
- 패키지 자체 테스트용 **CLI + eval 하네스**

**제외 → v2로 이연**
- 적대적 검증(`verify`)
- 실시간 웹서치 접지(`grounded`)
- 실제 앱 통합 (파일럿은 v1 이후 별도 단계 · §8)

---

## 3. 아키텍처 결정 (합의 완료)

| 항목 | 결정 | 근거 |
|---|---|---|
| 기능 모양 | **하이브리드**(생성+판단 통합 라이브러리) | 실제 니즈가 둘 다. 두 모드가 엔진 70% 공유, Head 전략만 분기 |
| 배포 방식 | **공유 패키지 (import)** | 인프로세스 = 지연 없음·스트리밍 자연스러움·각 앱 자기 키 |
| 패키지 위치 | **새 비공개 repo `lierline/ai-federation`** | git dependency로 각 앱 참조. Veris 내부 유지는 의존 방향이 어색 |
| SDK | **Vercel AI SDK** (`ai`) | Q-Atelier 검증됨 · 스트리밍 무료 · `generateObject`+zod로 판단 JSON 견고(수동 tool-use 대체) · 3사 인터페이스 통일 |
| 런타임 | TS · ESM · Node 24 | 기존 스택 일치 |

**모델 (현행 최신 ID 고정, env로 오버라이드 가능)**
- 워커(fast): `claude-haiku-4-5-20251001` · `gpt-4o-mini` · `gemini-2.5-flash`
- Head(고지능): `claude-opus-4-8`  ← 구형 `claude-sonnet-4-6` 문제 해소

---

## 4. 공개 API (인터페이스 계약)

```ts
// ── 판단 모드 ─────────────────────────────────────────────
federate(question: string, opts?: {
  maxTokens?: number; timeoutMs?: number;
}): Promise<FederationResult>

type FederationResult = {
  question: string
  workers: WorkerResult[]           // 각 AI 원답변(성공/실패·소요ms)
  head: HeadReview | null           // 신뢰도 재평가 + 종합
  headError?: string
  ms: number
}
type HeadReview = {
  rankings: { provider; reliability: number; rationale }[]
  consensus: string; conflicts: string
  finalAnswer: string; confidence: number   // 0~1
}

// ── 생성 모드 ─────────────────────────────────────────────
ensemble(opts: {
  system: string; prompt: string;
  tier: 'head' | 'consensus' | 'single';    // head=Opus종합, consensus=fast만, single=단일
  maxTokens?: number;
}): Promise<EnsembleResult>                  // { text, tier, fastModels, headUsed, degraded }

ensembleStream(opts): StreamResult           // 생성 스트리밍 변형(draft UX용)
```

**공용 내부 엔진**: `fanOut(models, system, prompt, timeout)` · `Promise.allSettled` 병렬 + 개별 타임아웃 → 성공 draft 수집.

**설정/키**: env `ANTHROPIC_API_KEY`·`OPENAI_API_KEY`·`GOOGLE_API_KEY` (+ `*_MODEL` 오버라이드). 키 없는 provider는 자동 제외(graceful 축소).

---

## 5. 동작 규칙 (기존 검증 자산 계승)

- **정직보류(graceful degradation)**:
  - fast 일부 실패 → 성공한 나머지로 진행
  - fast 전부 실패 → 단일 Haiku 폴백
  - Head 실패 → (생성) 최장 초안 반환 / (판단) `headError` 표기, 워커 원답변은 보존
- **판단 Head** = `generateObject` + zod 스키마로 **강제 구조화 출력** → JSON 파싱 실패 모드 원천 제거(Veris tool-use 강건성을 AI SDK 방식으로 흡수).
- **생성 Head** = 작업 system 뒤에 종합 지침 부착. `consensus` tier는 Head 스킵(수렴작업 이득 0 실측).
- **알려진 사실 주입**: 현재 날짜 등 확실한 사실은 프롬프트에 못박아 파라메트릭 추측 방지(Veris 실측 계승).

---

## 6. 패키지 구조 (초안)

```
ai-federation/
  src/
    engine.ts        # fanOut 병렬 엔진(공용)
    models.ts        # provider별 모델 빌더 + enabled() + env
    ensemble.ts      # 생성 모드 (+ stream)
    federate.ts      # 판단 모드
    head.ts          # Head 종합/평가 (zod 스키마)
    types.ts
    config.ts
    cli.ts           # `ask` / `judge` 실행
    eval/            # 정확도 평가 하네스
  package.json       # exports · name @lierline/ai-federation
  tsconfig.json · README.md · .env.example
```

---

## 7. 수용 기준 (v1 "운영 가능"의 정의)

1. CLI로 `federate`·`ensemble` **실제 구동** (최신 모델, 최소 2 provider 키로).
2. eval 하네스 통과 (기존 평가셋 이식).
3. graceful degradation 케이스 테스트: 키 1개만 있을 때 / 한 provider 타임아웃 시 정상 축소.
4. `typecheck` 0 error.
5. 다른 repo에서 git dependency로 설치 → import → 호출까지 스모크 확인.

---

## 8. 다음 단계 (승인 후)

1. **패키지 repo 스캐폴드** + 양쪽 자산 통합 이식 + 최신 모델 (writing-plans로 태스크화)
2. **CLI/eval 실제 구동 검증** (수용 기준 §7)
3. **파일럿 통합 1개 플랫폼** · 후속 결정(§9)
4. git dependency로 나머지 앱 배선 (후속)

---

## 9. 미해결 / 후속 결정

- **파일럿 통합 대상**: **Login 필수 포함** + Q-Atelier(정확도 핵심 + 기존 head-ensemble 교체 검증) · Veris(브랜치 코드 최신). Login은 반드시 통합하고, 나머지 순서는 v1 코어 완성 후 결정.
- **Q-Atelier `head-ensemble` 마이그레이션**: 호환 어댑터로 점진 교체 vs 일괄 교체. 8개 라우트 영향 → 신중히.
- **v2 로드맵**: 적대적 검증(verify) → 웹서치 접지(grounded).
- **Veris `claude/ai-federation` 브랜치 처리**: 코어 이식 완료 후 아카이브/삭제.
