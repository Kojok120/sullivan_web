import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemList } from './problem-list';
import type { ProblemWithRelations } from '../types';

const { refreshMock, bulkDeleteProblemsMock, deleteStandaloneProblemMock } = vi.hoisted(() => ({
    refreshMock: vi.fn(),
    bulkDeleteProblemsMock: vi.fn(),
    deleteStandaloneProblemMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('../actions', () => ({
    bulkDeleteProblems: bulkDeleteProblemsMock,
    deleteStandaloneProblem: deleteStandaloneProblemMock,
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('ProblemList', () => {
    const problems = [
        {
            id: 'problem-1',
            masterNumber: 101,
            customId: 'E-101',
            question: '問題文',
            answer: '答え',
            problemType: 'SHORT_TEXT',
            status: 'PUBLISHED',
            videoUrl: null,
            coreProblems: [
                {
                    id: 'core-1',
                    name: '現在完了',
                    subject: { name: '英語' },
                },
            ],
        },
    ] as unknown as ProblemWithRelations[];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('showMasterNumber=true のときはマスタNo列とモバイルNoを表示する', () => {
        render(
            <ProblemList
                problems={problems}
                onEdit={vi.fn()}
                sortBy="updatedAt"
                sortOrder="desc"
                onSort={vi.fn()}
                showMasterNumber
            />,
        );

        expect(screen.getByRole('columnheader', { name: 'マスタNo' })).toBeInTheDocument();
        expect(screen.getByText('No.101')).toBeInTheDocument();
    });

    it('showMasterNumber=false のときはマスタNo列とモバイルNoを表示しない', () => {
        render(
            <ProblemList
                problems={problems}
                onEdit={vi.fn()}
                sortBy="updatedAt"
                sortOrder="desc"
                onSort={vi.fn()}
                showMasterNumber={false}
            />,
        );

        expect(screen.queryByRole('columnheader', { name: 'マスタNo' })).not.toBeInTheDocument();
        expect(screen.queryByText('No.101')).not.toBeInTheDocument();
    });
});
