import { render, screen } from '@testing-library/react';
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
    simulateProblemGrading: vi.fn(),
    syncProblemAuthoringArtifacts: vi.fn(),
    uploadProblemAsset: vi.fn(),
}));

vi.mock('@/app/admin/problems/components/core-problem-selector', () => ({
    CoreProblemSelector: () => <div>core-problem-selector</div>,
}));

vi.mock('@/app/admin/problems/components/problem-asset-preview', () => ({
    ProblemAssetPreview: () => <div>problem-asset-preview</div>,
}));

vi.mock('@/app/admin/problems/components/problem-text-preview', () => ({
    ProblemTextPreview: () => <div>problem-text-preview</div>,
}));

vi.mock('@/app/admin/problems/problem-authoring-embed', () => ({
    ProblemAuthoringEmbed: () => <div>problem-authoring-embed</div>,
}));

vi.mock('@/hooks/use-live-problem-asset-preview', () => ({
    useLiveProblemAssetPreview: () => null,
}));

vi.mock('@/components/problem-authoring/tex-help-link', () => ({
    TeXHelpLink: () => null,
}));

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
});
