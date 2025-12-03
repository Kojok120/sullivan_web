'use server';

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { GuidanceType } from '@prisma/client';

export async function updateStudentProfile(userId: string, formData: FormData) {
    const session = await getSession();
    if (!session || (session.role !== 'TEACHER' && session.role !== 'ADMIN')) {
        return { error: '権限がありません' };
    }

    const bio = formData.get('bio') as string;
    const notes = formData.get('notes') as string;
    const birthdayStr = formData.get('birthday') as string;
    const classroomId = formData.get('classroomId') as string;
    const school = formData.get('school') as string;
    const phoneNumber = formData.get('phoneNumber') as string;
    const email = formData.get('email') as string;

    try {
        // Fetch classroom name if classroomId is provided to keep legacy field in sync (optional but good for consistency if we keep the field)
        let classroomName = null;
        if (classroomId) {
            const c = await prisma.classroom.findUnique({ where: { id: classroomId } });
            if (c) classroomName = c.name;
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                bio,
                notes,
                birthday: birthdayStr ? new Date(birthdayStr) : null,
                classroomId: classroomId || null,
                classroom: classroomName, // Sync legacy field
                school,
                phoneNumber,
                email,
            },
        });

        revalidatePath(`/teacher/students/${userId}`);
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: 'プロフィールの更新に失敗しました' };
    }
}

export async function addGuidanceRecord(userId: string, formData: FormData) {
    const session = await getSession();
    if (!session || (session.role !== 'TEACHER' && session.role !== 'ADMIN')) {
        return { error: '権限がありません' };
    }

    const content = formData.get('content') as string;
    const type = formData.get('type') as GuidanceType;
    const dateStr = formData.get('date') as string;

    if (!content || !type || !dateStr) {
        return { error: '必須項目が入力されていません' };
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
    } catch (e) {
        console.error(e);
        return { error: '記録の作成に失敗しました' };
    }
}

export async function deleteGuidanceRecord(recordId: string, studentId: string) {
    const session = await getSession();
    if (!session || (session.role !== 'TEACHER' && session.role !== 'ADMIN')) {
        return { error: '権限がありません' };
    }

    try {
        await prisma.guidanceRecord.delete({
            where: { id: recordId },
        });

        revalidatePath(`/teacher/students/${studentId}`);
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: '記録の削除に失敗しました' };
    }
}
