# AI Federation · Session Log

작업 세션 순차 기록. 최신 세션이 위에 온다. 각 항목 = 무엇을 / 왜 / 검증.

---

## 2026-07-15 · ⚠️ v2 프로토타입 소재 기록 (코드 변경 없음)

- **무엇**: v2(verify·grounded) 착수 시 참고할 **기존 프로토타입의 위치**를 기록만 한다. 이 repo 는 손대지 않았다.
- **왜**: 전 프로젝트 정돈 조사에서 Veris 의 `origin/claude/ai-federation` 브랜치(SHA **`96f03fc`**, 12커밋, 2026-07-04)가 "독립 repo 로 승격 완료된 스테일 브랜치"로 **오판되어 삭제될 뻔했다.** 실제로는 이 repo 에 **없는** 코드가 들어 있다:

  | 브랜치 파일 (`ai-federation/` 하위) | 내용 | 이 repo 에 있나 |
  |---|---|---|
  | `src/verify.ts` (60줄) | Anthropic tool-use `submit_verdict` 기반 검증 | ❌ (`Verification`·`submit_verdict` grep 0건) |
  | `src/context.ts` (16줄) | 워커 프롬프트에 현재 날짜 주입 | ❌ (`dateContext` grep 0건) |
  | `src/eval/metrics.ts` (37줄) | Brier score · ECE 확신도 보정 지표 | ❌ (`brier`·`ece` grep 0건) |

- **`src/eval/grade.ts` 는 이것의 대체가 아니다** · grade 는 *기대 키워드 포함률* 채점이고, metrics 는 *확신도 보정*(Brier/ECE)이다. 서로 다른 축.
- v1 은 코어만 담았고(이 로그 아래 "verify·grounded=v2"), **v2 에 하려는 바로 그 작업의 프로토타입이 저 브랜치에 이미 있다.** v2 착수 시 처음부터 쓰지 말고 먼저 꺼내볼 것:
  `git -C D:\Claude\Veris show 96f03fc:ai-federation/src/verify.ts`
- 구조는 그새 갈라졌다(브랜치 `head.ts` → 현 `head-judge.ts`+`head-synth.ts`, 브랜치 `providers/{claude,gemini,openai}.ts` → 현 `models.ts`). 그대로 복붙은 안 되고 이식이 필요하다.
- **이 브랜치를 지우지 말 것.** 지운다면 위 3파일을 먼저 이 repo 로 옮긴 뒤에.

---

## 2026-07-14 · v1 신규 구축 + Veris 첫 파일럿

- **무엇**: 크로스플랫폼 공용 AI 라이브러리 `@lierline/ai-federation` v1을 신규 구축.
  - **코어**(TDD, 30테스트): 공용 병렬 엔진 `runWorkers`(allSettled + 개별 타임아웃 + 부분실패 흡수) 위에
    Head 2전략 · `federate`(판단: 3사 답 → Head 신뢰도 재평가 + 확신도) / `ensemble`(생성: 여러 초안 → Head
    종합, tier head/consensus/single). graceful degradation, 키 없는 provider 자동 제외.
  - **스택**: TS ESM · Vercel AI SDK v6(`generateText`+`Output.object`+zod · v6에서 `generateObject` deprecated) ·
    `@ai-sdk/{anthropic,openai,google}` · 최신 모델(워커 Haiku4.5·gpt-4o-mini·Gemini2.5 / Head Opus4.8).
    키: `ANTHROPIC/OPENAI/GOOGLE_API_KEY`(GOOGLE 없으면 GEMINI 폴백).
  - **배포 형태**: **public** GitHub repo + **dist 커밋본**(`prepare` 제거 · pnpm 빌드스크립트 차단·소비자
    allowBuilds 불필요). `pnpm add github:lierline/ai-federation` 만으로 소비.
  - **CLI/eval**: `aifed ask|judge` + 평가 하네스(gradeContains + 5케이스).
- **왜**: 오너 니즈 · "AI 판단 정확도 향상 + 내가 AI 쓸 때 모든 플랫폼에 적용하는 기본 기능". Q-Atelier
  `head-ensemble`(생성)과 Veris `claude/ai-federation` 브랜치(판단)의 계보를 하나의 공유 패키지로 통합.
- **검증**: vitest 30 pass · `tsc` 0 · **eval 5/5**(정확도·확신도 평균 1.00, 실 API judge/ask/eval).
  **Veris 첫 파일럿 통합 → 프로덕션 라이브**(Vera '정밀 판단(3-AI)' 토글 + `/api/ai/federate`).
- **결정/이슈**: 배포 방식 = 공유 패키지(import) · SDK = Vercel AI SDK 통일 · v1은 코어만(verify·grounded=v2).
  Vercel이 비공개 git-dep를 clone 못 해(git fetch exit 128) Veris 배포 실패 → **repo public 전환**으로 해결.
- **다음**: 파일럿 통합 **Login(오너 지정 필수)**·Q-Atelier. v1.1(Head 재시도/최다합의 폴백) → v2(verify·grounded).
