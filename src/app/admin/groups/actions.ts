'use server';

import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';

const prisma = new PrismaClient();

export async function getGroups() {
    const session = await getSession();
    if (!session) {
        throw new Error('Unauthorized');
    }
    // Teachers and Admins can view groups
    if (session.role !== 'ADMIN' && session.role !== 'TEACHER') {
        throw new Error('Forbidden');
    }

    return await prisma.group.findMany({
        orderBy: { createdAt: 'asc' },
    });
}

export async function createGroup(formData: FormData) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        return { error: 'Unauthorized' };
    }

    const name = formData.get('name') as string;

    if (!name || name.trim() === '') {
        return { error: 'グループ名は必須です' };
    }

    try {
        await prisma.group.create({
            data: {
                name: name.trim(),
            },
        });
        revalidatePath('/admin/groups');
        return { success: true };
    } catch (error) {
        console.error('Failed to create group:', error);
        return { error: 'グループの作成に失敗しました。' };
    }
}

export async function deleteGroup(groupId: string) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        return { error: 'Unauthorized' };
    }

    try {
        // Check if any users are assigned to this group
        const usersCount = await prisma.user.count({
            where: { groupId: groupId },
        });

        if (usersCount > 0) {
            return { error: 'このグループには生徒が割り当てられているため削除できません' };
        }

        await prisma.group.delete({
            where: { id: groupId },
        });
        revalidatePath('/admin/groups');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete group:', error);
        return { error: 'グループの削除に失敗しました' };
    }
}
