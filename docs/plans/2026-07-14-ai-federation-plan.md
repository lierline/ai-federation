# AI Federation 공유 패키지 v1 — 구현 계획

**목표:** Claude·GPT·Gemini 병렬 응답을 Opus Head가 종합(생성)·재평가(판단)하는 크로스플랫폼 공유 패키지 `@lierline/ai-federation`을 실제 운영 가능하게 만든다.
**아키텍처:** 공용 병렬 엔진(`runWorkers`) 위에 Head 2전략을 얹는다 — `synthesize`(생성: 여러 초안→하나) · `judge`(판단: 신뢰도 재평가+확신도, `generateText`+`Output.object`+zod). 각 앱은 git dependency로 in-process import. 의존성 주입(deps)으로 네트워크 없이 오케스트레이션까지 단위테스트.
**기술 스택:** TS(strict, ESM) · Node 24 · `ai@^6` · `@ai-sdk/{anthropic,openai,google}@^3` · `zod@^4` · `vitest@^4` · `dotenv` · `tsx`(CLI).

## 전역 제약
- 모든 소스 ESM(`"type":"module"`), 상대 import는 `.js` 확장자 명시(NodeNext).
- 모델 ID는 config 한 곳에서만(하드코딩 금지). 워커 `claude-haiku-4-5-20251001`·`gpt-4o-mini`·`gemini-2.5-flash`, Head `claude-opus-4-8`. env로 오버라이드.
- Gemini 키는 `GOOGLE_API_KEY` 우선, 없으면 `GEMINI_API_KEY` 폴백.
- graceful degradation: 워커 일부 실패→나머지로 진행 / 전부 실패→단일 Haiku 폴백(생성) 또는 headError(판단) / Head 실패→최장 초안(생성).
- `generateObject`는 v6에서 deprecated → 판단은 `generateText`+`Output.object` 사용.
- 키·비밀은 커밋 금지(`.env.local` gitignore). 각 태스크 끝에 커밋.
- 테스트는 네트워크 미접속(실제 모델 호출은 CLI/eval 통합 단계에서만).

---

## Task 0: repo 스캐폴드
- **파일(생성):** `D:\Claude\ai-federation\package.json` · `tsconfig.json` · `vitest.config.ts` · `.gitignore` · `.env.example` · `README.md` · `src/index.ts`(빈 export)
- **단계:**
  - [ ] 1. 폴더 생성 후 아래 파일 작성.
    - `package.json`:
      ```json
      {
        "name": "@lierline/ai-federation",
        "version": "0.1.0",
        "private": true,
        "type": "module",
        "exports": { ".": "./src/index.ts" },
        "bin": { "aifed": "./src/cli.ts" },
        "scripts": {
          "ask": "tsx src/cli.ts ask",
          "judge": "tsx src/cli.ts judge",
          "eval": "tsx src/eval/run.ts",
          "typecheck": "tsc --noEmit",
          "test": "vitest run"
        },
        "dependencies": {
          "ai": "^6.0.191",
          "@ai-sdk/anthropic": "^3.0.78",
          "@ai-sdk/openai": "^3.0.64",
          "@ai-sdk/google": "^3.0.88",
          "zod": "^4.4.3",
          "dotenv": "^16.4.5"
        },
        "devDependencies": {
          "tsx": "^4.19.2",
          "typescript": "^5.7.2",
          "@types/node": "^22.10.0",
          "vitest": "^4.1.7"
        }
      }
      ```
    - `tsconfig.json`:
      ```json
      {
        "compilerOptions": {
          "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
          "strict": true, "noEmit": true, "esModuleInterop": true,
          "skipLibCheck": true, "types": ["node"], "lib": ["ES2022"]
        },
        "include": ["src"]
      }
      ```
    - `vitest.config.ts`:
      ```ts
      import { defineConfig } from 'vitest/config'
      export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } })
      ```
    - `.gitignore`: `node_modules\n.env\n.env.local\ndist\n`
    - `.env.example`:
      ```
      ANTHROPIC_API_KEY=
      OPENAI_API_KEY=
      GOOGLE_API_KEY=
      # GEMINI_API_KEY=  # GOOGLE_API_KEY 없을 때 폴백
      # CLAUDE_MODEL=claude-haiku-4-5-20251001
      # OPENAI_MODEL=gpt-4o-mini
      # GEMINI_MODEL=gemini-2.5-flash
      # HEAD_MODEL=claude-opus-4-8
      # MAX_TOKENS=1200
      # WORKER_TIMEOUT_MS=30000
      # HEAD_TIMEOUT_MS=60000
      ```
    - `src/index.ts`: `export {}` (Task 7·9에서 실제 export 채움)
  - [ ] 2. `git init && git branch -M main`, `pnpm install`(또는 npm) 실행 → 설치 성공 확인.
  - [ ] 3. `pnpm typecheck` → 0 error(빈 프로젝트).
  - [ ] 4. 커밋: `chore: ai-federation 패키지 스캐폴드(AI SDK v6·zod4·vitest)`

---

## Task 1: 공용 타입 (`src/types.ts`)
- **파일:** 생성 `src/types.ts`, 테스트 `src/types.test.ts`
- **인터페이스(생산):** `ProviderId` · `WorkerResult` · `ReliabilityJudgment` · `HeadReview` · `FederationResult` · `EnsembleTier` · `EnsembleResult`
- **단계:**
  - [ ] 1. 실패 테스트 작성 — `src/types.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest'
    import type { WorkerResult, FederationResult } from './types.js'
    import { PROVIDER_IDS } from './types.js'

    describe('types', () => {
      it('PROVIDER_IDS 는 3사 고정', () => {
        expect(PROVIDER_IDS).toEqual(['claude', 'openai', 'gemini'])
      })
      it('WorkerResult 형태를 만족하는 객체를 구성할 수 있다', () => {
        const w: WorkerResult = { provider: 'claude', model: 'x', ok: true, text: 'hi', ms: 10 }
        const f: FederationResult = { question: 'q', workers: [w], head: null, ms: 20 }
        expect(f.workers[0].provider).toBe('claude')
      })
    })
    ```
  - [ ] 2. `pnpm test` → 실패(`PROVIDER_IDS` 없음 / 모듈 없음).
  - [ ] 3. 구현 — `src/types.ts`:
    ```ts
    export const PROVIDER_IDS = ['claude', 'openai', 'gemini'] as const
    export type ProviderId = (typeof PROVIDER_IDS)[number]

    export interface WorkerResult {
      provider: ProviderId
      model: string
      ok: boolean
      text: string
      error?: string
      ms: number
    }
    export interface ReliabilityJudgment {
      provider: ProviderId
      reliability: number // 0..1
      rationale: string
    }
    export interface HeadReview {
      rankings: ReliabilityJudgment[]
      consensus: string
      conflicts: string
      finalAnswer: string
      confidence: number // 0..1
    }
    export interface FederationResult {
      question: string
      workers: WorkerResult[]
      head: HeadReview | null
      headError?: string
      ms: number
    }
    export type EnsembleTier = 'head' | 'consensus' | 'single'
    export interface EnsembleResult {
      text: string
      tier: EnsembleTier
      fastModels: string[]
      headUsed: boolean
      degraded: boolean
    }
    ```
  - [ ] 4. `pnpm test` → 통과.
  - [ ] 5. 커밋: `feat(types): 연합 공용 타입(WorkerResult·HeadReview·FederationResult)`

---

## Task 2: 설정·유틸 (`src/config.ts`)
- **파일:** 생성 `src/config.ts`, 테스트 `src/config.test.ts`
- **인터페이스(생산):** `models` · `limits` · `missingKeys(): string[]` · `withTimeout<T>(p, ms, label): Promise<T>` · `geminiKey(): string | undefined`
- **단계:**
  - [ ] 1. 실패 테스트 — `src/config.test.ts`:
    ```ts
    import { describe, it, expect, beforeEach, afterEach } from 'vitest'
    import { missingKeys, withTimeout, geminiKey } from './config.js'

    const saved = { ...process.env }
    beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.GOOGLE_API_KEY; delete process.env.GEMINI_API_KEY })
    afterEach(() => { process.env = { ...saved } })

    describe('config', () => {
      it('키가 하나도 없으면 3개 모두 누락', () => {
        expect(missingKeys()).toEqual(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY'])
      })
      it('GEMINI_API_KEY 만 있어도 google 키는 충족(폴백)', () => {
        process.env.GEMINI_API_KEY = 'g'
        expect(missingKeys()).not.toContain('GOOGLE_API_KEY')
        expect(geminiKey()).toBe('g')
      })
      it('withTimeout 는 지연 시 라벨 포함 에러로 reject', async () => {
        const slow = new Promise((r) => setTimeout(r, 50))
        await expect(withTimeout(slow, 5, 'head')).rejects.toThrow(/head/)
      })
    })
    ```
  - [ ] 2. `pnpm test` → 실패.
  - [ ] 3. 구현 — `src/config.ts`:
    ```ts
    import { config as loadEnv } from 'dotenv'
    loadEnv({ path: '.env.local' })
    loadEnv()

    export const models = {
      claudeWorker: () => process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
      openaiWorker: () => process.env.OPENAI_MODEL || 'gpt-4o-mini',
      geminiWorker: () => process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      head: () => process.env.HEAD_MODEL || 'claude-opus-4-8',
    }
    export const limits = {
      maxTokens: () => Number(process.env.MAX_TOKENS) || 1200,
      workerTimeoutMs: () => Number(process.env.WORKER_TIMEOUT_MS) || 30_000,
      headTimeoutMs: () => Number(process.env.HEAD_TIMEOUT_MS) || 60_000,
    }
    export function geminiKey(): string | undefined {
      return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || undefined
    }
    export function missingKeys(): string[] {
      const m: string[] = []
      if (!process.env.ANTHROPIC_API_KEY) m.push('ANTHROPIC_API_KEY')
      if (!process.env.OPENAI_API_KEY) m.push('OPENAI_API_KEY')
      if (!geminiKey()) m.push('GOOGLE_API_KEY')
      return m
    }
    export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
      return Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} 타임아웃(${ms}ms)`)), ms)),
      ])
    }
    ```
  - [ ] 4. `pnpm test` → 통과.
  - [ ] 5. 커밋: `feat(config): 모델·한도·키 폴백(GOOGLE/GEMINI)·withTimeout`

---

## Task 3: 프로바이더 모델 레지스트리 (`src/models.ts`)
- **파일:** 생성 `src/models.ts`, 테스트 `src/models.test.ts`
- **인터페이스(소비):** `config.models` · `geminiKey` / **(생산):** `workerSpecs(): WorkerSpec[]` · `enabledWorkerSpecs()` · `headModel()`
  - `WorkerSpec = { provider: ProviderId; model: string; enabled(): boolean; build(): LanguageModel }`
- **단계:**
  - [ ] 1. 실패 테스트 — `src/models.test.ts`:
    ```ts
    import { describe, it, expect, beforeEach, afterEach } from 'vitest'
    import { workerSpecs, enabledWorkerSpecs } from './models.js'

    const saved = { ...process.env }
    beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.GOOGLE_API_KEY; delete process.env.GEMINI_API_KEY })
    afterEach(() => { process.env = { ...saved } })

    describe('models', () => {
      it('3사 스펙을 항상 노출한다', () => {
        expect(workerSpecs().map((s) => s.provider)).toEqual(['claude', 'openai', 'gemini'])
      })
      it('키 있는 provider 만 enabled', () => {
        process.env.ANTHROPIC_API_KEY = 'a'
        const on = enabledWorkerSpecs().map((s) => s.provider)
        expect(on).toEqual(['claude'])
      })
    })
    ```
  - [ ] 2. `pnpm test` → 실패.
  - [ ] 3. 구현 — `src/models.ts`:
    ```ts
    import { anthropic } from '@ai-sdk/anthropic'
    import { openai } from '@ai-sdk/openai'
    import { createGoogleGenerativeAI } from '@ai-sdk/google'
    import type { LanguageModel } from 'ai'
    import type { ProviderId } from './types.js'
    import { models, geminiKey } from './config.js'

    const google = createGoogleGenerativeAI({ apiKey: geminiKey() })

    export interface WorkerSpec {
      provider: ProviderId
      model: string
      enabled: () => boolean
      build: () => LanguageModel
    }
    export function workerSpecs(): WorkerSpec[] {
      return [
        { provider: 'claude', model: models.claudeWorker(), enabled: () => !!process.env.ANTHROPIC_API_KEY, build: () => anthropic(models.claudeWorker()) },
        { provider: 'openai', model: models.openaiWorker(), enabled: () => !!process.env.OPENAI_API_KEY, build: () => openai(models.openaiWorker()) },
        { provider: 'gemini', model: models.geminiWorker(), enabled: () => !!geminiKey(), build: () => google(models.geminiWorker()) },
      ]
    }
    export function enabledWorkerSpecs(): WorkerSpec[] {
      return workerSpecs().filter((s) => s.enabled())
    }
    export function headModel(): LanguageModel {
      return anthropic(models.head())
    }
    ```
  - [ ] 4. `pnpm test` → 통과.
  - [ ] 5. 커밋: `feat(models): 3사 프로바이더 레지스트리 + 키 기반 enabled 축소`

---

## Task 4: 병렬 엔진 (`src/engine.ts`)
- **파일:** 생성 `src/engine.ts`, 테스트 `src/engine.test.ts`
- **인터페이스(생산):** `Worker = { provider; model; run(signal): Promise<string> }` · `runWorkers(workers, timeoutMs): Promise<WorkerResult[]>`
- **핵심:** 각 워커를 독립 타임아웃으로 실행, 성공/실패/소요ms를 `WorkerResult`로. 한 워커 실패가 전체를 막지 않음.
- **단계:**
  - [ ] 1. 실패 테스트 — `src/engine.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest'
    import { runWorkers, type Worker } from './engine.js'

    const mk = (provider: any, fn: () => Promise<string>): Worker => ({ provider, model: 'm', run: () => fn() })

    describe('runWorkers', () => {
      it('일부 실패해도 성공분을 반환한다', async () => {
        const res = await runWorkers([
          mk('claude', async () => 'A'),
          mk('openai', async () => { throw new Error('boom') }),
          mk('gemini', async () => '  C  '),
        ], 1000)
        expect(res.find((r) => r.provider === 'claude')).toMatchObject({ ok: true, text: 'A' })
        expect(res.find((r) => r.provider === 'openai')).toMatchObject({ ok: false, error: 'boom', text: '' })
        expect(res.find((r) => r.provider === 'gemini')!.text).toBe('C') // trim
      })
      it('타임아웃 초과 워커는 ok:false', async () => {
        const res = await runWorkers([mk('claude', () => new Promise((r) => setTimeout(() => r('late'), 50)))], 5)
        expect(res[0].ok).toBe(false)
      })
    })
    ```
  - [ ] 2. `pnpm test` → 실패.
  - [ ] 3. 구현 — `src/engine.ts`:
    ```ts
    import type { ProviderId, WorkerResult } from './types.js'

    export interface Worker {
      provider: ProviderId
      model: string
      run: (signal: AbortSignal) => Promise<string>
    }
    export async function runWorkers(workers: Worker[], timeoutMs: number): Promise<WorkerResult[]> {
      return Promise.all(
        workers.map(async (w): Promise<WorkerResult> => {
          const started = Date.now()
          try {
            const text = await w.run(AbortSignal.timeout(timeoutMs))
            return { provider: w.provider, model: w.model, ok: true, text: text.trim(), ms: Date.now() - started }
          } catch (e) {
            return { provider: w.provider, model: w.model, ok: false, text: '', error: e instanceof Error ? e.message : String(e), ms: Date.now() - started }
          }
        }),
      )
    }
    ```
  - [ ] 4. `pnpm test` → 통과.
  - [ ] 5. 커밋: `feat(engine): runWorkers 병렬 실행 + 개별 타임아웃 + 부분실패 흡수`

---

## Task 5: 판단 Head — 프롬프트·스키마·clamp (`src/head-judge.ts` 순수부)
- **파일:** 생성 `src/head-judge.ts`, 테스트 `src/head-judge.test.ts`
- **인터페이스(생산):** `reviewSchema`(zod) · `buildJudgePrompt(question, workers): string` · `clamp01(n): number` · `toHeadReview(raw): HeadReview`
- **단계:**
  - [ ] 1. 실패 테스트 — `src/head-judge.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest'
    import { reviewSchema, buildJudgePrompt, clamp01, toHeadReview } from './head-judge.js'
    import type { WorkerResult } from './types.js'

    const workers: WorkerResult[] = [
      { provider: 'claude', model: 'm', ok: true, text: '답A', ms: 1 },
      { provider: 'openai', model: 'm', ok: false, text: '', error: 'x', ms: 0 },
    ]
    describe('head-judge', () => {
      it('프롬프트에 성공답변과 실패표시가 모두 들어간다', () => {
        const p = buildJudgePrompt('질문?', workers)
        expect(p).toContain('답A')
        expect(p).toMatch(/GPT[\s\S]*응답 실패/)
      })
      it('clamp01 은 범위를 0..1 로 조인다', () => {
        expect(clamp01(1.7)).toBe(1); expect(clamp01(-2)).toBe(0); expect(clamp01('x')).toBe(0)
      })
      it('reviewSchema 는 유효 객체를 통과시킨다', () => {
        const ok = reviewSchema.safeParse({ rankings: [{ provider: 'claude', reliability: 0.9, rationale: 'r' }], consensus: '', conflicts: '', finalAnswer: 'F', confidence: 0.8 })
        expect(ok.success).toBe(true)
      })
      it('toHeadReview 는 신뢰도/확신도를 clamp 한다', () => {
        const hr = toHeadReview({ rankings: [{ provider: 'claude', reliability: 5, rationale: 'r' }], consensus: '', conflicts: '', finalAnswer: 'F', confidence: 9 })
        expect(hr.rankings[0].reliability).toBe(1); expect(hr.confidence).toBe(1)
      })
    })
    ```
  - [ ] 2. `pnpm test` → 실패.
  - [ ] 3. 구현 — `src/head-judge.ts`:
    ```ts
    import { z } from 'zod'
    import type { HeadReview, ProviderId, WorkerResult } from './types.js'

    const PROVIDER_LABEL: Record<ProviderId, string> = { claude: 'Claude', openai: 'GPT', gemini: 'Gemini' }

    export const reviewSchema = z.object({
      rankings: z.array(z.object({
        provider: z.enum(['claude', 'openai', 'gemini']),
        reliability: z.number(),
        rationale: z.string(),
      })),
      consensus: z.string(),
      conflicts: z.string(),
      finalAnswer: z.string(),
      confidence: z.number(),
    })
    export type ReviewRaw = z.infer<typeof reviewSchema>

    export function clamp01(n: unknown): number {
      const v = typeof n === 'number' ? n : Number(n)
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
    }
    export function buildJudgePrompt(question: string, workers: WorkerResult[]): string {
      const blocks = workers.map((w) => {
        const label = PROVIDER_LABEL[w.provider]
        return w.ok ? `### ${label} (id=${w.provider})\n${w.text}` : `### ${label} (id=${w.provider})\n[응답 실패: ${w.error ?? '알 수 없음'}]`
      }).join('\n\n')
      return `당신은 여러 AI의 답변을 심사하는 고지능 검토자(Head)입니다.
아래 질문에 세 AI(Claude·GPT·Gemini)가 각각 답했습니다. 각 답변의 사실 정확성·근거·일관성을 비판적으로 평가하고,
신뢰도를 종합해 최종 답변을 만드세요. 확신이 없으면 낮은 confidence 로 정직하게 표기하세요.
rankings 에는 claude·openai·gemini 세 provider 를 모두 포함하세요(실패한 워커는 reliability 0).

[질문]
${question}

[세 AI의 답변]
${blocks}`
    }
    export function toHeadReview(raw: ReviewRaw): HeadReview {
      return {
        rankings: raw.rankings.map((r) => ({ provider: r.provider as ProviderId, reliability: clamp01(r.reliability), rationale: r.rationale })),
        consensus: raw.consensus,
        conflicts: raw.conflicts,
        finalAnswer: raw.finalAnswer,
        confidence: clamp01(raw.confidence),
      }
    }
    ```
  - [ ] 4. `pnpm test` → 통과.
  - [ ] 5. 커밋: `feat(head-judge): 판단 프롬프트·zod 스키마·clamp/정규화(순수)`

---

## Task 6: 판단 Head 호출 (`src/head-judge.ts`에 `judge()` 추가)
- **파일:** 수정 `src/head-judge.ts` (`judge` 추가), 테스트 `src/head-judge.call.test.ts`
- **인터페이스(소비):** `generateText`+`Output.object`(ai) · `headModel()` / **(생산):** `judge(question, workers, deps?): Promise<HeadReview>`
  - `deps.callHead(prompt): Promise<ReviewRaw>` 를 주입 가능(기본은 실제 `generateText`) → 네트워크 없이 테스트.
- **단계:**
  - [ ] 1. 실패 테스트 — `src/head-judge.call.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest'
    import { judge } from './head-judge.js'
    import type { WorkerResult } from './types.js'

    const workers: WorkerResult[] = [{ provider: 'claude', model: 'm', ok: true, text: 'A', ms: 1 }]
    describe('judge', () => {
      it('주입된 callHead 결과를 HeadReview 로 정규화한다', async () => {
        const hr = await judge('q', workers, {
          callHead: async () => ({ rankings: [{ provider: 'claude', reliability: 2, rationale: 'r' }], consensus: 'c', conflicts: '', finalAnswer: 'F', confidence: 0.7 }),
        })
        expect(hr.finalAnswer).toBe('F')
        expect(hr.rankings[0].reliability).toBe(1) // clamp
      })
    })
    ```
  - [ ] 2. `pnpm test` → 실패(`judge` 없음).
  - [ ] 3. 구현 추가 — `src/head-judge.ts` 하단:
    ```ts
    import { generateText, Output } from 'ai'
    import { headModel } from './models.js'
    import { limits, withTimeout } from './config.js'

    export interface JudgeDeps { callHead?: (prompt: string) => Promise<ReviewRaw> }

    async function defaultCallHead(prompt: string): Promise<ReviewRaw> {
      const { output } = await withTimeout(
        generateText({
          model: headModel(),
          output: Output.object({ schema: reviewSchema }),
          prompt,
          maxOutputTokens: Math.max(limits.maxTokens(), 2048),
        }),
        limits.headTimeoutMs(),
        'head',
      )
      return output as ReviewRaw
    }
    export async function judge(question: string, workers: WorkerResult[], deps: JudgeDeps = {}): Promise<HeadReview> {
      const call = deps.callHead ?? defaultCallHead
      const raw = await call(buildJudgePrompt(question, workers))
      return toHeadReview(raw)
    }
    ```
  - [ ] 4. `pnpm test` → 통과.
  - [ ] 5. 커밋: `feat(head-judge): judge() — generateText+Output.object 호출(주입 가능)`

---

## Task 7: 판단 오케스트레이터 (`src/federate.ts`)
- **파일:** 생성 `src/federate.ts`, 테스트 `src/federate.test.ts`
- **인터페이스(소비):** `enabledWorkerSpecs` · `runWorkers` · `judge` / **(생산):** `federate(question, opts?, deps?): Promise<FederationResult>`
  - `deps = { collect?: (q) => Promise<WorkerResult[]>; judge?: typeof judge }` 주입 가능.
- **단계:**
  - [ ] 1. 실패 테스트 — `src/federate.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest'
    import { federate } from './federate.js'
    import type { WorkerResult } from './types.js'

    const ok: WorkerResult[] = [{ provider: 'claude', model: 'm', ok: true, text: 'A', ms: 1 }]
    const allFail: WorkerResult[] = [{ provider: 'claude', model: 'm', ok: false, text: '', error: 'x', ms: 0 }]

    describe('federate', () => {
      it('워커 성공 시 Head 를 호출해 결과를 담는다', async () => {
        const r = await federate('q', {}, {
          collect: async () => ok,
          judge: async () => ({ rankings: [], consensus: '', conflicts: '', finalAnswer: 'F', confidence: 0.5 }),
        })
        expect(r.head?.finalAnswer).toBe('F')
        expect(r.headError).toBeUndefined()
      })
      it('워커 전부 실패면 Head 스킵 + headError', async () => {
        const r = await federate('q', {}, { collect: async () => allFail, judge: async () => { throw new Error('should not run') } })
        expect(r.head).toBeNull()
        expect(r.headError).toMatch(/모든 워커/)
      })
      it('Head 실패는 headError 로 담고 워커는 보존', async () => {
        const r = await federate('q', {}, { collect: async () => ok, judge: async () => { throw new Error('head down') } })
        expect(r.head).toBeNull(); expect(r.headError).toBe('head down'); expect(r.workers).toHaveLength(1)
      })
    })
    ```
  - [ ] 2. `pnpm test` → 실패.
  - [ ] 3. 구현 — `src/federate.ts`:
    ```ts
    import { enabledWorkerSpecs } from './models.js'
    import { runWorkers } from './engine.js'
    import { judge as realJudge } from './head-judge.js'
    import { limits } from './config.js'
    import { generateText } from 'ai'
    import type { FederationResult, HeadReview, WorkerResult } from './types.js'

    export interface FederateDeps {
      collect?: (question: string) => Promise<WorkerResult[]>
      judge?: (question: string, workers: WorkerResult[]) => Promise<HeadReview>
    }
    async function defaultCollect(question: string): Promise<WorkerResult[]> {
      const specs = enabledWorkerSpecs()
      return runWorkers(
        specs.map((s) => ({
          provider: s.provider, model: s.model,
          run: async (signal: AbortSignal) => {
            const { text } = await generateText({ model: s.build(), prompt: question, maxOutputTokens: limits.maxTokens(), abortSignal: signal })
            return text
          },
        })),
        limits.workerTimeoutMs(),
      )
    }
    export async function federate(question: string, _opts: Record<string, never> = {}, deps: FederateDeps = {}): Promise<FederationResult> {
      const started = Date.now()
      const collect = deps.collect ?? defaultCollect
      const judge = deps.judge ?? realJudge
      const workers = await collect(question)

      let head: HeadReview | null = null
      let headError: string | undefined
      if (workers.some((w) => w.ok)) {
        try { head = await judge(question, workers) }
        catch (e) { headError = e instanceof Error ? e.message : String(e) }
      } else {
        headError = '모든 워커가 실패해 Head 검토를 건너뜀'
      }
      return { question, workers, head, headError, ms: Date.now() - started }
    }
    ```
  - [ ] 4. `pnpm test` → 통과.
  - [ ] 5. 커밋: `feat(federate): 판단 모드 오케스트레이터(워커 병렬→Head, graceful)`

---

## Task 8: 생성 Head + 앙상블 (`src/head-synth.ts` · `src/ensemble.ts`)
- **파일:** 생성 `src/head-synth.ts`(순수 프롬프트 빌더 + synthesize), `src/ensemble.ts`, 테스트 `src/ensemble.test.ts`
- **인터페이스(생산):** `buildSynthesisPrompt(prompt, drafts)` · `ensemble(opts, deps?): Promise<EnsembleResult>`
  - `opts = { system; prompt; tier: EnsembleTier; maxTokens? }`
  - `deps = { collect?; synth?; single? }` 주입 가능.
- **핵심 분기:** `single`→단일 Haiku / `consensus`→fast 첫 초안(Head 스킵) / `head`→Opus 종합. fast 전부 실패→단일 폴백(degraded). Head 실패→최장 초안(degraded).
- **단계:**
  - [ ] 1. 실패 테스트 — `src/ensemble.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest'
    import { ensemble } from './ensemble.js'
    import type { WorkerResult } from './types.js'

    const two: WorkerResult[] = [
      { provider: 'claude', model: 'm', ok: true, text: '짧다', ms: 1 },
      { provider: 'openai', model: 'm', ok: true, text: '더 긴 초안입니다', ms: 1 },
    ]
    describe('ensemble', () => {
      it('head tier: synth 결과를 반환하고 headUsed=true', async () => {
        const r = await ensemble({ system: 's', prompt: 'p', tier: 'head' }, { collect: async () => two, synth: async () => '종합본' })
        expect(r).toMatchObject({ text: '종합본', tier: 'head', headUsed: true, degraded: false })
        expect(r.fastModels).toEqual(['claude', 'openai'])
      })
      it('consensus tier: Head 스킵, 첫 초안', async () => {
        const r = await ensemble({ system: 's', prompt: 'p', tier: 'consensus' }, { collect: async () => two, synth: async () => '안불림' })
        expect(r).toMatchObject({ text: '짧다', tier: 'consensus', headUsed: false })
      })
      it('fast 전부 실패: 단일 폴백 + degraded', async () => {
        const r = await ensemble({ system: 's', prompt: 'p', tier: 'head' }, { collect: async () => [], single: async () => '폴백', synth: async () => 'x' })
        expect(r).toMatchObject({ text: '폴백', headUsed: false, degraded: true, fastModels: [] })
      })
      it('Head 실패: 최장 초안 반환 + degraded', async () => {
        const r = await ensemble({ system: 's', prompt: 'p', tier: 'head' }, { collect: async () => two, synth: async () => { throw new Error('down') } })
        expect(r).toMatchObject({ text: '더 긴 초안입니다', headUsed: false, degraded: true })
      })
    })
    ```
  - [ ] 2. `pnpm test` → 실패.
  - [ ] 3. 구현 — `src/head-synth.ts`:
    ```ts
    import { generateText } from 'ai'
    import { headModel } from './models.js'
    import { limits, withTimeout } from './config.js'
    import type { WorkerResult } from './types.js'

    export const HEAD_SYNTHESIS_GUIDE = `

# 종합 지침 (Head)
당신은 위 역할에 더해, 동일 작업에 대한 여러 AI 초안을 고차원적으로 종합하는 최종 Head 전문가다.
- 각 초안의 강점을 취하고 오류·누락·중복을 보정해 하나의 최종 결과물을 만든다.
- 위 작업 규칙을 그대로 지킨다. 초안에 없는 사실을 새로 지어내지 않는다.
- 라벨·머리말 없이 본문만 출력한다.`

    export function buildSynthesisPrompt(userPrompt: string, drafts: WorkerResult[]): string {
      const blocks = drafts.map((d, i) => `--- 초안 ${String.fromCharCode(65 + i)} ---\n${d.text}`).join('\n\n')
      return `[작업]\n${userPrompt}\n\n[${drafts.length}개 AI 초안]\n${blocks}\n\n위 초안들을 종합해 하나의 최종 결과물을 작성하라.`
    }
    export async function synthesize(system: string, prompt: string, drafts: WorkerResult[], maxTokens: number): Promise<string> {
      const { text } = await withTimeout(
        generateText({ model: headModel(), system: system + HEAD_SYNTHESIS_GUIDE, prompt: buildSynthesisPrompt(prompt, drafts), maxOutputTokens: maxTokens }),
        limits.headTimeoutMs(), 'head',
      )
      return text.trim()
    }
    ```
    구현 — `src/ensemble.ts`:
    ```ts
    import { generateText } from 'ai'
    import { anthropic } from '@ai-sdk/anthropic'
    import { enabledWorkerSpecs } from './models.js'
    import { runWorkers } from './engine.js'
    import { synthesize } from './head-synth.js'
    import { models, limits } from './config.js'
    import type { EnsembleResult, EnsembleTier, WorkerResult } from './types.js'

    export interface EnsembleOpts { system: string; prompt: string; tier: EnsembleTier; maxTokens?: number }
    export interface EnsembleDeps {
      collect?: (o: EnsembleOpts) => Promise<WorkerResult[]>
      synth?: (system: string, prompt: string, drafts: WorkerResult[], maxTokens: number) => Promise<string>
      single?: (o: EnsembleOpts) => Promise<string>
    }
    async function defaultCollect(o: EnsembleOpts): Promise<WorkerResult[]> {
      const specs = enabledWorkerSpecs()
      const res = await runWorkers(
        specs.map((s) => ({ provider: s.provider, model: s.model, run: async (signal: AbortSignal) => {
          const { text } = await generateText({ model: s.build(), system: o.system, prompt: o.prompt, maxOutputTokens: o.maxTokens ?? limits.maxTokens(), abortSignal: signal })
          return text
        } })), limits.workerTimeoutMs(),
      )
      return res.filter((r) => r.ok)
    }
    async function defaultSingle(o: EnsembleOpts): Promise<string> {
      const { text } = await generateText({ model: anthropic(models.claudeWorker()), system: o.system, prompt: o.prompt, maxOutputTokens: o.maxTokens ?? limits.maxTokens() })
      return text.trim()
    }
    export async function ensemble(opts: EnsembleOpts, deps: EnsembleDeps = {}): Promise<EnsembleResult> {
      const collect = deps.collect ?? defaultCollect
      const synth = deps.synth ?? synthesize
      const single = deps.single ?? defaultSingle
      const maxTok = opts.maxTokens ?? limits.maxTokens()

      if (opts.tier === 'single') {
        return { text: await single(opts), tier: 'single', fastModels: ['claude'], headUsed: false, degraded: false }
      }
      const drafts = await collect(opts)
      if (drafts.length === 0) {
        return { text: await single(opts), tier: opts.tier, fastModels: [], headUsed: false, degraded: true }
      }
      const fastModels = drafts.map((d) => d.provider)
      if (opts.tier === 'consensus') {
        return { text: drafts[0].text, tier: 'consensus', fastModels, headUsed: false, degraded: false }
      }
      try {
        const text = await synth(opts.system, opts.prompt, drafts, maxTok)
        return { text, tier: 'head', fastModels, headUsed: true, degraded: false }
      } catch {
        const best = drafts.reduce((a, b) => (b.text.length > a.text.length ? b : a))
        return { text: best.text, tier: 'head', fastModels, headUsed: false, degraded: true }
      }
    }
    ```
  - [ ] 4. `pnpm test` → 통과.
  - [ ] 5. 커밋: `feat(ensemble): 생성 모드(tier head/consensus/single) + graceful 폴백`

---

## Task 9: 공개 배럴 (`src/index.ts`)
- **파일:** 수정 `src/index.ts`, 테스트 `src/index.test.ts`
- **단계:**
  - [ ] 1. 실패 테스트 — `src/index.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest'
    import * as api from './index.js'
    it('공개 API 를 노출한다', () => {
      expect(typeof api.federate).toBe('function')
      expect(typeof api.ensemble).toBe('function')
      expect(api.PROVIDER_IDS).toEqual(['claude', 'openai', 'gemini'])
    })
    ```
  - [ ] 2. `pnpm test` → 실패.
  - [ ] 3. 구현 — `src/index.ts`:
    ```ts
    export { federate } from './federate.js'
    export { ensemble } from './ensemble.js'
    export { synthesize } from './head-synth.js'
    export { judge } from './head-judge.js'
    export { PROVIDER_IDS } from './types.js'
    export type { ProviderId, WorkerResult, HeadReview, ReliabilityJudgment, FederationResult, EnsembleResult, EnsembleTier } from './types.js'
    export { missingKeys } from './config.js'
    ```
  - [ ] 4. `pnpm test` + `pnpm typecheck` → 통과 / 0 error.
  - [ ] 5. 커밋: `feat(api): 공개 배럴 export(federate·ensemble·타입)`

---

## Task 10: CLI (`src/cli.ts`)
- **파일:** 생성 `src/cli.ts`, 테스트 `src/cli-format.test.ts`(출력 포매터만 순수 테스트)
- **인터페이스(생산):** `formatFederation(r): string` · CLI 엔트리(`ask <질문>` = ensemble/head 스트림 대신 텍스트, `judge <질문>` = federate)
- **단계:**
  - [ ] 1. 실패 테스트 — `src/cli-format.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest'
    import { formatFederation } from './cli.js'
    import type { FederationResult } from './types.js'
    it('판단 결과를 사람이 읽는 문자열로 만든다', () => {
      const r: FederationResult = { question: 'q', workers: [{ provider: 'claude', model: 'm', ok: true, text: 'A', ms: 5 }], head: { rankings: [{ provider: 'claude', reliability: 0.9, rationale: 'r' }], consensus: 'c', conflicts: '', finalAnswer: '최종', confidence: 0.8 }, ms: 10 }
      const s = formatFederation(r)
      expect(s).toContain('최종'); expect(s).toContain('0.8')
    })
    ```
  - [ ] 2. `pnpm test` → 실패.
  - [ ] 3. 구현 — `src/cli.ts` (`formatFederation` export + `main()`가 `process.argv` 파싱: `ask`→`ensemble({tier:'head'})` 출력, `judge`→`federate` 후 `formatFederation`; `missingKeys()` 있으면 안내 후 종료). `import.meta.url` 엔트리가드로 `main()` 실행.
  - [ ] 4. `pnpm test` → 통과.
  - [ ] 5. 커밋: `feat(cli): ask/judge 커맨드 + 판단 결과 포매터`

---

## Task 11: eval 하네스 (`src/eval/`)
- **파일:** 생성 `src/eval/dataset.ts`(질문+기대핵심 케이스, Veris eval/dataset 이식·정리) · `src/eval/run.ts`(각 케이스 federate → confidence·정답포함 집계 출력) · 테스트 `src/eval/grade.test.ts`
- **단계:**
  - [ ] 1. 실패 테스트 — `src/eval/grade.test.ts`: `gradeContains(answer, expectedKeywords)` 가 키워드 포함율을 0..1 로 반환하는지.
  - [ ] 2. `pnpm test` → 실패.
  - [ ] 3. 구현 — `grade.ts`(`gradeContains`) + `dataset.ts`(케이스 5개 내외) + `run.ts`(federate 호출·집계, 네트워크). run.ts 는 테스트 대상 아님(통합).
  - [ ] 4. `pnpm test` → 통과.
  - [ ] 5. 커밋: `feat(eval): 채점 유틸 + 평가셋 + 실행 하네스`

---

## Task 12: 통합 구동 검증 (수용 기준 §7) — 네트워크
- **파일:** 없음(실행/문서). `.env.local` 에 실제 키(최소 Anthropic+OpenAI).
- **단계:**
  - [ ] 1. `cp .env.example .env.local` → 키 입력(오너가 직접).
  - [ ] 2. `pnpm judge "2024 노벨 물리학상 수상자는?"` → `formatFederation` 출력에 finalAnswer·confidence·워커별 신뢰도 표시 확인.
  - [ ] 3. `pnpm ask "면역항암제 작용기전을 3문장으로"` → 종합 텍스트 출력 확인.
  - [ ] 4. 저하 케이스: `GOOGLE_API_KEY`/`GEMINI_API_KEY` 미설정 상태로 재실행 → gemini 제외 2워커로 정상 동작(degraded 반영).
  - [ ] 5. `pnpm eval` → 케이스별 confidence·점수 집계 출력.
  - [ ] 6. `pnpm typecheck && pnpm test` → 0 error / 전체 통과.
  - [ ] 7. 커밋: `test: 통합 구동 검증(judge·ask·eval·저하 케이스) 결과 기록(README)`

---

## Task 13: 배포 + 타 repo 설치 스모크
- **단계:**
  - [ ] 1. GitHub 비공개 repo `lierline/ai-federation` 생성(오너 승인) → `git remote add origin ... && git push -u origin main`.
  - [ ] 2. 임시 폴더에서 `npm i github:lierline/ai-federation` → `import { federate } from '@lierline/ai-federation'` 스모크(타입 해석·import 성공).
  - [ ] 3. README 에 설치·env·API 사용례 정리.
  - [ ] 4. 커밋/푸시.

---

## 파일럿 통합(후속 계획, 별도 세션) — **Login 필수 포함**
- Login·Q-Atelier·Veris 각 `package.json` 에 git dependency 추가 → 기존 AI 진입점 1곳을 `federate`/`ensemble` 로 교체하는 최소 슬라이스부터.
- Q-Atelier 는 기존 `lib/ai/head-ensemble.ts` 를 패키지 `ensemble` 로 점진 대체(어댑터 우선, 8개 라우트 일괄 금지).
- 통합 순서는 v1 코어(Task 0~13) 완료 후 별도 brainstorming → writing-plans.

## 셀프 리뷰 체크
- 스펙 커버리지: 병렬엔진(T4)·생성(T8)·판단+확신도(T5~7)·graceful(T4/7/8)·최신모델(T2)·CLI(T10)·eval(T11)·설치스모크(T13)·Login파일럿(하단) 전부 매핑됨. verify·grounded 는 v1 제외(스펙 일치).
- 플레이스홀더: 없음(모든 태스크 파일경로·코드·명령 구체).
- 타입 일관성: `WorkerResult`/`HeadReview`/`EnsembleResult` 시그니처가 T1 정의와 T4~10 사용처에서 동일. `judge`/`ensemble` deps 주입 시그니처 일치.
