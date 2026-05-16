import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import jaMessages from '@/messages/ja.json';
import { ProblemDialog } from './problem-dialog';

vi.mock('../actions', () => ({
    createStandaloneProblem: vi.fn(),
    updateStandaloneProblem: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('./core-problem-selector', () => ({
    CoreProblemSelector: () => <div>core-problem-selector</div>,
}));

describe('ProblemDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('旧 dialog にマスタ内問題番号入力欄を表示しない', () => {
        render(
            <NextIntlClientProvider locale="ja" messages={jaMessages}>
                <ProblemDialog
                    open
                    onOpenChange={vi.fn()}
                    problem={null}
                    onSuccess={vi.fn()}
                />
            </NextIntlClientProvider>,
        );

        expect(screen.queryByText('マスタ内問題番号 (任意)')).not.toBeInTheDocument();
        expect(screen.getByText('問題文')).toBeInTheDocument();
    });
});
