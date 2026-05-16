'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

type StudentDetailTab = {
    href: (userId: string) => string;
    isActive: (pathname: string, basePath: string) => boolean;
    labelKey: 'dashboard' | 'goals' | 'history' | 'guidance' | 'profile';
};

const STUDENT_DETAIL_TABS: StudentDetailTab[] = [
    {
        href: (userId) => `/teacher/students/${userId}`,
        isActive: (pathname, basePath) => pathname === basePath,
        labelKey: 'dashboard',
    },
    {
        href: (userId) => `/teacher/students/${userId}/goals`,
        isActive: (pathname, basePath) => pathname === `${basePath}/goals`,
        labelKey: 'goals',
    },
    {
        href: (userId) => `/teacher/students/${userId}/history`,
        isActive: (pathname, basePath) =>
            pathname === `${basePath}/history` || pathname.startsWith(`${basePath}/history/`),
        labelKey: 'history',
    },
    {
        href: (userId) => `/teacher/students/${userId}/guidance`,
        isActive: (pathname, basePath) => pathname === `${basePath}/guidance`,
        labelKey: 'guidance',
    },
    {
        href: (userId) => `/teacher/students/${userId}/profile`,
        isActive: (pathname, basePath) => pathname === `${basePath}/profile`,
        labelKey: 'profile',
    },
];

function trimTrailingSlash(pathname: string) {
    if (pathname.length > 1 && pathname.endsWith('/')) {
        return pathname.slice(0, -1);
    }

    return pathname;
}

export function StudentDetailTabs({ userId }: { userId: string }) {
    const t = useTranslations('StudentDetailTabs');
    const pathname = trimTrailingSlash(usePathname());
    const basePath = `/teacher/students/${userId}`;

    return (
        <div className="overflow-x-auto pb-1">
            <nav className="inline-flex h-10 min-w-full items-center rounded-md bg-muted p-1 text-muted-foreground sm:min-w-0">
                {STUDENT_DETAIL_TABS.map((tab) => {
                    const href = tab.href(userId);
                    const isActive = tab.isActive(pathname, basePath);

                    return (
                        <Link
                            key={href}
                            href={href}
                            prefetch={false}
                            scroll={false}
                            className={cn(
                                'inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
                                isActive
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t(tab.labelKey)}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
