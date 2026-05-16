import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getGoalDailyViewPayload } from '@/lib/student-goal-service';
import { TeacherGoalManagementCard } from '@/components/goals/teacher-goal-management-card';

export default async function TeacherStudentGoalsPage({
    params,
}: {
    params: Promise<{ userId: string }>;
}) {
    const { userId } = await params;
    const session = await getSession();
    if (!session) redirect('/login');

    const [subjects, goalData] = await Promise.all([
        prisma.subject.findMany({
            where: { packId: session.defaultPackId },
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
            select: { id: true, name: true },
        }),
        getGoalDailyViewPayload({ studentId: userId }),
    ]);

    return (
        <TeacherGoalManagementCard
            studentId={userId}
            subjects={subjects}
            initialData={goalData}
        />
    );
}
