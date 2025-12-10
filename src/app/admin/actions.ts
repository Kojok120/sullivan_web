'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { Role } from '@prisma/client';
import { getSession, requireAdmin, hashPassword } from '@/lib/auth';

export async function getUsers(
    page: number = 1,
    limit: number = 10,
    query: string = '',
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
    roleFilter?: Role,
    groupFilter?: string
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

        if (groupFilter && groupFilter !== 'ALL') {
            where.group = groupFilter;
        }

        const skip = (page - 1) * limit;

        const orderBy: any = {};
        if (sortBy === 'group') {
            orderBy.group = sortOrder;
        } else {
            orderBy[sortBy] = sortOrder;
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                orderBy,
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
    group: z.string().optional(),
});

const updateUserSchema = z.object({
    name: z.string().optional(),
    role: z.nativeEnum(Role).optional(),
    password: z.string().optional(),
    group: z.string().optional(),
});

export async function createUser(data: { name: string; role: Role; password?: string; group?: string }) {
    await requireAdmin();
    const result = createUserSchema.safeParse(data);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    try {
        const { createUser: createUserService } = await import('@/lib/user-service');
        const user = await createUserService({
            ...result.data,
            group: result.data.group
        } as any);

        revalidatePath('/admin/users');
        return { success: true, user };
    } catch (error) {
        console.error('Failed to create user:', error);
        return { error: 'ユーザーの作成に失敗しました' };
    }
}

export async function updateUser(id: string, data: { name?: string; role?: Role; password?: string; group?: string }) {
    await requireAdmin();
    try {
        const updateData: any = {
            name: data.name,
            role: data.role,
            group: data.group
        };

        if (data.password) {
            updateData.password = await hashPassword(data.password);
        }

        // Remove undefined fields
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

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
        // Fetch all classrooms to get their groups
        const classrooms = await prisma.classroom.findMany({
            select: { groups: true }
        });

        // Flatten and unique
        const allGroups = Array.from(new Set(classrooms.flatMap(c => c.groups)));

        // Return as objects to match expected interface
        const groups = allGroups.map(g => ({ id: g, name: g })).sort((a, b) => a.name.localeCompare(b.name));

        return { success: true, groups };
    } catch (error) {
        console.error('Failed to fetch groups:', error);
        return { error: 'グループの取得に失敗しました' };
    }
}
