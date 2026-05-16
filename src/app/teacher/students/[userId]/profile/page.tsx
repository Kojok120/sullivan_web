import { notFound, redirect } from 'next/navigation';

import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import { ProfileCard } from '../profile-card';

export default async function TeacherStudentProfilePage({
    params,
}: {
    params: Promise<{ userId: string }>;
}) {
    const { userId } = await params;
    const session = await getSession();
    if (!session) redirect('/login');

    const [student, classrooms] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: {
                bio: true,
                notes: true,
                birthday: true,
                classroomId: true,
                group: true,
                school: true,
                phoneNumber: true,
                email: true,
            },
        }),
        prisma.classroom.findMany({
            where: { packId: session.defaultPackId },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                name: true,
                plan: true,
                groups: true,
            },
        }),
    ]);

    if (!student) {
        notFound();
    }

    return (
        <ProfileCard
            userId={userId}
            initialBio={student.bio}
            initialNotes={student.notes}
            initialBirthday={student.birthday}
            initialClassroomId={student.classroomId}
            initialGroupId={student.group}
            initialSchool={student.school}
            initialPhoneNumber={student.phoneNumber}
            initialEmail={student.email}
            classrooms={classrooms}
        />
    );
}
