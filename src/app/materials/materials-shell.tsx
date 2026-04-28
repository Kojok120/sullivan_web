'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { FileText, FolderTree, LogOut, Menu } from 'lucide-react';

import SullivanLogo from '@/assets/Sullivan-Logo.jpg';
import { logoutAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const baseNavItems = [
    { href: '/materials/core-problems', label: 'CoreProblem一覧', icon: FolderTree },
];

type ProblemSubject = {
    id: string;
    name: string;
};

type MaterialsShellProps = {
    children: React.ReactNode;
    problemSubjects: ProblemSubject[];
};

function MaterialsNavContent({
    pathname,
    activeSubjectId,
    problemSubjects,
    onNavigate,
}: {
    pathname: string;
    activeSubjectId: string | null;
    problemSubjects: ProblemSubject[];
    onNavigate?: () => void;
}) {
    return (
        <>
            {baseNavItems.map((item) => (
                <Button
                    key={item.href}
                    variant={pathname.startsWith(item.href) ? 'secondary' : 'ghost'}
                    className={cn('w-full min-h-11 justify-start', pathname.startsWith(item.href) && 'bg-accent')}
                    asChild
                    onClick={onNavigate}
                >
                    <Link href={item.href}>
                        <item.icon className="mr-2 h-4 w-4" />
                        {item.label}
                    </Link>
                </Button>
            ))}
            {problemSubjects.length > 0 && (
                <div className="px-3 pt-3 text-xs font-medium text-muted-foreground">
                    問題一覧
                </div>
            )}
            {problemSubjects.map((subject) => {
                const href = `/materials/problems?subjectId=${subject.id}`;
                const isActive = pathname.startsWith('/materials/problems') && activeSubjectId === subject.id;

                return (
                    <Button
                        key={href}
                        variant={isActive ? 'secondary' : 'ghost'}
                        className={cn('w-full min-h-11 justify-start', isActive && 'bg-accent')}
                        asChild
                        onClick={onNavigate}
                    >
                        <Link href={href}>
                            <FileText className="mr-2 h-4 w-4" />
                            {`問題一覧 - ${subject.name}`}
                        </Link>
                    </Button>
                );
            })}
        </>
    );
}

function MaterialsDesktopNav({
    pathname,
    activeSubjectId,
    problemSubjects,
}: {
    pathname: string;
    activeSubjectId: string | null;
    problemSubjects: ProblemSubject[];
}) {
    return (
        <div className="flex h-screen w-64 flex-col border-r bg-muted/40">
            <div className="border-b px-4 py-5">
                <Link href="/materials/core-problems" className="flex items-center gap-3">
                    <div className="relative h-10 w-40">
                        <Image
                            src={SullivanLogo}
                            alt="Sullivan Materials"
                            fill
                            className="object-contain object-left"
                            priority
                            placeholder="blur"
                        />
                    </div>
                </Link>
                <div className="mt-3 text-sm text-muted-foreground">
                    問題作成者向けの作問画面です。
                </div>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
                <MaterialsNavContent
                    pathname={pathname}
                    activeSubjectId={activeSubjectId}
                    problemSubjects={problemSubjects}
                />
            </div>

            <div className="border-t p-2">
                <form action={logoutAction}>
                    <Button
                        variant="ghost"
                        className="w-full min-h-11 justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
                        data-testid="materials-logout-button"
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        ログアウト
                    </Button>
                </form>
            </div>
        </div>
    );
}

function MaterialsMobileNav({
    pathname,
    activeSubjectId,
    problemSubjects,
}: {
    pathname: string;
    activeSubjectId: string | null;
    problemSubjects: ProblemSubject[];
}) {
    const [open, setOpen] = useState(false);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    data-testid="materials-mobile-nav-trigger"
                >
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">メニューを開く</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex h-dvh w-[85vw] max-w-[320px] flex-col p-0">
                <SheetHeader className="border-b px-4 py-4">
                    <SheetTitle className="sr-only">問題作成者メニュー</SheetTitle>
                    <div className="relative h-10 w-36">
                        <Image
                            src={SullivanLogo}
                            alt="Sullivan Materials"
                            fill
                            className="object-contain object-left"
                            priority
                            placeholder="blur"
                        />
                    </div>
                </SheetHeader>

                <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
                    <MaterialsNavContent
                        pathname={pathname}
                        activeSubjectId={activeSubjectId}
                        problemSubjects={problemSubjects}
                        onNavigate={() => setOpen(false)}
                    />
                </nav>

                <div className="border-t p-3">
                    <form action={logoutAction}>
                        <Button
                            variant="ghost"
                            className="w-full min-h-11 justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
                            data-testid="materials-mobile-logout-button"
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            ログアウト
                        </Button>
                    </form>
                </div>
            </SheetContent>
        </Sheet>
    );
}

export function MaterialsShell({ children, problemSubjects }: MaterialsShellProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const activeSubjectId = searchParams.get('subjectId');

    return (
        <div className="min-h-dvh bg-background">
            <div className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75 md:hidden">
                <div className="flex h-14 items-center justify-between px-3">
                    <MaterialsMobileNav
                        pathname={pathname}
                        activeSubjectId={activeSubjectId}
                        problemSubjects={problemSubjects}
                    />
                    <Link href="/materials/core-problems" className="flex items-center">
                        <div className="relative h-8 w-28">
                            <Image
                                src={SullivanLogo}
                                alt="Sullivan Materials"
                                fill
                                className="object-contain object-center"
                                priority
                                placeholder="blur"
                            />
                        </div>
                    </Link>
                    <form action={logoutAction}>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-red-600 hover:bg-red-50 hover:text-red-700"
                            data-testid="materials-mobile-top-logout-button"
                        >
                            <LogOut className="h-5 w-5" />
                            <span className="sr-only">ログアウト</span>
                        </Button>
                    </form>
                </div>
            </div>

            <div className="flex min-h-dvh flex-col md:flex-row">
                <aside className="hidden md:block md:w-64 md:flex-shrink-0">
                    <div className="fixed inset-y-0 z-50 w-64">
                        <MaterialsDesktopNav
                            pathname={pathname}
                            activeSubjectId={activeSubjectId}
                            problemSubjects={problemSubjects}
                        />
                    </div>
                </aside>
                <main className="min-w-0 flex-1 bg-background">
                    {children}
                </main>
            </div>
        </div>
    );
}
