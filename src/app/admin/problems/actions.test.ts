import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    requireAdminMock,
    requireProblemAuthorMock,
    coreProblemFindManyMock,
    problemFindManyMock,
    problemFindFirstMock,
    problemFindUniqueMock,
    problemCountMock,
    subjectFindUniqueMock,
    transactionMock,
    bulkUpsertProblemsCoreMock,
    deleteProblemsWithRelationsMock,
    revalidatePathMock,
    getNextCustomIdMock,
    parseStructuredDocumentMock,
    parseAnswerSpecMock,
    parsePrintConfigMock,
    normalizeAnswerSpecForAuthoringMock,
    normalizeAnswerForAuthoringMock,
    wouldFlattenLoseStructuredContentMock,
    txProblemCreateMock,
    txProblemUpdateMock,
    txProblemFindUniqueMock,
    txProblemRevisionFindFirstMock,
    txProblemRevisionUpdateMock,
    txProblemRevisionCreateMock,
    queryRawMock,
} = vi.hoisted(() => ({
    requireAdminMock: vi.fn(),
    requireProblemAuthorMock: vi.fn(),
    coreProblemFindManyMock: vi.fn(),
    problemFindManyMock: vi.fn(),
    problemFindFirstMock: vi.fn(),
    problemFindUniqueMock: vi.fn(),
    problemCountMock: vi.fn(),
    subjectFindUniqueMock: vi.fn(),
    transactionMock: vi.fn(),
    bulkUpsertProblemsCoreMock: vi.fn(),
    deleteProblemsWithRelationsMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    getNextCustomIdMock: vi.fn(),
    parseStructuredDocumentMock: vi.fn(),
    parseAnswerSpecMock: vi.fn(),
    parsePrintConfigMock: vi.fn(),
    normalizeAnswerSpecForAuthoringMock: vi.fn(),
    normalizeAnswerForAuthoringMock: vi.fn(),
    wouldFlattenLoseStructuredContentMock: vi.fn(),
    txProblemCreateMock: vi.fn(),
    txProblemUpdateMock: vi.fn(),
    txProblemFindUniqueMock: vi.fn(),
    txProblemRevisionFindFirstMock: vi.fn(),
    txProblemRevisionUpdateMock: vi.fn(),
    txProblemRevisionCreateMock: vi.fn(),
    queryRawMock: vi.fn(),
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
            findUnique: problemFindUniqueMock,
            count: problemCountMock,
        },
        subject: {
            findUnique: subjectFindUniqueMock,
        },
        $transaction: transactionMock,
        $queryRaw: queryRawMock,
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

vi.mock('@/lib/curriculum-service', () => ({
    getNextCustomId: getNextCustomIdMock,
}));

vi.mock('@/lib/structured-problem', () => ({
    buildDefaultStructuredDraft: vi.fn(),
    buildStructuredDocumentFromText: vi.fn((text: string) => ({ version: 1, blocks: [{ id: 'p1', type: 'paragraph', text }] })),
    extractSearchTextFromRevision: vi.fn(() => ''),
    getDisplayQuestionFromStructuredContent: vi.fn(() => ''),
    normalizeAnswerSpecForAuthoring: normalizeAnswerSpecForAuthoringMock,
    normalizeAnswerForAuthoring: normalizeAnswerForAuthoringMock,
    parseAnswerSpec: parseAnswerSpecMock,
    parsePrintConfig: parsePrintConfigMock,
    parseStructuredDocument: parseStructuredDocumentMock,
    wouldFlattenLoseStructuredContent: wouldFlattenLoseStructuredContentMock,
}));

vi.mock('@/lib/problem-assets', () => ({
    createProblemAssetSignedUrl: vi.fn(),
    removeProblemAssetFromStorage: vi.fn(),
    uploadProblemAssetToStorage: vi.fn(),
}));

vi.mock('@/lib/problem-svg', () => ({
    ensureRenderableSvgMarkup: vi.fn(),
}));

import {
    bulkSearchCoreProblems,
    bulkUpsertStandaloneProblems,
    createProblemDraft,
    deleteStandaloneProblem,
    getProblems,
    searchProblemsByMasterNumbers,
    updateStandaloneProblem,
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
        getNextCustomIdMock.mockResolvedValue('E-1001');
        parseStructuredDocumentMock.mockImplementation((value) => value);
        parseAnswerSpecMock.mockImplementation((value) => value);
        parsePrintConfigMock.mockImplementation((value) => value);
        normalizeAnswerSpecForAuthoringMock.mockImplementation((value) => value);
        normalizeAnswerForAuthoringMock.mockImplementation(({ correctAnswer, acceptedAnswers }) => ({
            correctAnswer: typeof correctAnswer === 'string' ? correctAnswer.trim() : '',
            acceptedAnswers: Array.isArray(acceptedAnswers)
                ? acceptedAnswers.filter((v: unknown): v is string => typeof v === 'string')
                : [],
        }));
        wouldFlattenLoseStructuredContentMock.mockReturnValue(false);
        transactionMock.mockImplementation(async (callback: (tx: {
            problem: {
                create: typeof txProblemCreateMock;
                update: typeof txProblemUpdateMock;
                findUnique: typeof txProblemFindUniqueMock;
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
                findUnique: txProblemFindUniqueMock,
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
            answerSpec: {},
            printConfig: {},
            correctAnswer: '',
            acceptedAnswers: [],
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
        txProblemFindUniqueMock.mockResolvedValueOnce({ videoUrl: null, videoStatus: 'NONE' });
        txProblemUpdateMock.mockResolvedValueOnce({ id: 'problem-1' });
        txProblemRevisionFindFirstMock.mockResolvedValueOnce({ id: 'draft-1' });
        txProblemRevisionUpdateMock.mockResolvedValueOnce({ id: 'draft-1' });

        const result = await createProblemDraft({
            problemId: 'problem-1',
            problemType: 'SHORT_TEXT',
            grade: '中1',
            coreProblemIds: ['core-1'],
            document: { blocks: [] },
            answerSpec: {},
            printConfig: {},
            correctAnswer: '',
            acceptedAnswers: [],
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
        txProblemFindUniqueMock.mockResolvedValueOnce({ videoUrl: null, videoStatus: 'NONE' });
        txProblemUpdateMock.mockResolvedValueOnce({ id: 'problem-1' });
        txProblemRevisionFindFirstMock.mockResolvedValueOnce({ id: 'draft-1' });
        txProblemRevisionUpdateMock.mockResolvedValueOnce({ id: 'draft-1' });

        const result = await createProblemDraft({
            problemId: 'problem-1',
            problemType: 'SHORT_TEXT',
            grade: '中1',
            coreProblemIds: ['core-1'],
            document: { blocks: [] },
            answerSpec: {},
            printConfig: {},
            correctAnswer: '',
            acceptedAnswers: [],
        });

        expect(txProblemUpdateMock).toHaveBeenCalledOnce();
        expect(txProblemUpdateMock.mock.calls[0][0].data).toMatchObject({ masterNumber: null });
        expect(result).toEqual({ success: true, problemId: 'problem-1', revisionId: 'draft-1' });
    });

    it('createProblemDraft は未公開問題の下書き保存でも Problem の legacy フィールドに書き込まない (Phase C drop 済み)', async () => {
        coreProblemFindManyMock.mockResolvedValueOnce([
            { id: 'core-1', subjectId: 'subject-math' },
        ]);
        subjectFindUniqueMock.mockResolvedValueOnce({ name: '数学' });
        // publishedRevisionId が null = 未公開の下書き専用問題
        txProblemFindUniqueMock.mockResolvedValueOnce({
            videoUrl: null,
            videoStatus: 'NONE',
            publishedRevisionId: null,
        });
        txProblemUpdateMock.mockResolvedValueOnce({ id: 'problem-1' });
        txProblemRevisionFindFirstMock.mockResolvedValueOnce({ id: 'draft-1' });
        txProblemRevisionUpdateMock.mockResolvedValueOnce({ id: 'draft-1' });

        await createProblemDraft({
            problemId: 'problem-1',
            problemType: 'SHORT_TEXT',
            grade: '中1',
            coreProblemIds: ['core-1'],
            document: { blocks: [] },
            answerSpec: {},
            printConfig: {},
            correctAnswer: '下書きの正解',
            acceptedAnswers: ['許容1'],
        });

        // Phase C: Problem.question / answer / acceptedAnswers / hasStructuredContent は drop 済み
        const data = txProblemUpdateMock.mock.calls[0][0].data;
        expect(data).not.toHaveProperty('question');
        expect(data).not.toHaveProperty('answer');
        expect(data).not.toHaveProperty('acceptedAnswers');
        expect(data).not.toHaveProperty('hasStructuredContent');

        // 正解情報は ProblemRevision の専用カラムのみが受け取る
        const revisionData = txProblemRevisionUpdateMock.mock.calls[0][0].data;
        expect(revisionData).toMatchObject({
            correctAnswer: '下書きの正解',
            acceptedAnswers: ['許容1'],
        });
    });

    it('createProblemDraft は公開済み問題の下書き保存で Problem の legacy フィールドに書き込まない (Phase C drop 済み)', async () => {
        coreProblemFindManyMock.mockResolvedValueOnce([
            { id: 'core-1', subjectId: 'subject-math' },
        ]);
        subjectFindUniqueMock.mockResolvedValueOnce({ name: '数学' });
        txProblemFindUniqueMock.mockResolvedValueOnce({
            videoUrl: null,
            videoStatus: 'NONE',
            publishedRevisionId: 'pubrev-1',
        });
        txProblemUpdateMock.mockResolvedValueOnce({ id: 'problem-1' });
        txProblemRevisionFindFirstMock.mockResolvedValueOnce({ id: 'draft-1' });
        txProblemRevisionUpdateMock.mockResolvedValueOnce({ id: 'draft-1' });

        await createProblemDraft({
            problemId: 'problem-1',
            problemType: 'SHORT_TEXT',
            grade: '中1',
            coreProblemIds: ['core-1'],
            document: { blocks: [] },
            answerSpec: {},
            printConfig: {},
            correctAnswer: '更新中の正解',
            acceptedAnswers: ['更新中の許容'],
        });

        const data = txProblemUpdateMock.mock.calls[0][0].data;
        expect(data).not.toHaveProperty('question');
        expect(data).not.toHaveProperty('answer');
        expect(data).not.toHaveProperty('acceptedAnswers');
        expect(data).not.toHaveProperty('hasStructuredContent');

        // 下書き revision には新しい正解情報が書かれる
        const revisionData = txProblemRevisionUpdateMock.mock.calls[0][0].data;
        expect(revisionData).toMatchObject({
            correctAnswer: '更新中の正解',
            acceptedAnswers: ['更新中の許容'],
        });
    });

    it('deleteStandaloneProblem は引き続き admin 権限が必要', async () => {
        deleteProblemsWithRelationsMock.mockResolvedValueOnce(1);

        const result = await deleteStandaloneProblem('problem-1');

        expect(requireAdminMock).toHaveBeenCalledOnce();
        expect(requireProblemAuthorMock).not.toHaveBeenCalled();
        expect(deleteProblemsWithRelationsMock).toHaveBeenCalledWith(['problem-1']);
        expect(result).toEqual({ success: true });
    });

    it('getProblems は検索時に customId 完全一致を先頭に固定する', async () => {
        // 検索 "355" で E-355 が完全一致、E-3355 / E-2355 は部分一致（更新日時で新しい）
        const exactItem = { id: 'problem-exact', customId: 'E-355', updatedAt: new Date('2026-04-01') };
        const recentPartial = { id: 'problem-recent', customId: 'E-3355', updatedAt: new Date('2026-05-01') };
        const oldPartial = { id: 'problem-old', customId: 'E-2355', updatedAt: new Date('2026-04-20') };

        // Phase D: structuredContent 全文検索 (raw query) は撤廃済みなので queryRaw は使わない
        problemFindManyMock
            // 1回目: 完全一致 ID 抽出 (select: id)
            .mockResolvedValueOnce([{ id: exactItem.id }])
            // 2回目: pinned アイテム本体 (Promise.all 内 1 番目)
            .mockResolvedValueOnce([exactItem])
            // 3回目: 残り (Promise.all 内 2 番目)
            .mockResolvedValueOnce([recentPartial, oldPartial]);
        problemCountMock.mockResolvedValueOnce(3);

        const result = await getProblems(1, 20, '355');

        expect(result.success).toBe(true);
        expect(result.problems).toEqual([exactItem, recentPartial, oldPartial]);
        expect(result.total).toBe(3);
    });

    it('updateStandaloneProblem は構造化ブロック付き問題への question 上書きを拒否する', async () => {
        problemFindUniqueMock.mockResolvedValueOnce({
            videoUrl: null,
            videoStatus: 'NONE',
            publishedRevisionId: 'rev-1',
            publishedRevision: {
                structuredContent: {
                    version: 1,
                    blocks: [
                        { id: 'p1', type: 'paragraph', text: '本文' },
                        { id: 't1', type: 'table', headers: ['x'], rows: [['1']] },
                    ],
                },
                correctAnswer: '旧解答',
                acceptedAnswers: [],
            },
            revisions: [],
        });
        wouldFlattenLoseStructuredContentMock.mockReturnValueOnce(true);

        const result = await updateStandaloneProblem('problem-1', {
            question: '新テキスト',
            grade: '中2',
        });

        expect(result.error).toBe('構造化ブロックを含む問題はこの画面から編集できません。問題編集画面をご利用ください。');
        // 構造化破壊が発生しないよう、transaction (= 書き込み経路) に到達しないこと
        expect(transactionMock).not.toHaveBeenCalled();
    });

    it('updateStandaloneProblem は paragraph のみの問題なら question 編集を許可する', async () => {
        problemFindUniqueMock.mockResolvedValueOnce({
            videoUrl: null,
            videoStatus: 'NONE',
            publishedRevisionId: 'rev-1',
            publishedRevision: {
                structuredContent: {
                    version: 1,
                    blocks: [
                        { id: 'p1', type: 'paragraph', text: '本文のみ' },
                    ],
                },
                correctAnswer: '旧解答',
                acceptedAnswers: [],
            },
            revisions: [],
        });
        // paragraph のみなので flatten 安全
        wouldFlattenLoseStructuredContentMock.mockReturnValueOnce(false);
        txProblemUpdateMock.mockResolvedValueOnce({ id: 'problem-1' });
        txProblemRevisionUpdateMock.mockResolvedValueOnce({ id: 'rev-1' });
        txProblemFindUniqueMock.mockResolvedValueOnce({ id: 'problem-1' });

        const result = await updateStandaloneProblem('problem-1', {
            question: '新テキスト',
        });

        expect(result).toMatchObject({ success: true });
        expect(transactionMock).toHaveBeenCalledOnce();
        expect(txProblemRevisionUpdateMock).toHaveBeenCalledOnce();
    });

    it('updateStandaloneProblem は publishedRevision 無しでも DRAFT に構造化ブロックがあれば拒否する', async () => {
        problemFindUniqueMock.mockResolvedValueOnce({
            videoUrl: null,
            videoStatus: 'NONE',
            publishedRevisionId: null,
            publishedRevision: null,
            revisions: [{
                structuredContent: {
                    version: 1,
                    blocks: [
                        { id: 'p1', type: 'paragraph', text: '本文' },
                        { id: 'c1', type: 'choices', options: [{ id: 'A', label: 'A' }] },
                    ],
                },
                correctAnswer: '旧解答',
                acceptedAnswers: [],
            }],
        });
        wouldFlattenLoseStructuredContentMock.mockReturnValueOnce(true);

        const result = await updateStandaloneProblem('problem-1', {
            question: '上書き',
        });

        expect(result.error).toBe('構造化ブロックを含む問題はこの画面から編集できません。問題編集画面をご利用ください。');
        expect(transactionMock).not.toHaveBeenCalled();
    });

    it('updateStandaloneProblem は空白のみの question を拒否する (paragraphBlockSchema 違反防止)', async () => {
        const result = await updateStandaloneProblem('problem-1', {
            question: '   \n\t  ',
        });

        expect(result.error).toBe('問題文を入力してください');
        // バリデーションで早期 return するので DB クエリにも到達しない
        expect(problemFindUniqueMock).not.toHaveBeenCalled();
        expect(transactionMock).not.toHaveBeenCalled();
    });

    it('updateStandaloneProblem は payload が null でも TypeError を起こさず拒否する', async () => {
        const result = await updateStandaloneProblem('problem-1', null as never);

        expect(result.error).toBe('不正なリクエストです');
        expect(problemFindUniqueMock).not.toHaveBeenCalled();
        expect(transactionMock).not.toHaveBeenCalled();
    });

    it('updateStandaloneProblem は string でない question (null 等) も TypeError を起こさず拒否する', async () => {
        const result = await updateStandaloneProblem('problem-1', {
            // Server Action 引数は runtime に任意値が入りうる
            question: null as unknown as string,
        });

        expect(result.error).toBe('問題文を入力してください');
        expect(problemFindUniqueMock).not.toHaveBeenCalled();
        expect(transactionMock).not.toHaveBeenCalled();
    });

    it('getProblems は検索が空のときは固定処理を行わず単一クエリで返す', async () => {
        const items = [
            { id: 'p1', customId: 'E-1' },
            { id: 'p2', customId: 'E-2' },
        ];
        problemFindManyMock.mockResolvedValueOnce(items);
        problemCountMock.mockResolvedValueOnce(2);

        const result = await getProblems(1, 20, '');

        expect(result.success).toBe(true);
        expect(result.problems).toEqual(items);
        expect(problemFindManyMock).toHaveBeenCalledTimes(1);
        // Phase D: 検索は revisions.some.searchText の relation filter で完結するので
        // raw query は使わない (全シナリオで $queryRaw は発行されない)
        expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('getProblems は revisions.some.searchText の検索条件を OR に含める (DRAFT-only 問題もカバー)', async () => {
        problemFindManyMock
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
        problemCountMock.mockResolvedValueOnce(0);

        await getProblems(1, 20, 'こんにちは');

        const searchCalls = problemFindManyMock.mock.calls.filter((call) => {
            const where = call[0]?.where as { OR?: Array<Record<string, unknown>> } | undefined;
            return Array.isArray(where?.OR);
        });
        expect(searchCalls.length).toBeGreaterThan(0);
        const orHasSearchTextFilter = searchCalls.some((call) => {
            const where = call[0]?.where as { OR?: Array<Record<string, unknown>> } | { AND?: Array<{ OR?: Array<Record<string, unknown>> }> };
            const ors = (where as { OR?: Array<Record<string, unknown>> }).OR
                ?? (where as { AND?: Array<{ OR?: Array<Record<string, unknown>> }> }).AND?.flatMap((c) => c.OR ?? [])
                ?? [];
            return ors.some((cond) => {
                const rev = (cond as { revisions?: { some?: { searchText?: { contains?: string } } } }).revisions;
                return rev?.some?.searchText?.contains === 'こんにちは';
            });
        });
        expect(orHasSearchTextFilter).toBe(true);
        // Phase D: raw query は不要 (relation filter 1 本で完結する)
        expect(queryRawMock).not.toHaveBeenCalled();
    });
});
