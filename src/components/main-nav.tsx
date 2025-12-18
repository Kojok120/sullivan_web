"use client";

import Link from "next/link";
import Image from "next/image";
import SullivanLogo from "@/assets/Sullivan-Logo.jpg";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, BookOpen } from "lucide-react";
import { logoutAction } from "@/app/actions";

export function MainNav({ role }: { role?: string }) {
    const pathname = usePathname();

    // Do not render on admin pages or login/signup pages
    if (pathname.startsWith("/admin") || pathname.startsWith("/login") || pathname.startsWith("/signup")) {
        return null;
    }

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="container flex h-14 items-center justify-between">
                <div className="flex items-center gap-6">
                    <Link href={role === 'TEACHER' ? "/teacher" : "/"} className="flex items-center space-x-2">
                        <div className="relative h-10 w-40">
                            <Image
                                src={SullivanLogo}
                                alt="Sullivan Learning"
                                fill
                                className="object-contain object-left"
                                priority
                                placeholder="blur"
                            />
                        </div>
                    </Link>
                    <nav className="flex items-center gap-4 text-sm font-medium">
                        {role !== 'TEACHER' && (
                            <>
                                <Link
                                    href="/"
                                    className={pathname === "/" ? "text-foreground" : "text-foreground/60 transition-colors hover:text-foreground"}
                                >
                                    ホーム
                                </Link>
                                <Link
                                    href="/dashboard"
                                    className={pathname === "/dashboard" ? "text-foreground" : "text-foreground/60 transition-colors hover:text-foreground"}
                                >
                                    ダッシュボード
                                </Link>
                            </>
                        )}
                        {(role === 'TEACHER' || role === 'ADMIN') && (
                            <Link
                                href="/teacher"
                                className={pathname.startsWith("/teacher") ? "text-foreground" : "text-foreground/60 transition-colors hover:text-foreground"}
                            >
                                講師用
                            </Link>
                        )}
                    </nav>
                </div>
                <div className="flex items-center gap-4">
                    <form action={logoutAction}>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                            <LogOut className="mr-2 h-4 w-4" />
                            ログアウト
                        </Button>
                    </form>
                </div>
            </div>
        </header>
    );
}
