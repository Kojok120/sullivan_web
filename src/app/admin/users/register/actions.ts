'use server';

import { Role } from '@prisma/client';

import { z } from 'zod';

const signupSchema = z.object({
    name: z.string().min(1, '名前を入力してください'),
    role: z.nativeEnum(Role),
    group: z.string().optional(),
    classroomId: z.string().optional(),
}).superRefine((value, ctx) => {
    const needsClassroom = value.role === 'STUDENT' || value.role === 'TEACHER' || value.role === 'HEAD_TEACHER';
    if (needsClassroom && !value.classroomId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'この役割では所属教室を選択してください',
            path: ['classroomId'],
        });
    }
});

export async function signupAction(_prevState: unknown, formData: FormData) {
    const rawData = {
        name: formData.get('name') as string,
        role: formData.get('role') as Role,
        group: formData.get('group') as string || undefined,
        classroomId: formData.get('classroomId') as string || undefined,
    };

    const result = signupSchema.safeParse(rawData);

    if (!result.success) {
        return { error: result.error.errors[0].message };
    }

    const { name, role, group, classroomId } = result.data;

    // 3. Register user using shared service
    try {
        const { registerUser } = await import('@/lib/user-registration-service');
        const regResult = await registerUser({
            name,
            role,
            group,
            classroomId
        });

        if (regResult.error || !regResult.user) {
            return { error: regResult.error };
        }

        return { success: true, loginId: regResult.user.loginId };
    } catch (error) {
        console.error(error);
        return { error: 'ユーザー作成に失敗しました。もう一度お試しください。' };
    }
}
