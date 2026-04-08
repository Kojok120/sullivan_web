'use client';

import Link from 'next/link';
import Image from 'next/image';

import SullivanLogo from '@/assets/Sullivan-Logo.jpg';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileText, FolderTree, LogOut } from 'lucide-react';
import { logoutAction } from '@/app/actions';
import { usePathname, useSearchParams } from 'next/navigation';

const baseNavItems = [
    { href: '/materials/core-problems', label: 'CoreProblem一覧', icon: FolderTree },
];

type MaterialsShellProps = {
    children: React.ReactNode;
    problemSubjects: {
        id: string;
        name: string;
    }[];
};

export function MaterialsShell({ children, problemSubjects }: MaterialsShellProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const activeSubjectId = searchParams.get('subjectId');

    return (
        <div className="min-h-dvh bg-slate-50">
            <div className="flex min-h-dvh flex-col md:flex-row">
                <aside className="flex w-full flex-col border-b bg-white md:min-h-dvh md:w-64 md:border-b-0 md:border-r">
                    <div className="border-b px-4 py-5">
                        <Link href="/materials/core-problems" className="flex items-center gap-3">
                            <div className="relative h-9 w-32">
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
                    <nav className="space-y-1 p-3">
                        {baseNavItems.map((item) => (
                            <Button
                                key={item.href}
                                variant={pathname.startsWith(item.href) ? 'secondary' : 'ghost'}
                                className={cn('w-full justify-start', pathname.startsWith(item.href) && 'bg-slate-100')}
                                asChild
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
                                    className={cn('w-full justify-start', isActive && 'bg-slate-100')}
                                    asChild
                                >
                                    <Link href={href}>
                                        <FileText className="mr-2 h-4 w-4" />
                                        {`問題一覧 - ${subject.name}`}
                                    </Link>
                                </Button>
                            );
                        })}
                    </nav>
                    <div className="mt-auto border-t p-3">
                        <form action={logoutAction}>
                            <Button variant="ghost" className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700">
                                <LogOut className="mr-2 h-4 w-4" />
                                ログアウト
                            </Button>
                        </form>
                    </div>
                </aside>
                <main className="min-w-0 flex-1">{children}</main>
            </div>
        </div>
    );
}
