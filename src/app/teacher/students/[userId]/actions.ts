'use server';

import { prisma } from '@/lib/prisma';
import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { GuidanceType } from '@prisma/client';
import { normalizeOptionalSelection } from '@/lib/form-selection';

async function ensureTeacherCanAccessStudent(
    teacherId: string,
    studentId: string,
    errorMessage: string
): Promise<string | null> {
    const [teacher, student] = await Promise.all([
        prisma.user.findUnique({
            where: { id: teacherId },
            select: { classroomId: true }
        }),
        prisma.user.findUnique({
            where: { id: studentId },
            select: { classroomId: true }
        })
    ]);

    if (!teacher?.classroomId || !student?.classroomId || teacher.classroomId !== student.classroomId) {
        return errorMessage;
    }

    return null;
}

export async function updateStudentProfile(userId: string, formData: FormData) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    // SECURITY: Teachers can only edit students in their assigned classroom (IDOR protection)
    if (session.role === 'TEACHER' || session.role === 'HEAD_TEACHER') {
        const accessError = await ensureTeacherCanAccessStudent(
            session.userId,
            userId,
            '担当教室外の生徒は編集できません'
        );
        if (accessError) {
            return { error: accessError };
        }
    }

    const bio = formData.get('bio') as string;
    const notes = formData.get('notes') as string;
    const birthdayStr = formData.get('birthday') as string;
    const classroomId = formData.get('classroomId') as string;
    const group = formData.get('groupId') as string; // Form field is named groupId but contains the group name string
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
                // SECURITY: Only Admins can change classroomId to prevent unauthorized transfers
                classroomId: session.role === 'ADMIN' ? normalizedClassroomId : undefined,
                group: normalizedGroup ?? null,
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
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    const content = formData.get('content') as string;
    const type = formData.get('type') as GuidanceType;
    const dateStr = formData.get('date') as string;

    if (!content || !type || !dateStr) {
        return { error: '必須項目が入力されていません' };
    }

    // SECURITY: Verify student is in teacher's classroom
    if (session.role === 'TEACHER' || session.role === 'HEAD_TEACHER') {
        const accessError = await ensureTeacherCanAccessStudent(
            session.userId,
            userId,
            '担当教室外の生徒です'
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
    } catch (e) {
        console.error(e);
        return { error: '記録の作成に失敗しました' };
    }
}

export async function deleteGuidanceRecord(recordId: string, studentId: string) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    try {
        // SECURITY: Verify ownership or admin
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
    } catch (e) {
        console.error(e);
        return { error: '記録の削除に失敗しました' };
    }
}
