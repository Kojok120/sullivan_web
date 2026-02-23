import { prisma } from '@/lib/prisma';
import { RegisterForm } from './register-form';

export const dynamic = 'force-dynamic';

export default async function RegisterUserPage() {
    // Fetch all classrooms with their groups
    const classrooms = await prisma.classroom.findMany({
        select: {
            id: true,
            name: true,
            plan: true,
            groups: true,
        },
        orderBy: { name: 'asc' },
    });

    // Also get all distinct groups in case we need a fallback or for other roles if ever needed
    // The previous logic in user-list.tsx flattened them. We can do the same here or just pass the classrooms.
    // However, RegisterForm.tsx expects `allGroups`.

    // Flatten all groups from classrooms to get a list of all unique groups
    const allGroupsSet = new Set<string>();
    classrooms.forEach(c => c.groups.forEach(g => allGroupsSet.add(g)));
    const allGroups = Array.from(allGroupsSet).map(g => ({ id: g, name: g })).sort((a, b) => a.name.localeCompare(b.name));

    return (
        <RegisterForm
            classrooms={classrooms}
            allGroups={allGroups}
        />
    );
}
