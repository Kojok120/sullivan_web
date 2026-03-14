import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'next/navigation';

import { PrintProblemCard } from './print-problem-card';

const { getCoreProblemsForSubjectMock } = vi.hoisted(() => ({
    getCoreProblemsForSubjectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: vi.fn(),
}));

vi.mock('@/app/admin/curriculum/actions', () => ({
    getCoreProblemsForSubject: getCoreProblemsForSubjectMock,
}));

vi.mock('@/components/ui/select', async () => {
    const React = await import('react');
    const SelectContext = React.createContext<{ onValueChange?: (value: string) => void }>({});

    return {
        Select: ({
            children,
            onValueChange,
        }: {
            children: any;
            onValueChange?: (value: string) => void;
        }) => (
            <SelectContext.Provider value={{ onValueChange }}>
                <div>{children}</div>
            </SelectContext.Provider>
        ),
        SelectTrigger: ({
            children,
            disabled,
        }: {
            children: any;
            disabled?: boolean;
        }) => (
            <button type="button" role="combobox" disabled={disabled}>
                {children}
            </button>
        ),
        SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
        SelectContent: ({ children }: { children: any }) => <div>{children}</div>,
        SelectItem: ({
            value,
            children,
        }: {
            value: string;
            children: any;
        }) => {
            const context = React.useContext(SelectContext);

            return (
                <button type="button" role="option" onClick={() => context.onValueChange?.(value)}>
                    {children}
                </button>
            );
        },
    };
});

describe('講師用問題印刷カード', () => {
    const mockRouter = {
        push: vi.fn(),
        refresh: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn(),
        replace: vi.fn(),
    };

    const mockOpen = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useRouter).mockReturnValue(mockRouter);
        vi.stubGlobal('open', mockOpen);
        getCoreProblemsForSubjectMock.mockResolvedValue({
            success: true,
            coreProblems: [],
        });
    });

    it('デスクトップでは PDF プレビュー付き URL を開く', async () => {
        mockOpen.mockReturnValue({ closed: false });

        render(
            <PrintProblemCard
                userId="student-1"
                subjects={[{ id: 'subject-1', name: '英語' }]}
            />
        );

        fireEvent.click(screen.getAllByRole('combobox')[0]);
        fireEvent.click(await screen.findByRole('option', { name: '英語' }));
        fireEvent.click(screen.getByRole('button', { name: 'プレビュー作成' }));

        await waitFor(() => {
            expect(mockOpen).toHaveBeenCalledTimes(1);
            const [url] = mockOpen.mock.calls[0];
            const parsed = new URL(url, 'http://localhost');
            expect(parsed.pathname).toBe('/teacher/students/student-1/print');
            expect(parsed.searchParams.get('subjectId')).toBe('subject-1');
            expect(parsed.searchParams.get('view')).toBe('pdf');
        });
    });
});
