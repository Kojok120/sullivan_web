import { GuidanceType } from '@prisma/client';
import { revalidatePath } from 'next/cache';

import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import { ensureTeacherCanAccessStudent } from './teacher-access';

export async function addGuidanceRecordAction(userId: string, formData: FormData) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    const content = formData.get('content') as string;
    const type = formData.get('type') as GuidanceType;
    const dateStr = formData.get('date') as string;

    if (!content || !type || !dateStr) {
        return { error: '必須項目が入力されていません' };
    }

    if (session.role === 'TEACHER' || session.role === 'HEAD_TEACHER') {
        const accessError = await ensureTeacherCanAccessStudent(
            session.userId,
            userId,
            '担当教室外の生徒です',
        );
        if (accessError) {
            return { error: accessError };
        }
    }

    try {
        await prisma.guidanceRecord.create({
            data: {
                studentId: userId,
                teacherId: session.userId,
                content,
                type,
                date: new Date(dateStr),
            },
        });

        revalidatePath(`/teacher/students/${userId}`);
        return { success: true };
    } catch (error) {
        console.error(error);
        return { error: '記録の作成に失敗しました' };
    }
}

export async function deleteGuidanceRecordAction(recordId: string, studentId: string) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    try {
        if (session.role !== 'ADMIN') {
            const record = await prisma.guidanceRecord.findUnique({ where: { id: recordId } });
            if (!record || record.teacherId !== session.userId) {
                return { error: '削除権限がありません' };
            }
        }

        await prisma.guidanceRecord.delete({
            where: { id: recordId },
        });

        revalidatePath(`/teacher/students/${studentId}`);
        return { success: true };
    } catch (error) {
        console.error(error);
        return { error: '記録の削除に失敗しました' };
    }
}
