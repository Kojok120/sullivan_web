'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { Prisma, Role } from '@prisma/client';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function resetPassword(userId: string, password: string) {
    await requireAdmin();
    try {
        const supabase = createAdminClient();

        // 1. Get user to find their Prisma ID (which is mapped to Supabase metadata)
        // Or directly use the ID if it matches? 
        // Our system maps Prisma ID to Supabase metadata.prismaUserId.
        // But for Admin API updateUserById, we need the Supabase User ID (UUID).
        // Wait, 'userId' passed here is likely the Prisma ID from the UI.

        // We need to find the Supabase User ID associated with this Prisma User ID.
        // We can look it up in Supabase using the Prisma ID stored in metadata?
        // Or we can rely on email which is [loginId]@sullivan-internal.local?

        const prismaUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { loginId: true }
        });

        if (!prismaUser) {
            return { success: false, error: 'ユーザーが見つかりません' };
        }

        // Find Supabase user by email (mapped from loginId)
        const email = `${prismaUser.loginId}@sullivan-internal.local`;

        const { findSupabaseUserByEmail } = await import('@/lib/auth-admin');
        const supabaseUser = await findSupabaseUserByEmail(email);

        if (!supabaseUser) {
            return { success: false, error: 'Supabaseユーザーが見つかりません' };
        }

        const { error: updateError } = await supabase.auth.admin.updateUserById(
            supabaseUser.id,
            {
                password: password,
                user_metadata: { isDefaultPassword: true }
            }
        );

        if (updateError) {
            console.error(updateError);
            return { success: false, error: 'パスワードの更新に失敗しました' };
        }

        return { success: true };
    } catch (error) {
        console.error(error);
        return { success: false, error: 'システムエラーが発生しました' };
    }
}

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
        const where: Prisma.UserWhereInput = {};

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

        const orderBy: Prisma.UserOrderByWithRelationInput =
            sortBy === 'group'
                ? { group: sortOrder }
                : sortBy === 'name'
                    ? { name: sortOrder }
                    : sortBy === 'loginId'
                        ? { loginId: sortOrder }
                        : sortBy === 'role'
                            ? { role: sortOrder }
                            : { createdAt: sortOrder };

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
    classroomId: z.string().optional(),
});


export async function createUser(data: { name: string; role: Role; password?: string; group?: string; classroomId?: string }) {
    await requireAdmin();
    const result = createUserSchema.safeParse(data);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    try {
        const { registerUser } = await import('@/lib/user-registration-service');
        const regResult = await registerUser({
            name: result.data.name,
            role: result.data.role,
            password: result.data.password,
            group: result.data.group,
            classroomId: result.data.classroomId
        });

        if (regResult.error || !regResult.user) {
            return { error: regResult.error };
        }

        revalidatePath('/admin/users');
        return { success: true, user: regResult.user };
    } catch (error) {
        console.error('Failed to create user:', error);
        return { error: 'ユーザーの作成に失敗しました' };
    }
}

export async function updateUser(id: string, data: { name?: string; role?: Role; group?: string; classroomId?: string }) {
    await requireAdmin();
    try {
        const updateData: Prisma.UserUpdateInput = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.role !== undefined) updateData.role = data.role;
        if (data.group !== undefined) updateData.group = data.group;
        if (data.classroomId !== undefined) updateData.classroom = { connect: { id: data.classroomId } };

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

// Wrapper for admin/users page that needs { success, classrooms: [{id, name}] } format
// Uses consolidated getClassrooms from admin/classrooms/actions.ts
export async function getClassroomsForAdmin() {
    await requireAdmin();
    try {
        const { getClassrooms } = await import('@/app/admin/classrooms/actions');
        const classrooms = await getClassrooms();
        return {
            success: true,
            classrooms: classrooms.map(c => ({ id: c.id, name: c.name }))
        };
    } catch (error) {
        console.error('Failed to fetch classrooms:', error);
        return { error: '教室の取得に失敗しました' };
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
