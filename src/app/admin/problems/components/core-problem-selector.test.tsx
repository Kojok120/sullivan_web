import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import jaMessages from '@/messages/ja.json';
import { CoreProblemSelector } from './core-problem-selector';

const { getProblemEditorContextMock } = vi.hoisted(() => ({
    getProblemEditorContextMock: vi.fn(),
}));

vi.mock('../actions', () => ({
    getProblemEditorContext: getProblemEditorContextMock,
}));

vi.mock('@/components/ui/select', async () => {
    const React = await import('react');
    const SelectContext = React.createContext<{ onValueChange?: (value: string) => void; disabled?: boolean }>({});

    return {
        Select: ({
            children,
            onValueChange,
            disabled,
        }: {
            children: ReactNode;
            onValueChange?: (value: string) => void;
            disabled?: boolean;
        }) => (
            <SelectContext.Provider value={{ onValueChange, disabled }}>
                <div>{children}</div>
            </SelectContext.Provider>
        ),
        SelectTrigger: ({
            children,
            disabled,
            className,
        }: {
            children: ReactNode;
            disabled?: boolean;
            className?: string;
        }) => {
            const context = React.useContext(SelectContext);

            return (
                <button
                    type="button"
                    role="combobox"
                    aria-controls="mock-select-content"
                    aria-expanded="false"
                    disabled={disabled ?? context.disabled}
                    className={className}
                >
                    {children}
                </button>
            );
        },
        SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
        SelectContent: ({ children }: { children: ReactNode }) => <div id="mock-select-content">{children}</div>,
        SelectGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
        SelectLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
        SelectItem: ({
            children,
            value,
            disabled,
        }: {
            children: ReactNode;
            value: string;
            disabled?: boolean;
        }) => {
            const context = React.useContext(SelectContext);

            return (
                <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    disabled={disabled}
                    onClick={() => context.onValueChange?.(value)}
                >
                    {children}
                </button>
            );
        },
    };
});

function renderWithIntl(ui: ReactNode) {
    return render(
        <NextIntlClientProvider locale="ja" messages={jaMessages}>
            {ui}
        </NextIntlClientProvider>,
    );
}

describe('CoreProblemSelector', () => {
    const subjects = [
        { id: 'subject-math', name: '数学' },
        { id: 'subject-english', name: '英語' },
    ];

    const coreProblems = [
        { id: 'core-1', name: '一次方程式', subjectId: 'subject-math', subject: { name: '数学' } },
        { id: 'core-2', name: '連立方程式', subjectId: 'subject-math', subject: { name: '数学' } },
        { id: 'core-3', name: '現在完了', subjectId: 'subject-english', subject: { name: '英語' } },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        getProblemEditorContextMock.mockResolvedValue({
            subjects: [],
            coreProblems: [],
        });
    });

    it('科目未選択時は単元セレクタを無効化する', () => {
        renderWithIntl(
            <CoreProblemSelector
                selected={[]}
                onChange={vi.fn()}
                subjectId={null}
                subjects={subjects}
                coreProblems={coreProblems}
            />,
        );

        expect(screen.getByRole('combobox')).toBeDisabled();
        expect(screen.getByText('先に科目を選択してください')).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: '一次方程式' })).not.toBeInTheDocument();
    });

    it('選択した科目の単元だけを表示する', () => {
        const handleChange = vi.fn();

        renderWithIntl(
            <CoreProblemSelector
                selected={[]}
                onChange={handleChange}
                subjectId="subject-math"
                subjects={subjects}
                coreProblems={coreProblems}
            />,
        );

        expect(screen.getByRole('combobox')).toBeEnabled();
        expect(screen.getByRole('option', { name: '一次方程式' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '連立方程式' })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: '現在完了' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('option', { name: '一次方程式' }));

        expect(handleChange).toHaveBeenCalledWith([
            {
                id: 'core-1',
                name: '一次方程式',
                subjectId: 'subject-math',
                subject: { name: '数学' },
            },
        ]);
    });

    it('科目指定がない既存用途では全科目の単元を表示する', () => {
        renderWithIntl(
            <CoreProblemSelector
                selected={[]}
                onChange={vi.fn()}
                subjects={subjects}
                coreProblems={coreProblems}
            />,
        );

        expect(screen.getByRole('combobox')).toBeEnabled();
        expect(screen.getByRole('option', { name: '一次方程式' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '現在完了' })).toBeInTheDocument();
    });
});
