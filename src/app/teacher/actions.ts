'use server';

import { Role } from '@prisma/client';
import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { canCreateTeacherUser, isTeacherOrAdminRole } from '@/lib/authorization';
import { prisma } from '@/lib/prisma';
import { registerUser } from '@/lib/user-registration-service';
import { DEFAULT_INITIAL_PASSWORD } from '@/lib/auth-constants';

const createUserSchema = z.object({
  name: z.string().trim().min(1, '名前を入力してください'),
  role: z.enum(['STUDENT', 'TEACHER']),
  group: z.string().optional(),
});

export async function createClassroomScopedUser(input: {
  name: string;
  role: 'STUDENT' | 'TEACHER';
  group?: string;
}) {
  const session = await getCurrentUser();
  if (!session || !isTeacherOrAdminRole(session.role)) {
    return { error: '権限がありません' };
  }

  try {
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message || '入力値が不正です' };
    }

    const { name, role, group } = parsed.data;

    // ADMIN 導線では使わない想定だが、誤用時の安全性を担保
    if (session.role === 'ADMIN') {
      return { error: '管理者はこの画面から作成できません' };
    }

    if (role === 'TEACHER' && !canCreateTeacherUser(session.role)) {
      return { error: '講師を追加できるのは校舎長のみです' };
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
      return { error: '所属教室が設定されていないため作成できません' };
    }

    let normalizedGroup: string | undefined;
    if (role === 'STUDENT') {
      normalizedGroup = group?.trim() || undefined;

      if (normalizedGroup && !actor.classroom?.groups.includes(normalizedGroup)) {
        return { error: '選択したグループは所属教室に存在しません' };
      }
    }

    const regResult = await registerUser({
      name,
      role: role as Role,
      group: normalizedGroup,
      classroomId: actor.classroomId,
    });

    if (regResult.error || !regResult.user) {
      return { error: regResult.error || 'ユーザー作成に失敗しました' };
    }

    return {
      success: true,
      user: regResult.user,
      loginId: regResult.user.loginId,
      initialPassword: DEFAULT_INITIAL_PASSWORD,
    };
  } catch (error) {
    console.error('[createClassroomScopedUser] failed:', error);
    return { error: 'ユーザー作成に失敗しました' };
  }
}
