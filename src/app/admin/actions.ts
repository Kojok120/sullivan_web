'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { Role } from '@prisma/client';
import { requireAdmin, hashPassword } from '@/lib/auth';
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
        const { data: { users }, error: searchError } = await supabase.auth.admin.listUsers();

        // listUsers might be slow if many users. better to search? or assume ID?
        // Actually, we don't store Supabase ID in Prisma (we store Prisma ID in Supabase).
        // So we must lookup by email.
        // Efficient way: listUsers can filter? No, standard listUsers doesn't filter by email easily in JS client?
        // Actually, we can just use the email map logic if it's consistent.
        // But updateUserById needs the UUID.

        // Better: Store supabase_id in Prisma? No, we decided not to change schema significantly yet.
        // Let's search by email.

        // Note: listUsers() returns a list. If we have thousands, this is bad.
        // Alternative: creating a user with same email fails? No.
        // supabase.auth.admin.getUserById() -> needs ID.

        // Wait, if we use the mapping `[loginId]@...`, is there any other way?
        // If we strictly maintain the email map, we can rely on it.
        // But we need the UID.

        // Actually... we can fetch the user by logging in? No.

        // Let's assume we iterate? No.
        // OK, I'll use `listUsers` but in a production app with many users this is bad.
        // Is there a better way?
        // supabase.auth.admin.createUser will fail if exists.

        // Retrying `listUsers`: does it support search?
        // documentation says `listUsers` is paginated.

        // Let's try to grab the user ID using a trick?
        // No.

        // Okay, for now I will fetch users and filter.

        // But wait! When we create the user `admin.createUser`, it returns the user object with ID.
        // We didn't save it back to Prisma.

        // Correct approach for now: Filter `listUsers`.
        // If efficient lookup is needed later, we should add `supabaseId` to Prisma User model.

        // Let's proceed with finding user by email in the list.

        const { data, error: listError } = await supabase.auth.admin.listUsers({
            page: 1,
            perPage: 1000 // Temporary limit
        });

        if (listError || !data.users) {
            console.error(listError);
            return { success: false, error: 'Supabaseユーザーの取得に失敗しました' };
        }

        const supabaseUser = data.users.find(u => u.email === email);

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
    classroomId: z.string().optional(),
});

const updateUserSchema = z.object({
    name: z.string().optional(),
    role: z.nativeEnum(Role).optional(),
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
        const { createUser: createUserService } = await import('@/lib/user-service');
        const user = await createUserService({
            ...result.data,
            group: result.data.group,
            classroomId: result.data.classroomId
        } as any);

        revalidatePath('/admin/users');
        return { success: true, user };
    } catch (error) {
        console.error('Failed to create user:', error);
        return { error: 'ユーザーの作成に失敗しました' };
    }
}

export async function updateUser(id: string, data: { name?: string; role?: Role; password?: string; group?: string; classroomId?: string }) {
    await requireAdmin();
    try {
        const updateData: any = {
            name: data.name,
            role: data.role,
            group: data.group,
            classroomId: data.classroomId
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
