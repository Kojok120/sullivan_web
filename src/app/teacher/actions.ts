'use server';

import { Role } from '@prisma/client';
import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { canCreateTeacherUser, isTeacherOrAdminRole } from '@/lib/authorization';
import { prisma } from '@/lib/prisma';
import { registerUser } from '@/lib/user-registration-service';
import { DEFAULT_INITIAL_PASSWORD } from '@/lib/auth-constants';
import { getTranslations } from 'next-intl/server';

function createCreateUserSchema(t: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    name: z.string().trim().min(1, t('nameRequired')),
    role: z.enum(['STUDENT', 'TEACHER']),
    group: z.string().optional(),
  });
}

export async function createClassroomScopedUser(input: {
  name: string;
  role: 'STUDENT' | 'TEACHER';
  group?: string;
}) {
  const t = await getTranslations('TeacherActions');
  const session = await getCurrentUser();
  if (!session || !isTeacherOrAdminRole(session.role)) {
    return { error: t('permissionDenied') };
  }

  try {
    const parsed = createCreateUserSchema(t).safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message || t('invalidInput') };
    }

    const { name, role, group } = parsed.data;

    // ADMIN 導線では使わない想定だが、誤用時の安全性を担保
    if (session.role === 'ADMIN') {
      return { error: t('adminCannotCreate') };
    }

    if (role === 'TEACHER' && !canCreateTeacherUser(session.role)) {
      return { error: t('headTeacherOnly') };
    }

    const actor = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        classroomId: true,
        classroom: {
          select: {
            groups: true,
          },
        },
      },
    });

    if (!actor?.classroomId) {
      return { error: t('classroomMissing') };
    }

    let normalizedGroup: string | undefined;
    if (role === 'STUDENT') {
      normalizedGroup = group?.trim() || undefined;

      if (normalizedGroup && !actor.classroom?.groups.includes(normalizedGroup)) {
        return { error: t('groupNotFound') };
      }
    }

    const regResult = await registerUser({
      name,
      role: role as Role,
      group: normalizedGroup,
      classroomId: actor.classroomId,
    });

    if (regResult.error || !regResult.user) {
      return { error: regResult.error || t('createFailed') };
    }

    return {
      success: true,
      user: regResult.user,
      loginId: regResult.user.loginId,
      initialPassword: DEFAULT_INITIAL_PASSWORD,
    };
  } catch (error) {
    console.error('[createClassroomScopedUser] failed:', error);
    return { error: t('createFailed') };
  }
}
