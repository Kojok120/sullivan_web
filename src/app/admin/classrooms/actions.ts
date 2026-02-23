'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { ClassroomPlan } from '@prisma/client';
import { isTeacherOrAdminRole } from '@/lib/authorization';

export async function getClassrooms(query?: string) {
    const session = await getCurrentUser();
    if (!session) {
        throw new Error('Unauthorized');
    }
    // 講師系ユーザーと管理者は教室一覧を閲覧可能
    if (!isTeacherOrAdminRole(session.role)) {
        throw new Error('Forbidden');
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
    const session = await getCurrentUser();
    if (!session) throw new Error('Unauthorized');
    if (!isTeacherOrAdminRole(session.role)) {
        throw new Error('Forbidden');
    }

    return await prisma.classroom.findUnique({
        where: { id },
        include: {
            users: {
                orderBy: { name: 'asc' }, // loginIdではなく名前順で表示
            }
        }
    });
}

export async function createClassroom(formData: FormData) {
    const session = await getCurrentUser();
    if (!session || session.role !== 'ADMIN') {
        return { error: 'Unauthorized' };
    }

    const name = formData.get('name') as string;
    const groupsStr = formData.get('groups') as string; // Comma separated
    const planRaw = formData.get('plan');

    if (!name || name.trim() === '') {
        return { error: '教室名は必須です' };
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
            },
        });
        revalidatePath('/admin/classrooms');
        return { success: true };
    } catch (error) {
        console.error('Failed to create classroom:', error);
        return { error: '教室の作成に失敗しました。既に存在する可能性があります。' };
    }
}

// 未使用だった updateClassroom は削除済み（updateClassroomGroups を利用）

export async function deleteClassroom(classroomId: string) {
    const session = await getCurrentUser();
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
    const session = await getCurrentUser();
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

export async function updateClassroomPlan(id: string, plan: ClassroomPlan) {
    const session = await getCurrentUser();
    if (!session || session.role !== 'ADMIN') {
        return { error: 'Unauthorized' };
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
        return { error: 'プランの更新に失敗しました' };
    }
}
