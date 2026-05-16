import { prisma } from '@sullivan/db-schema';
import { Prisma } from '@prisma/client';

export type ClassroomSort = 'name' | 'createdAt';

export async function fetchClassrooms(options?: {
    query?: string;
    orderBy?: ClassroomSort;
    sortOrder?: 'asc' | 'desc';
}) {
    const where: Prisma.ClassroomWhereInput = options?.query ? {
        name: { contains: options.query } // Removing mode: 'insensitive' as default Postgres (if used) might behave differently, or stick to what was there. Original code didn't use insensitive for classrooms, but nice to have. Let's stick to safe default (contains).
    } : {};

    const orderBy: Prisma.ClassroomOrderByWithRelationInput = {};
    if (options?.orderBy === 'createdAt') {
        orderBy.createdAt = options.sortOrder || 'asc';
    } else {
        orderBy.name = options?.sortOrder || 'asc';
    }

    return await prisma.classroom.findMany({
        where,
        orderBy,
    });
}
