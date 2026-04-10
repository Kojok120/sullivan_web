import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MaterialsShell } from './materials-shell';

const { usePathnameMock, useSearchParamsMock } = vi.hoisted(() => ({
    usePathnameMock: vi.fn(),
    useSearchParamsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    usePathname: usePathnameMock,
    useSearchParams: useSearchParamsMock,
}));

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: ComponentProps<'a'>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock('next/image', () => ({
    default: (props: ComponentProps<'img'> & { fill?: boolean; priority?: boolean; placeholder?: string }) => {
        const sanitizedProps = { ...props };
        delete sanitizedProps.fill;
        delete sanitizedProps.priority;
        delete sanitizedProps.placeholder;

        // eslint-disable-next-line @next/next/no-img-element
        return <img {...sanitizedProps} alt={props.alt ?? ''} />;
    },
}));

vi.mock('@/app/actions', () => ({
    logoutAction: vi.fn(),
}));

describe('MaterialsShell', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        usePathnameMock.mockReturnValue('/materials/problems');
        useSearchParamsMock.mockReturnValue(new URLSearchParams('subjectId=subject-1'));
    });

    it('問題作成者向け画面でログアウト導線を常に表示する', () => {
        render(
            <MaterialsShell problemSubjects={[{ id: 'subject-1', name: '数学' }]}>
                <div>content</div>
            </MaterialsShell>,
        );

        expect(screen.getByTestId('materials-mobile-top-logout-button')).toBeInTheDocument();
        expect(screen.getByTestId('materials-sidebar-logout-button')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '問題一覧 - 数学' })).toHaveAttribute(
            'href',
            '/materials/problems?subjectId=subject-1',
        );
    });
});
