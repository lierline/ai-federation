import { z } from 'zod';
import type { HeadReview, WorkerResult } from './types.js';
export declare const reviewSchema: z.ZodObject<{
    rankings: z.ZodArray<z.ZodObject<{
        provider: z.ZodEnum<{
            claude: "claude";
            openai: "openai";
            gemini: "gemini";
        }>;
        reliability: z.ZodNumber;
        rationale: z.ZodString;
    }, z.core.$strip>>;
    consensus: z.ZodString;
    conflicts: z.ZodString;
    finalAnswer: z.ZodString;
    confidence: z.ZodNumber;
}, z.core.$strip>;
export type ReviewRaw = z.infer<typeof reviewSchema>;
export declare function clamp01(n: unknown): number;
export declare function buildJudgePrompt(question: string, workers: WorkerResult[]): string;
export declare function toHeadReview(raw: ReviewRaw): HeadReview;
export interface JudgeDeps {
    /** 주입 가능한 Head 호출(기본은 실제 generateText+Output.object). 네트워크 없이 테스트하려면 대체. */
    callHead?: (prompt: string) => Promise<ReviewRaw>;
}
/** 판단 Head — 세 답변의 신뢰도를 재평가하고 종합 최종 답변을 낸다(구조화 출력으로 파싱 실패 없음). */
export declare function judge(question: string, workers: WorkerResult[], deps?: JudgeDeps): Promise<HeadReview>;
//# sourceMappingURL=head-judge.d.ts.map