import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProblemBodyCardEditorShared } from './problem-body-card-editor-shared';

vi.mock('./problem-text-preview', () => ({
    ProblemTextPreview: () => <div>problem-text-preview</div>,
}));

vi.mock('@/components/problem-authoring/tex-help-link', () => ({
    TeXHelpLink: () => null,
}));

type CardOverrides = Partial<{
    attachmentKind: 'none' | 'upload' | 'table' | 'numberline' | 'coordplane' | 'geometry' | 'solid';
    attachmentBlockType: 'image' | 'svg' | 'table' | 'directive' | null;
    directiveSource: string;
}>;

function renderEditor(subjectName: string, overrides: CardOverrides = {}) {
    return render(
        <ProblemBodyCardEditorShared
            subjectName={subjectName}
            card={{
                id: 'card-1',
                text: 'テスト本文',
                attachmentKind: overrides.attachmentKind ?? 'none',
                attachmentBlockType: overrides.attachmentBlockType ?? null,
                assetId: '',
                tableData: { headers: [], rows: [] },
                directiveSource: overrides.directiveSource ?? '',
            }}
            problemId=""
            revisionId=""
            isUploadingAsset={false}
            isPending={false}
            onCardChange={() => {}}
            onUploadAsset={() => {}}
        />,
    );
}

describe('ProblemBodyCardEditorShared', () => {
    it('英語では本文確認と図・画像UIを表示しない', () => {
        renderEditor('英語');

        expect(screen.queryByText('本文確認')).not.toBeInTheDocument();
        expect(screen.queryByText('図・画像など')).not.toBeInTheDocument();
        expect(screen.getByTestId('problem-body-card-text-layout')).toHaveAttribute('data-preview-placement', 'hidden');
    });

    it('国語では本文確認と図・画像UIを表示しない', () => {
        renderEditor('国語');

        expect(screen.queryByText('本文確認')).not.toBeInTheDocument();
        expect(screen.queryByText('図・画像など')).not.toBeInTheDocument();
        expect(screen.getByTestId('problem-body-card-text-layout')).toHaveAttribute('data-preview-placement', 'hidden');
    });

    it('数学では本文確認を右配置で表示する', () => {
        renderEditor('数学');

        expect(screen.getByText('本文確認')).toBeInTheDocument();
        expect(screen.getByText('図・画像など')).toBeInTheDocument();
        expect(screen.getByTestId('problem-body-card-text-layout')).toHaveAttribute('data-preview-placement', 'right');
    });

    it('理科では本文確認を右配置で表示する', () => {
        renderEditor('理科');

        expect(screen.getByText('本文確認')).toBeInTheDocument();
        expect(screen.getByText('図・画像など')).toBeInTheDocument();
        expect(screen.getByTestId('problem-body-card-text-layout')).toHaveAttribute('data-preview-placement', 'right');
    });

    it('未知の科目では本文確認を下配置で表示する', () => {
        renderEditor('社会');

        expect(screen.getByText('本文確認')).toBeInTheDocument();
        expect(screen.getByText('図・画像など')).toBeInTheDocument();
        expect(screen.getByTestId('problem-body-card-text-layout')).toHaveAttribute('data-preview-placement', 'below');
    });

    it('attachmentKind="solid" の card で directive 用 UI とプレビューが表示される', () => {
        renderEditor('数学', {
            attachmentKind: 'solid',
            attachmentBlockType: 'directive',
            directiveSource: '[[solid kind="cube" a=4]]',
        });

        // 立体カードでは「図版設定」と「プレビュー」が両方出ること
        // （かつてここが numberline/coordplane/geometry のみ判定で抜けていた）
        expect(screen.getByText('図版設定')).toBeInTheDocument();
        expect(screen.getByText('プレビュー')).toBeInTheDocument();
    });
});
