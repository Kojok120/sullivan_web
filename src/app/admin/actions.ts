'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { Prisma, Role } from '@prisma/client';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { roleRequiresClassroom } from '@/lib/authorization';

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

        const { findSupabaseUser } = await import('@/lib/auth-admin');
        const supabaseUser = await findSupabaseUser({
            email,
            prismaUserId: userId,
        });

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
    classroomFilter?: string
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

        if (classroomFilter && classroomFilter !== 'ALL') {
            where.classroomId = classroomFilter;
        }

        const skip = (page - 1) * limit;

        const orderBy: Prisma.UserOrderByWithRelationInput =
            sortBy === 'classroom'
                ? { classroom: { name: sortOrder } }
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
                include: {
                    classroom: {
                        select: {
                            name: true,
                        },
                    },
                },
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
}).superRefine((value, ctx) => {
    if (roleRequiresClassroom(value.role) && !value.classroomId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'この役割では教室選択が必須です',
            path: ['classroomId'],
        });
    }
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

export async function updateUser(
    id: string,
    data: { name?: string; role?: Role; group?: string | null; classroomId?: string | null }
) {
    await requireAdmin();
    try {
        const currentUser = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                role: true,
                classroomId: true,
                loginId: true,
                name: true,
            },
        });
        if (!currentUser) {
            return { error: 'ユーザーが見つかりません' };
        }

        const nextRole = data.role ?? currentUser.role;
        const nextClassroomId = data.classroomId !== undefined ? data.classroomId : currentUser.classroomId;
        if (roleRequiresClassroom(nextRole) && !nextClassroomId) {
            return { error: 'この役割では教室選択が必須です' };
        }

        const updateData: Prisma.UserUpdateInput = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.role !== undefined) updateData.role = data.role;
        if (data.group !== undefined) updateData.group = data.group;
        if (data.classroomId !== undefined) {
            updateData.classroom = data.classroomId
                ? { connect: { id: data.classroomId } }
                : { disconnect: true };
        }

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
        });

        const { syncSupabaseAppMetadata } = await import('@/lib/auth-admin');
        const syncResult = await syncSupabaseAppMetadata({
            prismaUserId: user.id,
            loginId: user.loginId,
            role: user.role,
            name: user.name || '',
        });
        if (!syncResult.success) {
            console.error('Supabase app_metadata sync failed after updateUser:', syncResult.error);
            revalidatePath('/admin/users');
            return {
                success: true,
                user,
                warning: 'ユーザーは更新しましたが、Supabaseの権限同期に失敗しました。再実行してください。',
            };
        }

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

export async function getUserManagementMeta() {
    await requireAdmin();
    try {
        const classrooms = await prisma.classroom.findMany({
            select: { id: true, name: true, plan: true, groups: true },
            orderBy: { name: 'asc' },
        });

        const allGroupsSet = new Set<string>();
        classrooms.forEach((classroom) => {
            classroom.groups.forEach((groupName) => {
                allGroupsSet.add(groupName);
            });
        });

        const groups = Array.from(allGroupsSet)
            .sort((a, b) => a.localeCompare(b))
            .map((name) => ({ id: name, name }));

        const classroomOptions = classrooms.map((classroom) => ({
            id: classroom.id,
            name: classroom.name,
            plan: classroom.plan,
        }));

        return {
            success: true,
            groups,
            classrooms: classroomOptions,
        };
    } catch (error) {
        console.error('Failed to fetch user management metadata:', error);
        return { error: 'ユーザー管理メタデータの取得に失敗しました' };
    }
}
