'use server';

import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';

import { z } from 'zod';

const signupSchema = z.object({
    name: z.string().min(1, '名前を入力してください'),
    password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
    role: z.nativeEnum(Role),
});

export async function signupAction(prevState: any, formData: FormData) {
    const rawData = {
        name: formData.get('name') as string,
        password: formData.get('password') as string,
        role: formData.get('role') as Role,
    };

    const result = signupSchema.safeParse(rawData);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    const { name, password, role } = result.data;

    // 3. Create user using service to ensure consistent ID generation
    try {
        const { createUser } = await import('@/lib/user-service');
        const user = await createUser({
            name,
            password,
            role, // Use the role selected in UI
        });

        // 4. Register in Supabase (using Admin API to skip email confirmation)
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const supabaseAdmin = createAdminClient();
        const email = `${user.loginId}@sullivan-internal.local`;

        const { error: supabaseError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Confirm email automatically
            // SECURITY: Use app_metadata (not user_metadata) for authorization data
            // app_metadata cannot be modified by the user
            app_metadata: {
                role,
                loginId: user.loginId,
                name: user.name,
                prismaUserId: user.id,
            },
            user_metadata: {
                isDefaultPassword: true,
            },
        });

        if (supabaseError) {
            // Rollback: Delete Prisma user if Supabase registration fails
            await prisma.user.delete({ where: { id: user.id } });
            console.error('Supabase registration failed:', supabaseError);
            return { error: 'アカウント作成に失敗しました(Auth)。' };
        }

        return { success: true, loginId: user.loginId };
    } catch (error) {
        console.error(error);
        return { error: 'ユーザー作成に失敗しました。もう一度お試しください。' };
    }
}
