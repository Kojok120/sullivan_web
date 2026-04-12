import { MaterialsShell } from './materials-shell';
import { getProblemNavSubjects } from '@/app/admin/problems/actions';

export const dynamic = 'force-dynamic';

export default async function MaterialsLayout({
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

    return <MaterialsShell problemSubjects={problemSubjects}>{children}</MaterialsShell>;
}
