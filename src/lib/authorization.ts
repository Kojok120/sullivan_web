import type { ClassroomPlan, Role } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export type SessionLike = {
  userId: string;
  role: string;
};

export type StudentAccessContext = {
  id: string;
  role: Role;
  classroomId: string | null;
  classroomPlan: ClassroomPlan | null;
};

const CLASSROOM_REQUIRED_ROLES = new Set(['STUDENT', 'TEACHER', 'HEAD_TEACHER']);

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'ADMIN';
}

export function isTeacherRole(role: string | null | undefined): boolean {
  return role === 'TEACHER' || role === 'HEAD_TEACHER';
}

export function isTeacherOrAdminRole(role: string | null | undefined): boolean {
  return isAdminRole(role) || isTeacherRole(role);
}

export function canCreateTeacherUser(role: string | null | undefined): boolean {
  return role === 'HEAD_TEACHER' || role === 'ADMIN';
}

export function roleRequiresClassroom(role: string): boolean {
  return CLASSROOM_REQUIRED_ROLES.has(role);
}

export async function canAccessUserWithinClassroomScope(params: {
  actorUserId: string;
  actorRole: string;
  targetUserId: string;
}): Promise<boolean> {
  const { actorUserId, actorRole, targetUserId } = params;

  if (!actorUserId || !targetUserId) return false;
  if (isAdminRole(actorRole)) return true;
  if (actorUserId === targetUserId) return true;
  if (!isTeacherRole(actorRole)) return false;

  const [actor, target] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorUserId },
      select: { classroomId: true },
    }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { classroomId: true },
    }),
  ]);

  if (!actor?.classroomId || !target?.classroomId) {
    return false;
  }

  return actor.classroomId === target.classroomId;
}

export async function getStudentAccessContext(params: {
  actorUserId: string;
  actorRole: string;
  targetStudentId: string;
}): Promise<{ allowed: boolean; student: StudentAccessContext | null }> {
  const { actorUserId, actorRole, targetStudentId } = params;

  if (!targetStudentId) {
    return { allowed: false, student: null };
  }

  const student = await prisma.user.findUnique({
    where: { id: targetStudentId },
    select: {
      id: true,
      role: true,
      classroomId: true,
      classroom: {
        select: {
          plan: true,
        },
      },
    },
  });

  if (!student || student.role !== 'STUDENT') {
    return { allowed: false, student: null };
  }

  const studentContext: StudentAccessContext = {
    id: student.id,
    role: student.role,
    classroomId: student.classroomId,
    classroomPlan: student.classroom?.plan ?? null,
  };

  if (isAdminRole(actorRole)) {
    return { allowed: true, student: studentContext };
  }

  if (actorUserId === targetStudentId) {
    return { allowed: true, student: studentContext };
  }

  if (!isTeacherRole(actorRole)) {
    return { allowed: false, student: studentContext };
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { classroomId: true },
  });

  const allowed = Boolean(
    actor?.classroomId && student.classroomId && actor.classroomId === student.classroomId,
  );

  return {
    allowed,
    student: studentContext,
  };
}
