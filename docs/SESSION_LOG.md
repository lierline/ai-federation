# AI Federation — Session Log

작업 세션 순차 기록. 최신 세션이 위에 온다. 각 항목 = 무엇을 / 왜 / 검증.

---

## 2026-07-14 — v1 신규 구축 + Veris 첫 파일럿

- **무엇**: 크로스플랫폼 공용 AI 라이브러리 `@lierline/ai-federation` v1을 신규 구축.
  - **코어**(TDD, 30테스트): 공용 병렬 엔진 `runWorkers`(allSettled + 개별 타임아웃 + 부분실패 흡수) 위에
    Head 2전략 — `federate`(판단: 3사 답 → Head 신뢰도 재평가 + 확신도) / `ensemble`(생성: 여러 초안 → Head
    종합, tier head/consensus/single). graceful degradation, 키 없는 provider 자동 제외.
  - **스택**: TS ESM · Vercel AI SDK v6(`generateText`+`Output.object`+zod — v6에서 `generateObject` deprecated) ·
    `@ai-sdk/{anthropic,openai,google}` · 최신 모델(워커 Haiku4.5·gpt-4o-mini·Gemini2.5 / Head Opus4.8).
    키: `ANTHROPIC/OPENAI/GOOGLE_API_KEY`(GOOGLE 없으면 GEMINI 폴백).
  - **배포 형태**: **public** GitHub repo + **dist 커밋본**(`prepare` 제거 — pnpm 빌드스크립트 차단·소비자
    allowBuilds 불필요). `pnpm add github:lierline/ai-federation` 만으로 소비.
  - **CLI/eval**: `aifed ask|judge` + 평가 하네스(gradeContains + 5케이스).
- **왜**: 오너 니즈 — "AI 판단 정확도 향상 + 내가 AI 쓸 때 모든 플랫폼에 적용하는 기본 기능". Q-Atelier
  `head-ensemble`(생성)과 Veris `claude/ai-federation` 브랜치(판단)의 계보를 하나의 공유 패키지로 통합.
- **검증**: vitest 30 pass · `tsc` 0 · **eval 5/5**(정확도·확신도 평균 1.00, 실 API judge/ask/eval).
  **Veris 첫 파일럿 통합 → 프로덕션 라이브**(Vera '정밀 판단(3-AI)' 토글 + `/api/ai/federate`).
- **결정/이슈**: 배포 방식 = 공유 패키지(import) · SDK = Vercel AI SDK 통일 · v1은 코어만(verify·grounded=v2).
  Vercel이 비공개 git-dep를 clone 못 해(git fetch exit 128) Veris 배포 실패 → **repo public 전환**으로 해결.
- **다음**: 파일럿 통합 **Login(오너 지정 필수)**·Q-Atelier. v1.1(Head 재시도/최다합의 폴백) → v2(verify·grounded).
