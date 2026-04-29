import { notFound } from 'next/navigation';

import { prisma } from '@/lib/prisma';

import { GuidanceList } from '../guidance-list';

export default async function TeacherStudentGuidancePage({
    params,
}: {
    params: Promise<{ userId: string }>;
}) {
    const { userId } = await params;

    const student = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            guidanceRecords: {
                include: {
                    teacher: {
                        select: { name: true },
                    },
                },
                orderBy: { date: 'desc' },
            },
        },
    });

    if (!student) {
        notFound();
    }

    return <GuidanceList userId={userId} records={student.guidanceRecords} />;
}
