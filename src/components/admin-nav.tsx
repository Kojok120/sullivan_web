"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    LayoutDashboard,
    Users,
    BookOpen,
    Video,
    Settings,
    LogOut,
    ArrowLeft
} from "lucide-react";
import { logoutAction } from "@/app/actions";

const navItems = [
    {
        title: "ダッシュボード",
        href: "/admin",
        icon: LayoutDashboard,
    },
    {
        title: "ユーザー管理",
        href: "/admin/users",
        icon: Users,
    },
    {
        title: "カリキュラム管理",
        href: "/admin/curriculum",
        icon: BookOpen,
    },
    {
        title: "コンテンツ管理",
        href: "/admin/content",
        icon: Video,
    },
    {
        title: "システム設定",
        href: "/admin/settings",
        icon: Settings,
    },
];

export function AdminNav() {
    const pathname = usePathname();

    return (
        <div className="flex h-screen w-64 flex-col border-r bg-gray-100/40">
            <div className="p-6">
                <h2 className="text-lg font-semibold tracking-tight">
                    Sullivan Admin
                </h2>
            </div>
            <div className="flex-1 px-4 space-y-1">
                {navItems.map((item) => (
                    <Button
                        key={item.href}
                        variant={pathname === item.href ? "secondary" : "ghost"}
                        className={cn(
                            "w-full justify-start",
                            pathname === item.href && "bg-gray-200"
                        )}
                        asChild
                    >
                        <Link href={item.href}>
                            <item.icon className="mr-2 h-4 w-4" />
                            {item.title}
                        </Link>
                    </Button>
                ))}
            </div>
            <div className="p-4 border-t space-y-2">
                <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href="/">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        学習画面へ戻る
                    </Link>
                </Button>
                <form action={logoutAction}>
                    <Button variant="ghost" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50">
                        <LogOut className="mr-2 h-4 w-4" />
                        ログアウト
                    </Button>
                </form>
            </div>
        </div>
    );
}
