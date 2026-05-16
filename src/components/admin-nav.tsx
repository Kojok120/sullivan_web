"use client";

import Link from "next/link";
import Image from "next/image";
import SullivanLogo from "@/assets/Sullivan-Logo.jpg";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    LayoutDashboard,
    Users,
    BookOpen,
    LogOut,
    School,
    PanelLeftClose,
    PanelLeftOpen,
    Menu,
} from "lucide-react";
import { logoutAction } from "@/app/actions";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

const navItems = [
    {
        key: "dashboard",
        href: "/admin",
        icon: LayoutDashboard,
    },
    {
        key: "users",
        href: "/admin/users",
        icon: Users,
    },
    {
        key: "classrooms",
        href: "/admin/classrooms",
        icon: School,
    },
    {
        key: "curriculum",
        href: "/admin/curriculum",
        icon: BookOpen,
    },
    {
        key: "materials",
        href: "/materials/core-problems",
        icon: BookOpen,
    },

];

interface AdminNavProps {
    isCollapsed?: boolean;
    onToggle?: () => void;
    problemSubjects: {
        id: string;
        name: string;
    }[];
}

export function AdminNav({ isCollapsed = false, onToggle, problemSubjects }: AdminNavProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const activeSubjectId = searchParams.get("subjectId");
    const t = useTranslations("AdminNav");

    return (
        <div className={cn(
            "flex h-screen flex-col border-r bg-muted/40 transition-all duration-300",
            isCollapsed ? "w-16" : "w-64"
        )}>
            <div className={cn("flex items-center p-4", isCollapsed ? "justify-center" : "justify-between")}>
                {!isCollapsed && (
                    <div className="relative h-10 w-40">
                        <Image
                            src={SullivanLogo}
                            alt="Sullivan Admin"
                            fill
                            className="object-contain object-left"
                            priority
                        />
                    </div>
                )}
                {onToggle && (
                    <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8">
                        {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </Button>
                )}
            </div>

            <div className="flex-1 px-2 space-y-1 py-2">
                {navItems.map((item) => (
                    <Button
                        key={item.href}
                        variant={pathname === item.href ? "secondary" : "ghost"}
                        className={cn(
                            "w-full min-h-11",
                            isCollapsed ? "justify-center px-2" : "justify-start",
                            pathname === item.href && "bg-accent"
                        )}
                        asChild
                        title={isCollapsed ? t(`items.${item.key}`) : undefined}
                    >
                        <Link href={item.href}>
                            <item.icon className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
                            {!isCollapsed && <span>{t(`items.${item.key}`)}</span>}
                        </Link>
                    </Button>
                ))}
                {problemSubjects.length > 0 && !isCollapsed && (
                    <div className="px-3 pt-3 text-xs font-medium text-muted-foreground">
                        {t("problemList")}
                    </div>
                )}
                {problemSubjects.map((subject) => {
                    const href = `/admin/problems?subjectId=${subject.id}`;
                    const isActive = pathname.startsWith("/admin/problems") && activeSubjectId === subject.id;

                    return (
                        <Button
                            key={href}
                            variant={isActive ? "secondary" : "ghost"}
                            className={cn(
                                "w-full min-h-11",
                                isCollapsed ? "justify-center px-2" : "justify-start",
                                isActive && "bg-accent"
                            )}
                            asChild
                            title={isCollapsed ? t("problemListWithSubject", { subjectName: subject.name }) : undefined}
                        >
                            <Link href={href}>
                                {isCollapsed ? (
                                    <span className="text-xs font-semibold">{subject.name.slice(0, 1)}</span>
                                ) : (
                                    <>
                                        <BookOpen className="mr-2 h-4 w-4" />
                                        <span>{t("problemListWithSubject", { subjectName: subject.name })}</span>
                                    </>
                                )}
                            </Link>
                        </Button>
                    );
                })}
            </div>

            <div className="p-2 border-t space-y-2">
                <form action={logoutAction}>
                    <Button
                        variant="ghost"
                        className={cn(
                            "w-full min-h-11 text-red-600 hover:text-red-700 hover:bg-red-50",
                            isCollapsed ? "justify-center px-2" : "justify-start"
                        )}
                        title={isCollapsed ? t("logout") : undefined}
                        data-testid="admin-logout-button"
                    >
                        <LogOut className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
                        {!isCollapsed && <span>{t("logout")}</span>}
                    </Button>
                </form>
            </div>
        </div>
    );
}

export function AdminMobileNav({
    problemSubjects,
}: {
    problemSubjects: {
        id: string;
        name: string;
    }[];
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const activeSubjectId = searchParams.get("subjectId");
    const [open, setOpen] = useState(false);
    const t = useTranslations("AdminNav");

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    data-testid="admin-mobile-nav-trigger"
                >
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">{t("openMenu")}</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex h-dvh w-[85vw] max-w-[320px] flex-col p-0">
                <SheetHeader className="border-b px-4 py-4">
                    <SheetTitle className="sr-only">{t("menu")}</SheetTitle>
                    <div className="relative h-10 w-36">
                        <Image
                            src={SullivanLogo}
                            alt="Sullivan Admin"
                            fill
                            className="object-contain object-left"
                            priority
                        />
                    </div>
                </SheetHeader>
                <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = item.icon;
                        return (
                            <Button
                                key={item.href}
                                variant={isActive ? "secondary" : "ghost"}
                                className={cn("w-full min-h-11 justify-start", isActive && "bg-accent")}
                                asChild
                                onClick={() => setOpen(false)}
                            >
                                <Link href={item.href}>
                                    <Icon className="mr-2 h-4 w-4" />
                                    {t(`items.${item.key}`)}
                                </Link>
                            </Button>
                        );
                    })}
                    {problemSubjects.length > 0 && (
                        <div className="px-3 pt-3 text-xs font-medium text-muted-foreground">
                            {t("problemList")}
                        </div>
                    )}
                    {problemSubjects.map((subject) => {
                        const href = `/admin/problems?subjectId=${subject.id}`;
                        const isActive = pathname.startsWith("/admin/problems") && activeSubjectId === subject.id;

                        return (
                            <Button
                                key={href}
                                variant={isActive ? "secondary" : "ghost"}
                                className={cn("w-full min-h-11 justify-start", isActive && "bg-accent")}
                                asChild
                                onClick={() => setOpen(false)}
                            >
                                <Link href={href}>
                                    <BookOpen className="mr-2 h-4 w-4" />
                                    {t("problemListWithSubject", { subjectName: subject.name })}
                                </Link>
                            </Button>
                        );
                    })}
                </nav>
                <div className="border-t p-3">
                    <form action={logoutAction}>
                        <Button
                            variant="ghost"
                            className="w-full min-h-11 justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
                            data-testid="admin-mobile-logout-button"
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            {t("logout")}
                        </Button>
                    </form>
                </div>
            </SheetContent>
        </Sheet>
    );
}
