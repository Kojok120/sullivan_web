'use server';

import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';

import { z } from 'zod';

const signupSchema = z.object({
    name: z.string().min(1, '名前を入力してください'),
    password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
    role: z.nativeEnum(Role),
    group: z.string().optional(),
    classroomId: z.string().optional(),
});

export async function signupAction(prevState: any, formData: FormData) {
    const rawData = {
        name: formData.get('name') as string,
        password: formData.get('password') as string,
        role: formData.get('role') as Role,
        group: formData.get('group') as string || undefined,
        classroomId: formData.get('classroomId') as string || undefined,
    };

    const result = signupSchema.safeParse(rawData);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    const { name, password, role, group, classroomId } = result.data;

    // 3. Create user using service to ensure consistent ID generation
    try {
        const { createUser } = await import('@/lib/user-service');
        const user = await createUser({
            name,
            password,
            role, // Use the role selected in UI
            group,
            classroomId
        });

        // 4. Register in Supabase (using shared Admin logic)
        const { createOrUpdateSupabaseUser } = await import('@/lib/auth-admin');
        const email = `${user.loginId}@sullivan-internal.local`;

        const authResult = await createOrUpdateSupabaseUser({
            email,
            password,
            role,
            loginId: user.loginId,
            name: user.name || '',
            prismaUserId: user.id
        });

        if (authResult.error) {
            // Rollback: Delete Prisma user if Supabase registration fails
            await prisma.user.delete({ where: { id: user.id } });
            console.error('Supabase registration failed:', authResult.error);
            return { error: 'アカウント作成に失敗しました(Auth)。' };
        }

        return { success: true, loginId: user.loginId };
    } catch (error) {
        console.error(error);
        return { error: 'ユーザー作成に失敗しました。もう一度お試しください。' };
    }
}
