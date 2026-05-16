import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import jaMessages from '@/messages/ja.json';
import { ProblemEditorClient } from './problem-editor-client';

const { pushMock, refreshMock } = vi.hoisted(() => ({
    pushMock: vi.fn(),
    refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: pushMock,
        refresh: refreshMock,
    }),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const {
    createProblemDraftMock,
    publishProblemRevisionMock,
    sendBackProblemMock,
} = vi.hoisted(() => ({
    createProblemDraftMock: vi.fn(),
    publishProblemRevisionMock: vi.fn(),
    sendBackProblemMock: vi.fn(),
}));

vi.mock('./actions', () => ({
    createProblemDraft: createProblemDraftMock,
    deleteProblemAsset: vi.fn(),
    previewProblemPrint: vi.fn(),
    publishProblemRevision: publishProblemRevisionMock,
    sendBackProblem: sendBackProblemMock,
    uploadProblemAsset: vi.fn(),
}));

vi.mock('./components/core-problem-selector', () => ({
    CoreProblemSelector: () => <div>core-problem-selector</div>,
}));

vi.mock('./components/problem-text-preview', () => ({
    ProblemTextPreview: () => <div>problem-text-preview</div>,
}));

vi.mock('@/components/problem-authoring/tex-help-link', () => ({
    TeXHelpLink: () => null,
}));

const baseProblem = {
    id: 'problem-1',
    customId: 'E-1',
    subjectId: 'subject-1',
    grade: '中2',
    videoUrl: '',
    problemType: 'GRAPH_DRAW',
    coreProblems: [{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }],
    publishedRevision: null,
    revisions: [{
        id: 'revision-1',
        status: 'DRAFT',
        revisionNumber: 1,
        authoringTool: 'MANUAL',
        authoringState: null,
        structuredContent: {
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: '画像を見て答える。' },
                { id: 'i1', type: 'image', assetId: 'asset-image', src: '', alt: '' },
                { id: 'p2', type: 'paragraph', text: '図を見て答える。' },
                { id: 's1', type: 'svg', assetId: 'asset-svg', svg: '' },
            ],
        },
        answerSpec: {},
        correctAnswer: '',
        acceptedAnswers: [],
        printConfig: { template: 'STANDARD', estimatedHeight: 'MEDIUM', answerMode: 'INLINE', answerLines: 3, showQrOnFirstPage: true },
        generationContext: null,
        assets: [],
    }],
} as const;

const mathProblem = {
    ...baseProblem,
    subjectId: 'subject-math',
    coreProblems: [{ id: 'core-1', name: '一次方程式', subjectId: 'subject-math', subject: { name: '数学' } }],
} as const;

function renderWithIntl(ui: ReactNode) {
    return render(
        <NextIntlClientProvider locale="ja" messages={jaMessages}>
            {ui}
        </NextIntlClientProvider>,
    );
}

describe('ProblemEditorClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('問題作成画面にマスタNo入力欄を表示しない', () => {
        renderWithIntl(
            <ProblemEditorClient
                problem={null}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        expect(screen.queryByText('マスタNo')).not.toBeInTheDocument();
        expect(screen.getByText('学年')).toBeInTheDocument();
    });

    it('既存問題編集ではタイトル横に customId バッジを表示する', () => {
        renderWithIntl(
            <ProblemEditorClient
                problem={baseProblem as never}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        expect(screen.getByText('ID: E-1')).toBeInTheDocument();
    });

    it('新規作成画面では customId バッジを表示しない', () => {
        renderWithIntl(
            <ProblemEditorClient
                problem={null}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        expect(screen.queryByText(/^ID: /)).not.toBeInTheDocument();
    });

    it('本文タブで preview 系 UI を表示しない', () => {
        renderWithIntl(
            <ProblemEditorClient
                problem={baseProblem as never}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        fireEvent.mouseDown(screen.getByRole('tab', { name: '本文' }), { button: 0 });

        expect(screen.queryByText('図版表示確認')).not.toBeInTheDocument();
        expect(screen.queryByText('補足説明')).not.toBeInTheDocument();
        expect(screen.queryByText('state を再同期')).not.toBeInTheDocument();
        expect(screen.queryByText('全体表示に合わせる')).not.toBeInTheDocument();
        expect(screen.queryByText('SVG 書き出しテスト')).not.toBeInTheDocument();
    });

    it('英語では本文確認と図・画像UIを表示しない', () => {
        renderWithIntl(
            <ProblemEditorClient
                problem={baseProblem as never}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        fireEvent.mouseDown(screen.getByRole('tab', { name: '本文' }), { button: 0 });

        expect(screen.queryByText('本文確認')).not.toBeInTheDocument();
        expect(screen.queryByText('図・画像など')).not.toBeInTheDocument();
    });

    it('数学では本文確認を右配置で表示する', () => {
        renderWithIntl(
            <ProblemEditorClient
                problem={mathProblem as never}
                subjects={[{ id: 'subject-math', name: '数学' }]}
                coreProblems={[{ id: 'core-1', name: '一次方程式', subjectId: 'subject-math', subject: { name: '数学' } }]}
                initialSubjectId="subject-math"
            />,
        );

        fireEvent.mouseDown(screen.getByRole('tab', { name: '本文' }), { button: 0 });

        expect(screen.getAllByText('本文確認')).not.toHaveLength(0);
        expect(screen.getAllByText('図・画像など')).not.toHaveLength(0);
        expect(screen.getAllByTestId('problem-body-card-text-layout')[0]).toHaveAttribute('data-preview-placement', 'right');
    });

    it('採点タブを表示せず、解答仕様だけを編集できる', () => {
        renderWithIntl(
            <ProblemEditorClient
                problem={baseProblem as never}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        fireEvent.mouseDown(screen.getByRole('tab', { name: '解答仕様' }), { button: 0 });
        expect(screen.getByText('正解')).toBeInTheDocument();
        expect(screen.getByText('別解(JSON)')).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: '採点' })).not.toBeInTheDocument();
        expect(screen.queryByText('採点監査')).not.toBeInTheDocument();
    });

    it('解答仕様タブに正解/別解のプレビュー欄を表示する', () => {
        renderWithIntl(
            <ProblemEditorClient
                problem={baseProblem as never}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        fireEvent.mouseDown(screen.getByRole('tab', { name: '解答仕様' }), { button: 0 });

        expect(screen.getByText('正解プレビュー')).toBeInTheDocument();
        expect(screen.getByText('別解プレビュー')).toBeInTheDocument();
    });

    it('別解JSONが不正なときはエラー表示が出る', () => {
        renderWithIntl(
            <ProblemEditorClient
                problem={baseProblem as never}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        fireEvent.mouseDown(screen.getByRole('tab', { name: '解答仕様' }), { button: 0 });

        const acceptedAnswersTextarea = screen.getByPlaceholderText('["別解1", "別解2"]');

        fireEvent.change(acceptedAnswersTextarea, { target: { value: '["abc"' } });

        expect(screen.getByTestId('answer-spec-accepted-preview-error')).toBeInTheDocument();
    });

    it('一覧へ戻るリンクは編集中科目の subjectId をクエリで保持する', () => {
        renderWithIntl(
            <ProblemEditorClient
                problem={mathProblem as never}
                subjects={[{ id: 'subject-math', name: '数学' }]}
                coreProblems={[{ id: 'core-1', name: '一次方程式', subjectId: 'subject-math', subject: { name: '数学' } }]}
                initialSubjectId="subject-math"
                routeBase="/admin/problems"
            />,
        );

        expect(screen.getByRole('link', { name: '一覧へ戻る' })).toHaveAttribute(
            'href',
            '/admin/problems?subjectId=subject-math',
        );
    });

    it('解説動画URLを入力すると動画ステータスの表示が「設定済み」になる', () => {
        renderWithIntl(
            <ProblemEditorClient
                problem={null}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        const videoUrlInput = screen.getByPlaceholderText('https://...');
        const findStatusCombobox = () => screen
            .getAllByRole('combobox')
            .find((el) => el.textContent === '-' || el.textContent === '設定済み' || el.textContent === 'Drive完了' || el.textContent === '撮影完了');

        // 初期状態は NONE (「-」) で disabled でない
        const initialStatus = findStatusCombobox();
        expect(initialStatus).toBeDefined();
        expect(initialStatus).toHaveTextContent('-');
        expect(initialStatus).not.toBeDisabled();
        expect(screen.queryByText('URL設定済みのため自動的に「設定済み」になります')).not.toBeInTheDocument();

        fireEvent.change(videoUrlInput, { target: { value: 'https://example.com/video.mp4' } });

        // URL入力後はステータスが「設定済み」になり、Select は disabled になる
        const updatedStatus = findStatusCombobox();
        expect(updatedStatus).toHaveTextContent('設定済み');
        expect(updatedStatus).toBeDisabled();
        expect(screen.getByText('URL設定済みのため自動的に「設定済み」になります')).toBeInTheDocument();

        // URL を消すと NONE 表示に戻る
        fireEvent.change(videoUrlInput, { target: { value: '' } });
        const clearedStatus = findStatusCombobox();
        expect(clearedStatus).toHaveTextContent('-');
        expect(clearedStatus).not.toBeDisabled();
    });

    it('差し戻しボタンを押すとダイアログが開き、理由入力後に sendBackProblem を呼ぶ', async () => {
        sendBackProblemMock.mockResolvedValueOnce({ success: true, status: 'SENT_BACK', sentBackReason: '答えが違います' });

        renderWithIntl(
            <ProblemEditorClient
                problem={baseProblem as never}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '差し戻し' }));

        const textarea = await screen.findByPlaceholderText('どこを直してほしいかを書いてください');
        fireEvent.change(textarea, { target: { value: '答えが違います' } });

        fireEvent.click(screen.getByRole('button', { name: '差し戻す' }));

        await vi.waitFor(() => {
            expect(sendBackProblemMock).toHaveBeenCalledWith('problem-1', '答えが違います');
        });
    });

    it('公開ボタンは createProblemDraft 後に publishProblemRevision を呼ぶ', async () => {
        const simpleProblem = {
            ...baseProblem,
            problemType: 'SHORT_TEXT',
            revisions: [{
                ...baseProblem.revisions[0],
                authoringTool: 'MANUAL',
                structuredContent: {
                    version: 1,
                    blocks: [
                        { id: 'p1', type: 'paragraph', text: '簡単な問題。' },
                    ],
                },
            }],
        } as const;

        createProblemDraftMock.mockResolvedValueOnce({
            success: true,
            problemId: 'problem-1',
            revisionId: 'revision-1',
        });
        publishProblemRevisionMock.mockResolvedValueOnce({ success: true });

        renderWithIntl(
            <ProblemEditorClient
                problem={simpleProblem as never}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '公開' }));

        await vi.waitFor(() => {
            expect(createProblemDraftMock).toHaveBeenCalled();
            expect(publishProblemRevisionMock).toHaveBeenCalledWith('problem-1');
        });
        expect(createProblemDraftMock.mock.invocationCallOrder[0])
            .toBeLessThan(publishProblemRevisionMock.mock.invocationCallOrder[0]);
    });
});
