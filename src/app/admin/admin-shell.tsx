'use client';

import { useState } from 'react';
import { AdminNav } from '@/components/admin-nav';
import { cn } from '@/lib/utils';

export function AdminShell({ children }: { children: React.ReactNode }) {
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
