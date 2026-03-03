import { prisma } from '@/lib/prisma';

export async function ensureTeacherCanAccessStudent(
    teacherId: string,
    studentId: string,
    errorMessage: string,
): Promise<string | null> {
    const [teacher, student] = await Promise.all([
        prisma.user.findUnique({
            where: { id: teacherId },
            select: { classroomId: true },
        }),
        prisma.user.findUnique({
            where: { id: studentId },
            select: { classroomId: true },
        }),
    ]);

    if (!teacher?.classroomId || !student?.classroomId || teacher.classroomId !== student.classroomId) {
        return errorMessage;
    }

    return null;
}
