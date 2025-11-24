import { AdminNav } from "@/components/admin-nav";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
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
