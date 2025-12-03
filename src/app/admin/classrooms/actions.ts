'use server';

import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';

const prisma = new PrismaClient();

export async function getClassrooms() {
    const session = await getSession();
    if (!session) {
        throw new Error('Unauthorized');
    }
    // Teachers and Admins can view classrooms
    if (session.role !== 'ADMIN' && session.role !== 'TEACHER') {
        throw new Error('Forbidden');
    }

    return await prisma.classroom.findMany({
        orderBy: { createdAt: 'asc' },
    });
}

export async function createClassroom(formData: FormData) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        return { error: 'Unauthorized' };
    }

    const name = formData.get('name') as string;

    if (!name || name.trim() === '') {
        return { error: '教室名は必須です' };
    }

    try {
        await prisma.classroom.create({
            data: {
                name: name.trim(),
            },
        });
        revalidatePath('/admin/classrooms');
        return { success: true };
    } catch (error) {
        console.error('Failed to create classroom:', error);
        return { error: '教室の作成に失敗しました。既に存在する可能性があります。' };
    }
}

export async function deleteClassroom(classroomId: string) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        return { error: 'Unauthorized' };
    }

    try {
        // Check if any users are assigned to this classroom
        const usersCount = await prisma.user.count({
            where: { classroomId: classroomId },
        });

        if (usersCount > 0) {
            return { error: 'この教室には生徒が割り当てられているため削除できません' };
        }

        await prisma.classroom.delete({
            where: { id: classroomId },
        });
        revalidatePath('/admin/classrooms');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete classroom:', error);
        return { error: '教室の削除に失敗しました' };
    }
}
