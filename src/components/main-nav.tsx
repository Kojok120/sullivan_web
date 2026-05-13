"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import SullivanLogo from "@/assets/Sullivan-Logo.jpg";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, Menu } from "lucide-react";
import { logoutAction } from "@/app/actions";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function MainNav({ role }: { role?: string }) {
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const isTeacherRole = role === 'TEACHER' || role === 'HEAD_TEACHER';
    const isAdmin = role === 'ADMIN';
    const isTeacherDashboardActive = pathname === '/teacher' || pathname.startsWith('/teacher/students');

    // Do not render on admin/materials pages or login/signup pages
    if (
        pathname.startsWith("/admin")
        || pathname.startsWith("/materials")
        || pathname.startsWith("/login")
        || pathname.startsWith("/signup")
        || role === 'MATERIAL_AUTHOR'
    ) {
        return null;
    }

    const navLinks = !isTeacherRole
        ? [
            { href: "/", label: "ホーム", active: pathname === "/" },
            { href: "/unit-focus", label: "単元集中", active: pathname.startsWith("/unit-focus") },
            { href: "/dashboard", label: "ダッシュボード", active: pathname === "/dashboard" },
            ...(role === 'STUDENT' ? [{ href: "/ranking", label: "ランキング", active: pathname.startsWith("/ranking") }] : []),
            { href: "/achievements", label: "実績", active: pathname === "/achievements" },
            ...(isAdmin
                ? [
                    { href: "/teacher", label: "講師用", active: isTeacherDashboardActive },
                    { href: "/teacher/ranking", label: "ランキング", active: pathname.startsWith("/teacher/ranking") },
                ]
                : []),
        ]
        : [
            { href: "/teacher", label: "講師用", active: isTeacherDashboardActive },
            { href: "/teacher/ranking", label: "ランキング", active: pathname.startsWith("/teacher/ranking") },
        ];

    const linkClass = (isActive: boolean) =>
        isActive
            ? "text-foreground"
            : "text-foreground/60 transition-colors hover:text-foreground";

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="container flex h-14 items-center justify-between">
                <div className="flex items-center gap-3 md:gap-6">
                    <Link href={isTeacherRole ? "/teacher" : "/"} className="flex items-center space-x-2">
                        <div className="relative h-9 w-32 md:h-10 md:w-40">
                            <Image
                                src={SullivanLogo}
                                alt="Sullivan"
                                fill
                                className="object-contain object-left"
                                priority
                            />
                        </div>
                    </Link>
                    <nav className="hidden items-center gap-4 text-sm font-medium md:flex">
                        {navLinks.map((link) => (
                            <Link key={link.href} href={link.href} className={linkClass(link.active)}>
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                </div>

                <div className="hidden items-center gap-4 md:flex">
                    <Link href="/settings" className="text-sm font-medium text-foreground/60 transition-colors hover:text-foreground">
                        設定
                    </Link>
                    <form action={logoutAction}>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 text-red-600 hover:bg-red-50 hover:text-red-700"
                            data-testid="main-nav-logout-button"
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            ログアウト
                        </Button>
                    </form>
                </div>

                <div className="md:hidden">
                    <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                        <SheetTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11"
                                data-testid="mobile-nav-trigger"
                            >
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">メニューを開く</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="flex h-dvh w-[85vw] max-w-[320px] flex-col p-0">
                            <SheetHeader className="border-b px-4 py-4">
                                <SheetTitle className="sr-only">メニュー</SheetTitle>
                                <div className="relative h-9 w-32">
                                    <Image
                                        src={SullivanLogo}
                                        alt="Sullivan"
                                        fill
                                        className="object-contain object-left"
                                        priority
                                    />
                                </div>
                            </SheetHeader>
                            <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
                                {navLinks.map((link) => (
                                    <Button
                                        key={link.href}
                                        variant={link.active ? "secondary" : "ghost"}
                                        className={cn("w-full min-h-11 justify-start", link.active && "bg-accent")}
                                        asChild
                                        onClick={() => setMobileMenuOpen(false)}
                                    >
                                        <Link href={link.href}>{link.label}</Link>
                                    </Button>
                                ))}
                                <Button
                                    variant={pathname.startsWith("/settings") ? "secondary" : "ghost"}
                                    className={cn(
                                        "w-full min-h-11 justify-start",
                                        pathname.startsWith("/settings") && "bg-accent"
                                    )}
                                    asChild
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    <Link href="/settings">設定</Link>
                                </Button>
                            </nav>
                            <div className="border-t p-3">
                                <form action={logoutAction}>
                                    <Button
                                        variant="ghost"
                                        className="w-full min-h-11 justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
                                        data-testid="mobile-nav-logout-button"
                                    >
                                        <LogOut className="mr-2 h-4 w-4" />
                                        ログアウト
                                    </Button>
                                </form>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </header>
    );
}
