import { revalidatePath } from 'next/cache';

import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { normalizeOptionalSelection } from '@/lib/form-selection';
import { prisma } from '@/lib/prisma';

import { ensureTeacherCanAccessStudent } from './teacher-access';

export async function updateStudentProfileAction(userId: string, formData: FormData) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    if (session.role === 'TEACHER' || session.role === 'HEAD_TEACHER') {
        const accessError = await ensureTeacherCanAccessStudent(
            session.userId,
            userId,
            '担当教室外の生徒は編集できません',
        );
        if (accessError) {
            return { error: accessError };
        }
    }

    const bio = formData.get('bio') as string;
    const notes = formData.get('notes') as string;
    const birthdayStr = formData.get('birthday') as string;
    const classroomId = formData.get('classroomId') as string;
    const group = formData.get('groupId') as string;
    const school = formData.get('school') as string;
    const phoneNumber = formData.get('phoneNumber') as string;
    const email = formData.get('email') as string;

    const normalizedClassroomId = normalizeOptionalSelection(classroomId);
    const normalizedGroup = normalizeOptionalSelection(group);

    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                bio,
                notes,
                birthday: birthdayStr ? new Date(birthdayStr) : null,
                classroomId: session.role === 'ADMIN' ? normalizedClassroomId : undefined,
                group: normalizedGroup ?? null,
                school,
                phoneNumber,
                email,
            },
        });

        revalidatePath(`/teacher/students/${userId}`);
        return { success: true };
    } catch (error) {
        console.error(error);
        return { error: 'プロフィールの更新に失敗しました' };
    }
}
