# ai-federation 시스템 전수 감사 보고서

- 감사일: 2026-08-11 (Asia/Seoul)
- 감사자: Codex
- 대상 커밋 상태: 감사 시작 시 clean worktree
- 범위: Git 추적 파일 89개(코드 51개, 테스트 11개), 패키지/빌드 설정, 모델 실행·폴백·평가 경로
- 판정: **조건부 통과 — 핵심 빌드와 테스트는 건전하나 폴백·consensus 의미를 바로잡아야 함**

## 실행 검증

| 검사 | 결과 |
|---|---|
| `pnpm typecheck` | 통과 |
| `pnpm test` | 통과 — 11 files, 30 tests |
| `pnpm build` | 통과 |
| lint | 스크립트/구성 없음 |
| 운영 의존성 취약점 조회 | 외부 레지스트리로 저장소 메타데이터가 전송될 수 있어 실행 승인 거절됨 |

## 발견 사항

### [중간] 단일 모델 폴백이 활성 provider와 무관하게 Anthropic으로 고정됨

`src/ensemble.ts:44`의 `defaultSingle()`은 항상 Claude를 호출한다. OpenAI 또는 Gemini 키만 설정해도 `enabledWorkerSpecs()`는 실행 가능으로 판단하지만, `tier: "single"` 또는 모든 worker 실패 후의 폴백은 Anthropic 키가 없어 실패할 수 있다. 활성 provider 중 하나를 결정적으로 선택하거나 `singleProvider`를 명시 입력으로 받아야 한다.

### [중간] `consensus`가 합의 계산 없이 첫 번째 초안을 반환함

`src/ensemble.ts:76`은 `drafts[0].text`를 그대로 반환하면서 `degraded: false`로 표시한다. provider 순서가 사실상 결과를 결정하며, 1개 응답만 남아도 합의로 보고된다. 최소 응답 수, 일치도 계산, 합의 실패 상태를 정의하거나 모드명을 `first-success`로 바꾸는 편이 정확하다.

### [낮음] Head 타임아웃이 실제 provider 요청을 취소하지 않음

`src/config.ts:35-39`의 `withTimeout()`은 `Promise.race`만 사용한다. 호출자는 빨리 실패하지만 원래 네트워크 요청은 계속 실행되어 비용과 동시성 슬롯을 소비할 수 있다. `AbortController`를 Head 호출까지 전달하고 타이머 정리도 보장해야 한다.

### [낮음] 정적 분석 게이트가 없음

타입검사와 단위 테스트는 양호하지만 lint 스크립트가 없다. 공개 패키지 API, 미사용 export, promise 처리, Node/ESM 규칙을 검사하는 ESLint 구성을 CI에 추가하는 것이 좋다.

## 잘된 점

- worker 병렬 실행, 개별 실패 격리, 타임아웃 결과 모델이 간결하다.
- Zod 구조화 출력과 confidence clamp가 적용되어 있다.
- 핵심 실행 경로에 테스트가 있고 빌드 산출물도 검증됐다.
- 키가 없는 provider를 제외하는 graceful degradation 의도가 분명하다.

## 우선 조치

1. `defaultSingle()`을 실제 활성 provider 기반으로 수정하고 Anthropic 미설정 회귀 테스트 추가.
2. `consensus`의 의미와 최소 quorum을 정의하고 단일 응답을 degraded로 표시.
3. Head 호출에 abort signal 전파.
4. lint 및 실제 provider 계약 테스트(비용 제한된 smoke)를 CI에 추가.

## 감사 한계

실제 외부 모델 호출, 과금·rate limit·provider 장애 주입, npm registry 취약점 조회는 수행하지 않았다. 이 보고서는 저장소 상태와 로컬 검증 결과에 대한 감사이며 모델 응답의 사실 정확성을 보증하지 않는다.
