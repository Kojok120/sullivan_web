'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import SullivanLogo from '@/assets/Sullivan-Logo.jpg';
import { LogOut } from 'lucide-react';
import { AdminNav, AdminMobileNav } from '@/components/admin-nav';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { logoutAction } from '@/app/actions';

type AdminShellProps = {
    children: React.ReactNode;
    problemSubjects: {
        id: string;
        name: string;
    }[];
};

export function AdminShell({ children, problemSubjects }: AdminShellProps) {
    const t = useTranslations('CommonShell');
    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('admin-sidebar-collapsed') === 'true';
    });

    const toggleSidebar = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem('admin-sidebar-collapsed', String(newState));
    };

    return (
        <div className="min-h-dvh bg-background">
            <div className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75 md:hidden">
                <div className="flex h-14 items-center justify-between px-3">
                    <AdminMobileNav problemSubjects={problemSubjects} />
                    <Link href="/admin" className="flex items-center">
                        <div className="relative h-8 w-28">
                            <Image
                                src={SullivanLogo}
                                alt="Sullivan Admin"
                                fill
                                className="object-contain object-center"
                                priority
                            />
                        </div>
                    </Link>
                    <form action={logoutAction}>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-red-600 hover:bg-red-50 hover:text-red-700"
                            data-testid="admin-mobile-top-logout-button"
                        >
                            <LogOut className="h-5 w-5" />
                            <span className="sr-only">{t('logout')}</span>
                        </Button>
                    </form>
                </div>
            </div>
            <div className="flex min-h-dvh flex-col md:flex-row">
                <aside
                    className={cn(
                        'hidden md:block flex-shrink-0 transition-all duration-300',
                        isCollapsed ? 'w-16' : 'w-64'
                    )}
                >
                    <div
                        className={cn(
                            'fixed inset-y-0 z-50 transition-all duration-300',
                            isCollapsed ? 'w-16' : 'w-64'
                        )}
                    >
                        <AdminNav
                            isCollapsed={isCollapsed}
                            onToggle={toggleSidebar}
                            problemSubjects={problemSubjects}
                        />
                    </div>
                </aside>
                <main className="min-w-0 flex-1 bg-background transition-all duration-300">
                    {children}
                </main>
            </div>
        </div>
    );
}
