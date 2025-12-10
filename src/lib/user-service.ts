import { prisma } from '@/lib/prisma';
import { hash } from 'bcryptjs';
import { Role } from '@prisma/client';

export async function createUser({
    name,
    role = 'STUDENT',
    group,
    classroomId,
    password, // Optional, defaults to 'password' if not provided (for bulk import etc)
}: {
    name: string;
    role?: Role;
    group?: string;
    classroomId?: string;
    password?: string;
}) {
    // Generate Login ID (S0001, T0001, etc.)
    const prefix = role === 'STUDENT' ? 'S' : role === 'TEACHER' ? 'T' : 'A';

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

    // Default password if not provided (e.g. for admin creation)
    const finalPassword = password || 'password123';
    const hashedPassword = await hash(finalPassword, 10);

    const user = await prisma.user.create({
        data: {
            name,
            loginId,
            password: hashedPassword,
            role,
            group,
            classroomId,
        },
    });

    return user;
}
