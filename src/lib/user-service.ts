import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';

export async function createUser({
    name,
    role = 'STUDENT',
    group,
    classroomId,
}: {
    name: string;
    role?: Role;
    group?: string;
    classroomId?: string;
}) {
    // Generate Login ID (S0001, T0001, etc.)
    const prefix =
        role === 'STUDENT'
            ? 'S'
            : role === 'TEACHER'
                ? 'T'
                : role === 'HEAD_TEACHER'
                    ? 'H'
                    : 'A';

    // Find the last user with this prefix to increment ID
    const lastUser = await prisma.user.findFirst({
        where: { loginId: { startsWith: prefix } },
        orderBy: { loginId: 'desc' },
    });

    let nextNum = 1;
    if (lastUser) {
        const numPart = parseInt(lastUser.loginId.substring(1));
        if (!isNaN(numPart)) {
            nextNum = numPart + 1;
        }
    }

    const loginId = `${prefix}${nextNum.toString().padStart(4, '0')}`;

    const user = await prisma.user.create({
        data: {
            name,
            loginId,
            role,
            group,
            classroomId,
        },
    });

    return user;
}
