# @lierline/ai-federation

Claude · GPT · Gemini 세 AI에게 같은 작업을 **병렬**로 보내고, 고지능 **Head**(Opus)가
결과를 종합·재평가하는 크로스플랫폼 공용 AI 라이브러리.

```
작업/질문 ──┬─▶ Claude(Haiku) ─┐
            ├─▶ GPT(4o-mini) ──┼─▶ Head(Opus 4.8)
            └─▶ Gemini(Flash) ─┘
                                 ├─ 생성 모드(ensemble): 여러 초안 → 하나로 종합
                                 └─ 판단 모드(federate): 신뢰도 재평가 + 확신도
```

## 두 가지 모드

| 함수 | 목적 | 출력 |
| --- | --- | --- |
| `ensemble(opts)` | **생성 품질** — 여러 초안을 Head가 하나로 종합 | 최종 텍스트 |
| `federate(question)` | **판단 정확도** — 같은 질문 3사 답 → 신뢰도 재평가 | 랭킹 + 합의/상충 + **확신도(0~1)** |

## 설치

```bash
npm i github:lierline/ai-federation
cp node_modules/@lierline/ai-federation/.env.example .env.local  # 키 채우기
```

## 필요한 키 (`.env.local`)

| 변수 | 발급처 |
| --- | --- |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/ |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `GOOGLE_API_KEY` (또는 `GEMINI_API_KEY`) | https://aistudio.google.com/app/apikey |

> 키 없는 provider 는 자동 제외(graceful degradation). 최소 1개로도 동작.

## 사용

```ts
import { federate, ensemble } from '@lierline/ai-federation'

// 판단 모드
const r = await federate('상온 초전도체는 현재 재현 가능한가?')
console.log(r.head?.finalAnswer, r.head?.confidence)

// 생성 모드
const e = await ensemble({ system: '너는 의학 작가다', prompt: '면역항암제를 3문장으로', tier: 'head' })
console.log(e.text)
```

## CLI (패키지 자체 테스트용)

```bash
pnpm judge "2024 노벨 물리학상 수상자는?"   # 판단
pnpm ask "면역항암제 작용기전을 3문장으로"    # 생성
pnpm eval                                     # 평가 하네스
```

## 상태

v1 — 코어(생성·판단·확신도·graceful degradation·CLI·eval). 적대적 검증(verify)·웹서치 접지(grounded)는 v2 예정.
