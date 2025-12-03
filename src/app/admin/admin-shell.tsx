'use client';

import { useState, useEffect } from 'react';
import { AdminNav } from '@/components/admin-nav';
import { cn } from '@/lib/utils';

export function AdminShell({ children }: { children: React.ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        const saved = localStorage.getItem('admin-sidebar-collapsed');
        if (saved) {
            setIsCollapsed(saved === 'true');
        }
    }, []);

    const toggleSidebar = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem('admin-sidebar-collapsed', String(newState));
    };

    if (!isMounted) {
        return (
            <div className="flex min-h-screen flex-col md:flex-row">
                <aside className="hidden md:block w-64 flex-shrink-0">
                    <div className="fixed inset-y-0 z-50 w-64">
                        <AdminNav />
                    </div>
                </aside>
                <main className="flex-1 bg-gray-50">
                    {children}
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col md:flex-row">
            <aside className={cn(
                "hidden md:block flex-shrink-0 transition-all duration-300",
                isCollapsed ? "w-16" : "w-64"
            )}>
                <div className={cn(
                    "fixed inset-y-0 z-50 transition-all duration-300",
                    isCollapsed ? "w-16" : "w-64"
                )}>
                    <AdminNav isCollapsed={isCollapsed} onToggle={toggleSidebar} />
                </div>
            </aside>
            <main className="flex-1 bg-gray-50 transition-all duration-300">
                {children}
            </main>
        </div>
    );
}
