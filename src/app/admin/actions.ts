'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { Role } from '@prisma/client';
import { hashPassword, getSession } from '@/lib/auth';

async function requireAdmin() {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        throw new Error('Unauthorized');
    }
}

export async function getUsers(
    page: number = 1,
    limit: number = 10,
    query: string = '',
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
    roleFilter?: Role,
    groupIdFilter?: string
) {
    await requireAdmin();
    try {
        const where: any = {};

        if (query) {
            where.OR = [
                { name: { contains: query, mode: 'insensitive' } },
                { loginId: { contains: query, mode: 'insensitive' } },
            ];
        }

        if (roleFilter) {
            where.role = roleFilter;
        }

        if (groupIdFilter && groupIdFilter !== 'ALL') {
            where.groupId = groupIdFilter;
        }

        const skip = (page - 1) * limit;

        const orderBy: any = {};
        if (sortBy === 'group') {
            orderBy.group = { name: sortOrder };
        } else {
            orderBy[sortBy] = sortOrder;
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                orderBy,
                include: { group: true },
                skip,
                take: limit,
            }),
            prisma.user.count({ where }),
        ]);

        return { success: true, users, total, page, limit };
    } catch (error) {
        console.error('Failed to fetch users:', error);
        return { error: 'ユーザーの取得に失敗しました' };
    }
}

import { z } from 'zod';

const createUserSchema = z.object({
    name: z.string().min(1, '名前を入力してください'),
    role: z.nativeEnum(Role),
    password: z.string().optional(),
    groupId: z.string().optional(),
});

const updateUserSchema = z.object({
    name: z.string().optional(),
    role: z.nativeEnum(Role).optional(),
    password: z.string().optional(),
    groupId: z.string().optional(),
});

export async function createUser(data: { name: string; role: Role; password?: string; groupId?: string }) {
    await requireAdmin();
    const result = createUserSchema.safeParse(data);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    try {
        const { createUser: createUserService } = await import('@/lib/user-service');
        const user = await createUserService(result.data as any);

        revalidatePath('/admin/users');
        return { success: true, user };
    } catch (error) {
        console.error('Failed to create user:', error);
        return { error: 'ユーザーの作成に失敗しました' };
    }
}

export async function updateUser(id: string, data: { name?: string; role?: Role; password?: string; groupId?: string }) {
    await requireAdmin();
    try {
        const updateData: any = { ...data };
        if (updateData.password) {
            updateData.password = await hashPassword(updateData.password);
        } else {
            delete updateData.password;
        }

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
        });

        revalidatePath('/admin/users');
        return { success: true, user };
    } catch (error) {
        console.error('Failed to update user:', error);
        return { error: 'ユーザーの更新に失敗しました' };
    }
}

export async function deleteUser(id: string) {
    await requireAdmin();
    try {
        await prisma.user.delete({
            where: { id },
        });

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete user:', error);
        return { error: 'ユーザーの削除に失敗しました' };
    }
}

export async function getGroups() {
    await requireAdmin();
    try {
        const groups = await prisma.group.findMany({
            orderBy: { name: 'asc' },
        });
        return { success: true, groups };
    } catch (error) {
        console.error('Failed to fetch groups:', error);
        return { error: 'グループの取得に失敗しました' };
    }
}
