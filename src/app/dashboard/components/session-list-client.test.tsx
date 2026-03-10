import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SessionListClient } from './session-list-client';

const { fetchUserSessionsMock, markSessionReviewedMock } = vi.hoisted(() => ({
    fetchUserSessionsMock: vi.fn(),
    markSessionReviewedMock: vi.fn(),
}));

vi.mock('@/app/actions', () => ({
    fetchUserSessions: fetchUserSessionsMock,
    markSessionReviewed: markSessionReviewedMock,
}));

vi.mock('next/link', () => ({
    default: ({ children, href, onClick }: { children: ReactNode; href: string; onClick?: () => void }) => (
        <a href={href} onClick={onClick}>
            {children}
        </a>
    ),
}));

vi.mock('@/components/ui/card', () => ({
    Card: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
    CardHeader: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
    CardTitle: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
        <button type="button" onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
}));

vi.mock('@/components/ui/date-display', () => ({
    DateDisplay: ({ date }: { date: Date }) => <span>{date.toISOString()}</span>,
}));

vi.mock('@/components/ui/badge', () => ({
    Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/switch', () => ({
    Switch: ({
        id,
        checked,
        onCheckedChange,
    }: {
        id: string;
        checked: boolean;
        onCheckedChange: (checked: boolean) => void;
    }) => (
        <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(event) => onCheckedChange(event.target.checked)}
        />
    ),
}));

vi.mock('@/components/ui/label', () => ({
    Label: ({
        children,
        htmlFor,
        className,
    }: {
        children: ReactNode;
        htmlFor: string;
        className?: string;
    }) => (
        <label htmlFor={htmlFor} className={className}>
            {children}
        </label>
    ),
}));

describe('SessionListClient', () => {
    const initialSessions = [
        {
            groupId: 'group-1',
            date: new Date('2026-03-10T00:00:00Z'),
            subjectName: '数学',
            totalProblems: 5,
            correctCount: 3,
            hasUnread: true,
            unwatchedMistakeCount: 2,
        },
    ];

    it('動画未視聴フィルタ文言と空状態文言を表示する', async () => {
        fetchUserSessionsMock.mockResolvedValueOnce([]);

        render(
            <SessionListClient
                initialSessions={initialSessions}
                userId="user-1"
                basePath="/dashboard/history"
            />
        );

        expect(screen.getByText('解説動画未視聴のみ表示')).toBeTruthy();

        fireEvent.click(screen.getByRole('checkbox'));

        await waitFor(() => {
            expect(fetchUserSessionsMock).toHaveBeenCalledWith(0, 10, { onlyPendingVideoReview: true }, 'user-1');
        });

        expect(screen.getByText(/解説動画未視聴のセッションはありません/)).toBeTruthy();
    });

    it('セッションリンクのクリックでは既読 action を呼ばない', () => {
        render(
            <SessionListClient
                initialSessions={initialSessions}
                userId="user-1"
                basePath="/dashboard/history"
            />
        );

        fireEvent.click(screen.getByRole('link'));

        expect(markSessionReviewedMock).not.toHaveBeenCalled();
    });
});
