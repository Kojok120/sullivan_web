'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { ClassroomPlan } from '@prisma/client';
import { getTranslations } from 'next-intl/server';
import { isTeacherOrAdminRole } from '@/lib/authorization';

export async function getClassrooms(query?: string) {
    const t = await getTranslations('AdminClassroomActions');
    const session = await getCurrentUser();
    if (!session) {
        throw new Error(t('unauthorized'));
    }
    // 講師系ユーザーと管理者は教室一覧を閲覧可能
    if (!isTeacherOrAdminRole(session.role)) {
        throw new Error(t('forbidden'));
    }

    const { fetchClassrooms } = await import('@/lib/classroom-service');
    // アプリ内の教室一覧は名前昇順に統一
    return await fetchClassrooms({
        query,
        orderBy: 'name',
        sortOrder: 'asc'
    });
}

export async function getClassroom(id: string) {
    const t = await getTranslations('AdminClassroomActions');
    const session = await getCurrentUser();
    if (!session) throw new Error(t('unauthorized'));
    if (!isTeacherOrAdminRole(session.role)) {
        throw new Error(t('forbidden'));
    }

    return await prisma.classroom.findFirst({
        where: { id, packId: session.defaultPackId },
        include: {
            users: {
                orderBy: { name: 'asc' }, // loginIdではなく名前順で表示
            }
        }
    });
}

export async function createClassroom(formData: FormData) {
    const t = await getTranslations('AdminClassroomActions');
    const session = await getCurrentUser();
    if (!session || session.role !== 'ADMIN') {
        return { error: t('unauthorized') };
    }

    const name = formData.get('name') as string;
    const groupsStr = formData.get('groups') as string; // Comma separated
    const planRaw = formData.get('plan');

    if (!name || name.trim() === '') {
        return { error: t('nameRequired') };
    }

    const plan = planRaw === 'PREMIUM' ? ClassroomPlan.PREMIUM : ClassroomPlan.STANDARD;

    const groups = groupsStr
        ? groupsStr.split(',').map(g => g.trim()).filter(g => g !== '')
        : [];

    try {
        await prisma.classroom.create({
            data: {
                name: name.trim(),
                groups: groups,
                plan,
                packId: session.defaultPackId,
            },
        });
        revalidatePath('/admin/classrooms');
        return { success: true };
    } catch (error) {
        console.error('Failed to create classroom:', error);
        return { error: t('createFailed') };
    }
}

// 未使用だった updateClassroom は削除済み（updateClassroomGroups を利用）

export async function deleteClassroom(classroomId: string) {
    const t = await getTranslations('AdminClassroomActions');
    const session = await getCurrentUser();
    if (!session || session.role !== 'ADMIN') {
        return { error: t('unauthorized') };
    }

    try {
        // Check if any users are assigned to this classroom
        const usersCount = await prisma.user.count({
            where: { classroomId: classroomId },
        });

        if (usersCount > 0) {
            return { error: t('deleteHasStudents') };
        }

        await prisma.classroom.delete({
            where: { id: classroomId },
        });
        revalidatePath('/admin/classrooms');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete classroom:', error);
        return { error: t('deleteFailed') };
    }
}

export async function updateClassroomGroups(id: string, groups: string[]) {
    const t = await getTranslations('AdminClassroomActions');
    const session = await getCurrentUser();
    if (!session || session.role !== 'ADMIN') {
        return { error: t('unauthorized') };
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
        return { error: t('groupsUpdateFailed') };
    }
}

export async function updateClassroomPlan(id: string, plan: ClassroomPlan) {
    const t = await getTranslations('AdminClassroomActions');
    const session = await getCurrentUser();
    if (!session || session.role !== 'ADMIN') {
        return { error: t('unauthorized') };
    }

    try {
        await prisma.classroom.update({
            where: { id },
            data: { plan },
        });
        revalidatePath(`/admin/classrooms/${id}`);
        revalidatePath('/admin/classrooms');
        return { success: true };
    } catch (error) {
        console.error('Failed to update classroom plan:', error);
        return { error: t('planUpdateFailed') };
    }
}
