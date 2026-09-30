type Level = 'LOW' | 'MEDIUM' | 'HIGH';
interface Case {
    caseId: string;
    title: string;
    market: string;
    target: string;
    product: Record<string, unknown>;
    beforeKey?: string;
    afterKey?: string;
    subTypes?: string[];
    reasons?: string[];
    actualRiskLevel: Level;
}
export declare function casePrompt(c: Case): string;
export declare function parseLevel(text: string): Level | null;
export {};
//# sourceMappingURL=models-eval.d.ts.map