import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('./actions', () => ({
    createProblemDraft: vi.fn(),
    deleteProblemAsset: vi.fn(),
    generateProblemFigureDraft: vi.fn(),
    overrideProblemGradingAudit: vi.fn(),
    previewProblemPrint: vi.fn(),
    publishProblemRevision: vi.fn(),
    simulateProblemGrading: vi.fn(),
    syncProblemAuthoringArtifacts: vi.fn(),
    uploadProblemAsset: vi.fn(),
}));

vi.mock('./components/core-problem-selector', () => ({
    CoreProblemSelector: () => <div>core-problem-selector</div>,
}));

vi.mock('./components/problem-asset-preview', () => ({
    ProblemAssetPreview: () => <div>problem-asset-preview</div>,
}));

vi.mock('./components/problem-text-preview', () => ({
    ProblemTextPreview: () => <div>problem-text-preview</div>,
}));

vi.mock('./problem-authoring-embed', () => ({
    ProblemAuthoringEmbed: () => <div>problem-authoring-embed</div>,
}));

vi.mock('@/hooks/use-live-problem-asset-preview', () => ({
    useLiveProblemAssetPreview: () => null,
}));

vi.mock('@/components/problem-authoring/tex-help-link', () => ({
    TeXHelpLink: () => null,
}));

describe('ProblemEditorClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('問題作成画面にマスタNo入力欄を表示しない', () => {
        render(
            <ProblemEditorClient
                problem={null}
                audits={[]}
                subjects={[{ id: 'subject-1', name: '英語' }]}
                coreProblems={[{ id: 'core-1', name: '現在完了', subjectId: 'subject-1', subject: { name: '英語' } }]}
                initialSubjectId="subject-1"
            />,
        );

        expect(screen.queryByText('マスタNo')).not.toBeInTheDocument();
        expect(screen.getByText('学年')).toBeInTheDocument();
    });
});
