import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    requireAdminMock,
    requireProblemAuthorMock,
    coreProblemFindManyMock,
    problemFindManyMock,
    problemFindFirstMock,
    subjectFindUniqueMock,
    transactionMock,
    bulkUpsertProblemsCoreMock,
    deleteProblemsWithRelationsMock,
    revalidatePathMock,
    isStructuredProblemsEnabledMock,
    getNextCustomIdMock,
    parseStructuredDocumentMock,
    parseAnswerSpecMock,
    parsePrintConfigMock,
    parseGradingConfigMock,
    deriveLegacyFieldsFromStructuredDataMock,
    txProblemCreateMock,
    txProblemUpdateMock,
    txProblemRevisionFindFirstMock,
    txProblemRevisionUpdateMock,
    txProblemRevisionCreateMock,
} = vi.hoisted(() => ({
    requireAdminMock: vi.fn(),
    requireProblemAuthorMock: vi.fn(),
    coreProblemFindManyMock: vi.fn(),
    problemFindManyMock: vi.fn(),
    problemFindFirstMock: vi.fn(),
    subjectFindUniqueMock: vi.fn(),
    transactionMock: vi.fn(),
    bulkUpsertProblemsCoreMock: vi.fn(),
    deleteProblemsWithRelationsMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    isStructuredProblemsEnabledMock: vi.fn(),
    getNextCustomIdMock: vi.fn(),
    parseStructuredDocumentMock: vi.fn(),
    parseAnswerSpecMock: vi.fn(),
    parsePrintConfigMock: vi.fn(),
    parseGradingConfigMock: vi.fn(),
    deriveLegacyFieldsFromStructuredDataMock: vi.fn(),
    txProblemCreateMock: vi.fn(),
    txProblemUpdateMock: vi.fn(),
    txProblemRevisionFindFirstMock: vi.fn(),
    txProblemRevisionUpdateMock: vi.fn(),
    txProblemRevisionCreateMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    requireAdmin: requireAdminMock,
    requireProblemAuthor: requireProblemAuthorMock,
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        coreProblem: {
            findMany: coreProblemFindManyMock,
        },
        problem: {
            findMany: problemFindManyMock,
            findFirst: problemFindFirstMock,
        },
        subject: {
            findUnique: subjectFindUniqueMock,
        },
        $transaction: transactionMock,
    },
}));

vi.mock('@/lib/problem-service', () => ({
    deleteProblemsWithRelations: deleteProblemsWithRelationsMock,
    bulkUpsertProblemsCore: bulkUpsertProblemsCoreMock,
    createProblemCore: vi.fn(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: revalidatePathMock,
}));

vi.mock('@/lib/problem-figure-generation', () => ({
    generateProblemFigureScene: vi.fn(),
}));

vi.mock('@/lib/problem-figure-scene', () => ({
    figureGenerationTargetSchema: {
        safeParse: vi.fn(),
    },
    isAiFigureGenerationSupported: vi.fn(),
}));

vi.mock('@/lib/curriculum-service', () => ({
    getNextCustomId: getNextCustomIdMock,
}));

vi.mock('@/lib/feature-flags', () => ({
    isStructuredProblemsEnabled: isStructuredProblemsEnabledMock,
}));

vi.mock('@/lib/structured-problem', () => ({
    buildDefaultStructuredDraft: vi.fn(),
    deriveLegacyFieldsFromStructuredData: deriveLegacyFieldsFromStructuredDataMock,
    parseAnswerSpec: parseAnswerSpecMock,
    parseGradingConfig: parseGradingConfigMock,
    parsePrintConfig: parsePrintConfigMock,
    parseStructuredDocument: parseStructuredDocumentMock,
}));

vi.mock('@/lib/problem-assets', () => ({
    createProblemAssetSignedUrl: vi.fn(),
    removeProblemAssetFromStorage: vi.fn(),
    uploadProblemAssetToStorage: vi.fn(),
}));

vi.mock('@/lib/problem-grading', () => ({
    gradeStructuredAnswer: vi.fn(),
}));

vi.mock('@/lib/problem-svg', () => ({
    ensureRenderableSvgMarkup: vi.fn(),
}));

import {
    bulkSearchCoreProblems,
    bulkUpsertStandaloneProblems,
    createProblemDraft,
    deleteStandaloneProblem,
    searchProblemsByMasterNumbers,
} from './actions';

describe('problem actions permissions', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        requireAdminMock.mockResolvedValue(undefined);
        requireProblemAuthorMock.mockResolvedValue({
            userId: 'author-1',
            role: 'MATERIAL_AUTHOR',
            name: 'Author',
        });
        isStructuredProblemsEnabledMock.mockReturnValue(true);
        getNextCustomIdMock.mockResolvedValue('E-1001');
        parseStructuredDocumentMock.mockImplementation((value) => value);
        parseAnswerSpecMock.mockImplementation((value) => value);
        parsePrintConfigMock.mockImplementation((value) => value);
        parseGradingConfigMock.mockImplementation((value) => value);
        deriveLegacyFieldsFromStructuredDataMock.mockReturnValue({
            question: '構造化問題',
            answer: '答え',
            acceptedAnswers: [],
        });
        transactionMock.mockImplementation(async (callback: (tx: {
            problem: {
                create: typeof txProblemCreateMock;
                update: typeof txProblemUpdateMock;
            };
            problemRevision: {
                findFirst: typeof txProblemRevisionFindFirstMock;
                update: typeof txProblemRevisionUpdateMock;
                create: typeof txProblemRevisionCreateMock;
            };
        }) => Promise<unknown>) => callback({
            problem: {
                create: txProblemCreateMock,
                update: txProblemUpdateMock,
            },
            problemRevision: {
                findFirst: txProblemRevisionFindFirstMock,
                update: txProblemRevisionUpdateMock,
                create: txProblemRevisionCreateMock,
            },
        }));
    });

    it('bulkSearchCoreProblems は problem author 権限で実行できる', async () => {
        coreProblemFindManyMock.mockResolvedValueOnce([
            {
                id: 'core-1',
                name: '現在完了',
                subjectId: 'subject-english',
                subject: { name: '英語', order: 1 },
            },
        ]);

        const result = await bulkSearchCoreProblems(['現在完了']);

        expect(requireProblemAuthorMock).toHaveBeenCalledOnce();
        expect(requireAdminMock).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: true,
            coreProblemsMap: {
                '現在完了': {
                    id: 'core-1',
                    name: '現在完了',
                    subjectId: 'subject-english',
                    subject: { name: '英語', order: 1 },
                },
            },
        });
    });

    it('searchProblemsByMasterNumbers は problem author 権限で実行できる', async () => {
        const problems = [
            {
                id: 'problem-1',
                subjectId: 'subject-english',
                masterNumber: 1001,
            },
        ];
        problemFindManyMock.mockResolvedValueOnce(problems);

        const result = await searchProblemsByMasterNumbers([
            { subjectId: 'subject-english', masterNumber: 1001 },
        ]);

        expect(requireProblemAuthorMock).toHaveBeenCalledOnce();
        expect(requireAdminMock).not.toHaveBeenCalled();
        expect(problemFindManyMock).toHaveBeenCalledWith({
            where: {
                OR: [
                    {
                        subjectId: 'subject-english',
                        masterNumber: 1001,
                    },
                ],
            },
            include: expect.any(Object),
        });
        expect(result).toEqual({ success: true, problems });
    });

    it('bulkUpsertStandaloneProblems は problem author 権限で実行できる', async () => {
        bulkUpsertProblemsCoreMock.mockResolvedValueOnce({
            createdCount: 1,
            updatedCount: 2,
            warnings: ['warning'],
        });

        const result = await bulkUpsertStandaloneProblems([
            {
                question: '問題文',
                answer: '答え',
                coreProblemIds: ['core-1'],
            },
        ], { subjectId: 'subject-english' });

        expect(requireProblemAuthorMock).toHaveBeenCalledOnce();
        expect(requireAdminMock).not.toHaveBeenCalled();
        expect(bulkUpsertProblemsCoreMock).toHaveBeenCalledWith([
            {
                question: '問題文',
                answer: '答え',
                coreProblemIds: ['core-1'],
            },
        ], {
            batchSize: 50,
            assignOrder: false,
            subjectId: 'subject-english',
        });
        expect(revalidatePathMock).toHaveBeenCalledWith('/admin/problems');
        expect(revalidatePathMock).toHaveBeenCalledWith('/materials/problems');
        expect(result).toEqual({
            success: true,
            createdCount: 1,
            updatedCount: 2,
            warnings: ['warning'],
        });
    });

    it('createProblemDraft は新規作成時に masterNumber を設定しない', async () => {
        coreProblemFindManyMock.mockResolvedValueOnce([
            { id: 'core-1', subjectId: 'subject-english' },
        ]);
        subjectFindUniqueMock.mockResolvedValueOnce({ name: '英語' });
        problemFindFirstMock.mockResolvedValueOnce({ order: 12 });
        txProblemCreateMock.mockResolvedValueOnce({ id: 'problem-1' });
        txProblemRevisionFindFirstMock
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ revisionNumber: 0 });
        txProblemRevisionCreateMock.mockResolvedValueOnce({ id: 'revision-1' });

        const result = await createProblemDraft({
            problemType: 'SHORT_TEXT',
            grade: '中1',
            videoUrl: 'https://example.com/video',
            coreProblemIds: ['core-1'],
            document: { blocks: [] },
            answerSpec: { kind: 'exact' },
            printConfig: {},
            gradingConfig: { mode: 'EXACT', maxScore: 100 },
        });

        expect(txProblemCreateMock).toHaveBeenCalledOnce();
        expect(txProblemCreateMock.mock.calls[0][0].data).not.toHaveProperty('masterNumber');
        expect(result).toEqual({ success: true, problemId: 'problem-1', revisionId: 'revision-1' });
    });

    it('createProblemDraft は英語の既存問題編集で masterNumber を保持する', async () => {
        coreProblemFindManyMock.mockResolvedValueOnce([
            { id: 'core-1', subjectId: 'subject-english' },
        ]);
        subjectFindUniqueMock.mockResolvedValueOnce({ name: '英語' });
        txProblemUpdateMock.mockResolvedValueOnce({ id: 'problem-1' });
        txProblemRevisionFindFirstMock.mockResolvedValueOnce({ id: 'draft-1' });
        txProblemRevisionUpdateMock.mockResolvedValueOnce({ id: 'draft-1' });

        const result = await createProblemDraft({
            problemId: 'problem-1',
            problemType: 'SHORT_TEXT',
            grade: '中1',
            coreProblemIds: ['core-1'],
            document: { blocks: [] },
            answerSpec: { kind: 'exact' },
            printConfig: {},
            gradingConfig: { mode: 'EXACT', maxScore: 100 },
        });

        expect(txProblemUpdateMock).toHaveBeenCalledOnce();
        expect(txProblemUpdateMock.mock.calls[0][0].data).not.toHaveProperty('masterNumber');
        expect(result).toEqual({ success: true, problemId: 'problem-1', revisionId: 'draft-1' });
    });

    it('createProblemDraft は数学の既存問題編集で masterNumber をクリアする', async () => {
        coreProblemFindManyMock.mockResolvedValueOnce([
            { id: 'core-1', subjectId: 'subject-math' },
        ]);
        subjectFindUniqueMock.mockResolvedValueOnce({ name: '数学' });
        txProblemUpdateMock.mockResolvedValueOnce({ id: 'problem-1' });
        txProblemRevisionFindFirstMock.mockResolvedValueOnce({ id: 'draft-1' });
        txProblemRevisionUpdateMock.mockResolvedValueOnce({ id: 'draft-1' });

        const result = await createProblemDraft({
            problemId: 'problem-1',
            problemType: 'SHORT_TEXT',
            grade: '中1',
            coreProblemIds: ['core-1'],
            document: { blocks: [] },
            answerSpec: { kind: 'exact' },
            printConfig: {},
            gradingConfig: { mode: 'EXACT', maxScore: 100 },
        });

        expect(txProblemUpdateMock).toHaveBeenCalledOnce();
        expect(txProblemUpdateMock.mock.calls[0][0].data).toMatchObject({ masterNumber: null });
        expect(result).toEqual({ success: true, problemId: 'problem-1', revisionId: 'draft-1' });
    });

    it('deleteStandaloneProblem は引き続き admin 権限が必要', async () => {
        deleteProblemsWithRelationsMock.mockResolvedValueOnce(1);

        const result = await deleteStandaloneProblem('problem-1');

        expect(requireAdminMock).toHaveBeenCalledOnce();
        expect(requireProblemAuthorMock).not.toHaveBeenCalled();
        expect(deleteProblemsWithRelationsMock).toHaveBeenCalledWith(['problem-1']);
        expect(result).toEqual({ success: true });
    });
});
