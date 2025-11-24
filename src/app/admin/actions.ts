'use server';

import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getUsers(
    query?: string,
    page: number = 1,
    limit: number = 50,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
    role?: Role,
    groupId?: string
) {
    try {
        const where: any = {};

        if (query) {
            where.OR = [
                { name: { contains: query, mode: 'insensitive' } },
                { loginId: { contains: query, mode: 'insensitive' } },
            ];
        }

        if (role) {
            where.role = role;
        }

        if (groupId) {
            where.groupId = groupId;
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

export async function createUser(data: { name: string; role: Role; password?: string; groupId?: string }) {
    try {
        const { createUser: createUserService } = await import('@/lib/user-service');
        const user = await createUserService({
            name: data.name,
            role: data.role,
            password: data.password,
            groupId: data.groupId,
        });

        revalidatePath('/admin/users');
        return { success: true, user };
    } catch (error) {
        console.error('Failed to create user:', error);
        return { error: 'ユーザーの作成に失敗しました' };
    }
}

export async function updateUser(id: string, data: { name?: string; role?: Role; password?: string; groupId?: string }) {
    try {
        const updateData: any = { ...data };
        if (data.password) {
            updateData.password = await hashPassword(data.password);
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
