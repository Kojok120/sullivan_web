import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import jaMessages from '@/messages/ja.json';
import { ProblemManager } from './problem-manager';

const { pushMock, useSearchParamsMock } = vi.hoisted(() => ({
    pushMock: vi.fn(),
    useSearchParamsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock }),
    useSearchParams: useSearchParamsMock,
}));

vi.mock('./components/problem-list', () => ({
    ProblemList: () => <div>problem-list</div>,
}));

vi.mock('./components/problem-bulk-import', () => ({
    BulkImportDialog: () => null,
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

function createSearchParams(value: string) {
    const params = new URLSearchParams(value);

    return {
        get: (key: string) => params.get(key),
        toString: () => params.toString(),
    };
}

function renderWithIntl(ui: ReactNode) {
    return render(
        <NextIntlClientProvider locale="ja" messages={jaMessages}>
            {ui}
        </NextIntlClientProvider>,
    );
}

describe('ProblemManager', () => {
    const subjects = [
        {
            id: 'subject-math',
            name: '数学',
            coreProblems: [
                { id: 'core-1', name: '一次方程式', masterNumber: 1 },
                { id: 'core-2', name: '連立方程式', masterNumber: 2 },
            ],
        },
        {
            id: 'subject-english',
            name: '英語',
            coreProblems: [
                { id: 'core-3', name: '現在完了', masterNumber: 1 },
            ],
        },
    ];
    const currentSubject = subjects[0];

    beforeEach(() => {
        vi.clearAllMocks();
        useSearchParamsMock.mockReturnValue(createSearchParams('subjectId=subject-math'));
    });

    it('科目プルダウンを表示せず現在教科の単元だけを候補表示する', () => {
        renderWithIntl(
            <ProblemManager
                initialProblems={[]}
                totalCount={0}
                currentPage={1}
                initialQuery=""
                sortBy="updatedAt"
                sortOrder="desc"
                subjects={subjects}
                currentSubject={currentSubject}
            />,
        );

        expect(screen.queryByRole('option', { name: '数学' })).not.toBeInTheDocument();
        expect(screen.getByRole('option', { name: '#1 一次方程式' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '#2 連立方程式' })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: '#1 現在完了' })).not.toBeInTheDocument();
    });

    it('単元変更時はcoreProblemIdを更新して1ページ目へ戻す', () => {
        useSearchParamsMock.mockReturnValue(createSearchParams('subjectId=subject-math&page=3'));
        renderWithIntl(
            <ProblemManager
                initialProblems={[]}
                totalCount={0}
                currentPage={3}
                initialQuery=""
                sortBy="updatedAt"
                sortOrder="desc"
                subjects={subjects}
                currentSubject={currentSubject}
                routeBase="/materials/problems"
                viewMode="author"
            />,
        );

        fireEvent.click(screen.getByRole('option', { name: '#1 一次方程式' }));

        expect(pushMock).toHaveBeenCalledWith('/materials/problems?subjectId=subject-math&page=1&coreProblemId=core-1');
    });

    it('新規作成リンクに現在教科のsubjectIdを引き継ぐ', () => {
        renderWithIntl(
            <ProblemManager
                initialProblems={[]}
                totalCount={0}
                currentPage={1}
                initialQuery=""
                sortBy="updatedAt"
                sortOrder="desc"
                subjects={subjects}
                currentSubject={currentSubject}
            />,
        );

        expect(screen.getByRole('link', { name: '問題を作成' })).toHaveAttribute(
            'href',
            '/admin/problems/new?subjectId=subject-math',
        );
    });

    it('問題作成者向け画面でも動画ステータスでフィルターできる', () => {
        useSearchParamsMock.mockReturnValue(createSearchParams('subjectId=subject-math'));

        renderWithIntl(
            <ProblemManager
                initialProblems={[]}
                totalCount={0}
                currentPage={1}
                initialQuery=""
                sortBy="updatedAt"
                sortOrder="desc"
                subjects={subjects}
                currentSubject={currentSubject}
                routeBase="/materials/problems"
                viewMode="author"
            />,
        );

        fireEvent.click(screen.getByRole('option', { name: '撮影完了' }));

        expect(pushMock).toHaveBeenCalledWith('/materials/problems?subjectId=subject-math&videoStatus=SHOT&page=1');
    });

    it('英語の管理画面では英語シート一括登録ボタンを表示する', () => {
        renderWithIntl(
            <ProblemManager
                initialProblems={[]}
                totalCount={0}
                currentPage={1}
                initialQuery=""
                sortBy="updatedAt"
                sortOrder="desc"
                subjects={subjects}
                currentSubject={subjects[1]}
                showBulkImport
                bulkImportLabel="英語シート一括登録"
            />,
        );

        expect(screen.getByRole('button', { name: '英語シート一括登録' })).toBeInTheDocument();
    });

    it('英語の作成者画面でも英語シート一括登録ボタンを表示する', () => {
        renderWithIntl(
            <ProblemManager
                initialProblems={[]}
                totalCount={0}
                currentPage={1}
                initialQuery=""
                sortBy="updatedAt"
                sortOrder="desc"
                subjects={subjects}
                currentSubject={subjects[1]}
                routeBase="/materials/problems"
                viewMode="author"
                showBulkImport
                bulkImportLabel="英語シート一括登録"
            />,
        );

        expect(screen.getByRole('button', { name: '英語シート一括登録' })).toBeInTheDocument();
    });

    it('英語以外の作成者画面では一括登録ボタンを表示しない', () => {
        renderWithIntl(
            <ProblemManager
                initialProblems={[]}
                totalCount={0}
                currentPage={1}
                initialQuery=""
                sortBy="updatedAt"
                sortOrder="desc"
                subjects={subjects}
                currentSubject={currentSubject}
                routeBase="/materials/problems"
                viewMode="author"
                showBulkImport={false}
            />,
        );

        expect(screen.queryByRole('button', { name: '一括登録' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '英語シート一括登録' })).not.toBeInTheDocument();
    });

    it('マスタNo非表示時は検索プレースホルダからマスタNoを除外する', () => {
        renderWithIntl(
            <ProblemManager
                initialProblems={[]}
                totalCount={0}
                currentPage={1}
                initialQuery=""
                sortBy="updatedAt"
                sortOrder="desc"
                subjects={subjects}
                currentSubject={currentSubject}
                showMasterNumber={false}
            />,
        );

        expect(screen.getByPlaceholderText('問題文、解答、ID、単元名で検索...')).toBeInTheDocument();
    });
});
