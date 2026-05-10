import { describe, expect, it } from 'vitest';

import {
    buildGeminiGradingContents,
    buildProblemContextForGemini,
    buildSubjectSpecificGuidelines,
    validateGradingResponse,
    type ProblemForGrading,
} from '@/lib/grading-service';

function createProblem(overrides: Partial<ProblemForGrading> = {}): ProblemForGrading {
    return {
        id: 'problem-1',
        customId: 'S-1',
        subjectName: '数学',
        question: 'legacy question',
        answer: '42',
        acceptedAnswers: ['四十二'],
        contentFormat: 'PLAIN_TEXT',
        publishedRevisionId: 'revision-1',
        structuredContent: null,
        revisionAssets: [],
        coreProblems: [],
        ...overrides,
    };
}

describe('grading-service helpers', () => {
    it('structured 問題: 問題文は structuredContent から、正解は Problem.answer から組み立てる', () => {
        // publish 時に ProblemRevision.correctAnswer は Problem.answer に同期されているため
        // 採点側は Problem.answer / acceptedAnswers のみを正解の信頼源として扱う。
        const context = buildProblemContextForGemini(createProblem({
            subjectName: '理科',
            contentFormat: 'STRUCTURED_V1',
            answer: 'B',
            acceptedAnswers: ['18'],
            structuredContent: {
                version: 1,
                summary: '作図問題',
                instructions: '図を見て答えなさい。',
                blocks: [
                    { id: 'p1', type: 'paragraph', text: '三角形の面積を答えなさい。' },
                    { id: 'c1', type: 'choices', options: [{ id: 'A', label: '12' }, { id: 'B', label: '18' }] },
                    { id: 'g1', type: 'image', assetId: 'asset-graph' },
                ],
            },
            revisionAssets: [{
                id: 'asset-graph',
                fileName: 'graph.png',
                mimeType: 'image/png',
                storageKey: 'problems/x/y/graph.png',
            }],
        }), 0);

        expect(context).toMatchObject({
            index: 0,
            displayId: 'S-1',
            subjectName: '理科',
            referenceAnswer: 'B',
            alternativeAnswers: ['18'],
            hasReferenceFigures: true,
        });
        expect(context.problemText).toContain('概要: 作図問題');
        expect(context.problemText).toContain('選択肢:');
    });

    it('structured 問題: figure 取得は contentFormat ではなく structuredContent の有無で判定する', () => {
        // 段階A+ で contentFormat 判定を撤廃したことの回帰を防ぐ。
        const context = buildProblemContextForGemini(createProblem({
            contentFormat: 'PLAIN_TEXT',
            structuredContent: {
                version: 1,
                blocks: [{ id: 'g1', type: 'image', assetId: 'asset-graph' }],
            },
            revisionAssets: [{
                id: 'asset-graph',
                fileName: 'graph.png',
                mimeType: 'image/png',
                storageKey: 'problems/x/y/graph.png',
            }],
        }), 0);

        expect(context.hasReferenceFigures).toBe(true);
    });

    it('Gemini contents に答案と参考図版を含める', () => {
        const contents = buildGeminiGradingContents({
            gradingPrompt: 'prompt',
            answerSheet: {
                base64Data: 'sheet-data',
                mimeType: 'application/pdf',
                isPdfHeader: true,
            },
            referenceFigures: [{
                problemIndex: 1,
                problemId: 'problem-2',
                fileName: 'figure.png',
                mimeType: 'image/png',
                base64Data: 'figure-data',
            }],
        });

        expect(contents).toEqual([
            { text: 'prompt' },
            { inlineData: { data: 'sheet-data', mimeType: 'application/pdf' } },
            { text: '参考図版 problemIndex=1 problemId=problem-2 fileName=figure.png' },
            { inlineData: { data: 'figure-data', mimeType: 'image/png' } },
        ]);
    });

    it('AI の採点結果を評価ベースで正規化する', () => {
        const validation = validateGradingResponse([
            {
                problemIndex: 0,
                studentAnswer: '18',
                evaluation: 'A',
                confidence: 1.2,
                reason: '正答と一致',
                feedback: '正解です。',
            },
        ], [
            createProblem(),
        ], 'student-1');

        expect(validation.isValid).toBe(true);
        expect(validation.validatedResults[0]).toMatchObject({
            studentId: 'student-1',
            problemId: 'problem-1',
            confidence: 1,
            reason: '正答と一致',
            evaluation: 'A',
        });
    });

    it('数学の問題が含まれるバッチでは数学の採点指針を差し込む', () => {
        const guidelines = buildSubjectSpecificGuidelines([
            createProblem({ subjectName: '中学数学' }),
            createProblem({ subjectName: '英語' }),
        ]);

        expect(guidelines).toContain('数学の採点指針');
        expect(guidelines).not.toContain('理科の採点指針');
    });

    it('数学と理科の両方が含まれる場合は両方のガイドラインを連結する', () => {
        const guidelines = buildSubjectSpecificGuidelines([
            createProblem({ subjectName: '中1理科' }),
            createProblem({ subjectName: '中3数学' }),
        ]);

        expect(guidelines).toContain('数学の採点指針');
        expect(guidelines).toContain('理科の採点指針');
    });

    it('該当教科がない場合は空文字を返す', () => {
        const guidelines = buildSubjectSpecificGuidelines([
            createProblem({ subjectName: '英語' }),
            createProblem({ subjectName: '国語' }),
        ]);

        expect(guidelines).toBe('');
    });

    it('confidence が欠けている結果は不正として扱う', () => {
        const validation = validateGradingResponse([
            {
                problemIndex: 0,
                studentAnswer: '18',
                evaluation: 'A',
                reason: '正答と一致',
                feedback: '正解です。',
            },
        ], [
            createProblem(),
        ], 'student-1');

        expect(validation.isValid).toBe(false);
        expect(validation.errors).toContain('Invalid confidence for index 0');
    });
});
