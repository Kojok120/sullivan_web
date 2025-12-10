'use server';

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function getClassrooms(query?: string) {
    const session = await getSession();
    if (!session) {
        throw new Error('Unauthorized');
    }
    // Teachers and Admins can view classrooms
    if (session.role !== 'ADMIN' && session.role !== 'TEACHER') {
        throw new Error('Forbidden');
    }

    const { fetchClassrooms } = await import('@/lib/classroom-service');
    // Unifying sort order to Name ASC for consistency across the app
    return await fetchClassrooms({
        query,
        orderBy: 'name',
        sortOrder: 'asc'
    });
}

export async function getClassroom(id: string) {
    const session = await getSession();
    if (!session) throw new Error('Unauthorized');
    if (session.role !== 'ADMIN' && session.role !== 'TEACHER') throw new Error('Forbidden');

    return await prisma.classroom.findUnique({
        where: { id },
        include: {
            users: {
                orderBy: { name: 'asc' }, // Or loginId
            }
        }
    });
}

export async function createClassroom(formData: FormData) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        return { error: 'Unauthorized' };
    }

    const name = formData.get('name') as string;
    const groupsStr = formData.get('groups') as string; // Comma separated

    if (!name || name.trim() === '') {
        return { error: '教室名は必須です' };
    }

    const groups = groupsStr
        ? groupsStr.split(',').map(g => g.trim()).filter(g => g !== '')
        : [];

    try {
        await prisma.classroom.create({
            data: {
                name: name.trim(),
                groups: groups,
            },
        });
        revalidatePath('/admin/classrooms');
        return { success: true };
    } catch (error) {
        console.error('Failed to create classroom:', error);
        return { error: '教室の作成に失敗しました。既に存在する可能性があります。' };
    }
}

export async function updateClassroom(id: string, formData: FormData) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        return { error: 'Unauthorized' };
    }

    const name = formData.get('name') as string;
    const groupsStr = formData.get('groups') as string;

    if (!name || name.trim() === '') {
        return { error: '教室名は必須です' };
    }

    const groups = groupsStr
        ? groupsStr.split(',').map(g => g.trim()).filter(g => g !== '')
        : [];

    try {
        await prisma.classroom.update({
            where: { id },
            data: {
                name: name.trim(),
                groups: groups,
            },
        });
        revalidatePath('/admin/classrooms');
        return { success: true };
    } catch (error) {
        console.error('Failed to update classroom:', error);
        return { error: '教室の更新に失敗しました' };
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

export async function updateClassroomGroups(id: string, groups: string[]) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        return { error: 'Unauthorized' };
    }

    try {
        await prisma.classroom.update({
            where: { id },
            data: { groups },
        });
        revalidatePath(`/admin/classrooms/${id}`);
        return { success: true };
    } catch (error) {
        console.error('Failed to update classroom groups:', error);
        return { error: 'グループの更新に失敗しました' };
    }
}
