"use client";

import Link from "next/link";
import Image from "next/image";
import SullivanLogo from "@/assets/Sullivan-Logo.jpg";
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
    School,
    PanelLeftClose,
    PanelLeftOpen
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
        title: "教室管理",
        href: "/admin/classrooms",
        icon: School,
    },
    {
        title: "カリキュラム管理",
        href: "/admin/curriculum",
        icon: BookOpen,
    },
    {
        title: "問題管理",
        href: "/admin/problems",
        icon: BookOpen, // Or another icon like FileText
    },

];

interface AdminNavProps {
    isCollapsed?: boolean;
    onToggle?: () => void;
}

export function AdminNav({ isCollapsed = false, onToggle }: AdminNavProps) {
    const pathname = usePathname();

    return (
        <div className={cn(
            "flex h-screen flex-col border-r bg-gray-100/40 transition-all duration-300",
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
                            placeholder="blur"
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
                            "w-full",
                            isCollapsed ? "justify-center px-2" : "justify-start",
                            pathname === item.href && "bg-gray-200"
                        )}
                        asChild
                        title={isCollapsed ? item.title : undefined}
                    >
                        <Link href={item.href}>
                            <item.icon className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
                            {!isCollapsed && <span>{item.title}</span>}
                        </Link>
                    </Button>
                ))}
            </div>

            <div className="p-2 border-t space-y-2">
                <form action={logoutAction}>
                    <Button
                        variant="ghost"
                        className={cn(
                            "w-full text-red-600 hover:text-red-700 hover:bg-red-50",
                            isCollapsed ? "justify-center px-2" : "justify-start"
                        )}
                        title={isCollapsed ? "ログアウト" : undefined}
                    >
                        <LogOut className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
                        {!isCollapsed && <span>ログアウト</span>}
                    </Button>
                </form>
            </div>
        </div>
    );
}
