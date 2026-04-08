import { AdminShell } from './admin-shell';
import { getProblemNavSubjects } from './problems/actions';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const subjectsResult = await getProblemNavSubjects();
    const problemSubjects = subjectsResult.success && subjectsResult.subjects
        ? subjectsResult.subjects.map((subject) => ({
            id: subject.id,
            name: subject.name,
        }))
        : [];

    return (
        <AdminShell problemSubjects={problemSubjects}>
            {children}
        </AdminShell>
    );
}
