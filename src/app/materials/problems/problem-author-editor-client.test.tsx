import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemAuthorEditorClient } from './problem-author-editor-client';

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

vi.mock('@/app/admin/problems/actions', () => ({
    createProblemDraft: vi.fn(),
    generateProblemFigureDraft: vi.fn(),
    previewProblemPrint: vi.fn(),
    publishProblemRevision: vi.fn(),
    syncProblemAuthoringArtifacts: vi.fn(),
    uploadProblemAsset: vi.fn(),
}));

vi.mock('@/app/admin/problems/components/core-problem-selector', () => ({
    CoreProblemSelector: () => <div>core-problem-selector</div>,
}));

vi.mock('@/app/admin/problems/components/problem-text-preview', () => ({
    ProblemTextPreview: () => <div>problem-text-preview</div>,
}));

vi.mock('@/app/admin/problems/problem-authoring-embed', () => ({
    ProblemAuthoringEmbed: () => <div>problem-authoring-embed</div>,
}));

vi.mock('@/components/problem-authoring/tex-help-link', () => ({
    TeXHelpLink: () => null,
}));

const baseProblem = {
    id: 'problem-1',
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
        authoringTool: 'GEOGEBRA',
        authoringState: null,
        structuredContent: {
            version: 1,
            blocks: [
                { id: 'p1', type: 'paragraph', text: 'グラフを見て答える。' },
                { id: 'g1', type: 'graphAsset', assetId: 'asset-graph' },
                { id: 'p2', type: 'paragraph', text: '図を見て答える。' },
                { id: 'i1', type: 'image', assetId: 'asset-image', src: '', alt: '' },
            ],
        },
        answerSpec: { kind: 'exact', correctAnswer: '', acceptedAnswers: [] },
        printConfig: { template: 'STANDARD', estimatedHeight: 'MEDIUM', answerMode: 'INLINE', answerLines: 3, showQrOnFirstPage: true },
        generationContext: null,
        assets: [],
    }],
} as const;

describe('ProblemAuthorEditorClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('教材側の問題作成画面にマスタNo入力欄を表示しない', () => {
        render(
            <ProblemAuthorEditorClient
                problem={null}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        expect(screen.queryByText('マスタNo')).not.toBeInTheDocument();
        expect(screen.getByText('学年')).toBeInTheDocument();
    });

    it('問題文タブで preview 系 UI を表示しない', () => {
        render(
            <ProblemAuthorEditorClient
                problem={baseProblem as never}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        fireEvent.mouseDown(screen.getByRole('tab', { name: '問題文' }), { button: 0 });

        expect(screen.queryByText('図版表示確認')).not.toBeInTheDocument();
        expect(screen.queryByText('補足説明')).not.toBeInTheDocument();
        expect(screen.queryByText('state を再同期')).not.toBeInTheDocument();
        expect(screen.queryByText('全体表示に合わせる')).not.toBeInTheDocument();
        expect(screen.queryByText('SVG 書き出しテスト')).not.toBeInTheDocument();
    });

    it('採点タブを表示せず、正解と別解だけを扱う', () => {
        render(
            <ProblemAuthorEditorClient
                problem={baseProblem as never}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        fireEvent.mouseDown(screen.getByRole('tab', { name: '答え' }), { button: 0 });
        expect(screen.getByText('答えと正解判定')).toBeInTheDocument();
        expect(screen.getByText('正解')).toBeInTheDocument();
        expect(screen.getByText('別解')).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: '採点' })).not.toBeInTheDocument();
    });
});
