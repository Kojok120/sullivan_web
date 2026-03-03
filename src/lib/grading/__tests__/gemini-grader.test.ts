import { describe, expect, it } from 'vitest';

import { validateGradingResponse } from '@/lib/grading/gemini-grader';
import type { ProblemForGrading } from '@/lib/grading/types';

const problems: ProblemForGrading[] = [
    {
        id: 'p1',
        customId: 'A-1',
        question: 'q1',
        answer: 'a1',
        acceptedAnswers: [],
        coreProblems: [{ id: 'cp1', name: 'cp1' }],
    },
    {
        id: 'p2',
        customId: 'A-2',
        question: 'q2',
        answer: 'a2',
        acceptedAnswers: [],
        coreProblems: [{ id: 'cp2', name: 'cp2' }],
    },
];

describe('validateGradingResponse', () => {
    it('problemIndex重複をエラーにする', () => {
        const result = validateGradingResponse(
            [
                { problemIndex: 0, evaluation: 'A', studentAnswer: 'x', feedback: 'ok' },
                { problemIndex: 0, evaluation: 'B', studentAnswer: 'y', feedback: 'ok' },
            ],
            problems,
            'u1',
        );

        expect(result.isValid).toBe(false);
        expect(result.errors.some((error) => error.includes('Duplicate problemIndex: 0'))).toBe(true);
    });

    it('problemIndex欠落をエラーにする', () => {
        const result = validateGradingResponse(
            [{ problemIndex: 0, evaluation: 'A', studentAnswer: 'x', feedback: 'ok' }],
            problems,
            'u1',
        );

        expect(result.isValid).toBe(false);
        expect(result.errors.some((error) => error.includes('Missing problemIndex: 1'))).toBe(true);
    });

    it('正常レスポンスをproblemId付き結果へ変換する', () => {
        const result = validateGradingResponse(
            [
                { problemIndex: 1, evaluation: 'B', studentAnswer: 'ans2', feedback: 'fb2' },
                { problemIndex: 0, evaluation: 'C', studentAnswer: 'ans1', feedback: 'fb1' },
            ],
            problems,
            'u1',
        );

        expect(result.isValid).toBe(true);
        expect(result.validatedResults).toHaveLength(2);
        expect(result.validatedResults[0]).toMatchObject({ studentId: 'u1', problemId: 'p2', evaluation: 'B' });
        expect(result.validatedResults[1]).toMatchObject({ studentId: 'u1', problemId: 'p1', evaluation: 'C' });
    });
});
