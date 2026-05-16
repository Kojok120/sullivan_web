'use server';

import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { getSession } from '@/lib/auth';
import { canAccessUserWithinClassroomScope, isTeacherOrAdminRole } from '@/lib/authorization';
import { isValidDateKey } from '@/lib/date-key';
import { getGoalDailyViewPayload, getGoalDailyViewPayloadByRange } from '@/lib/student-goal-service';

const inputSchema = z.object({
    studentId: z.string().min(1),
    timeZone: z.string().optional().nullable(),
    fromDateKey: z.string().optional(),
    toDateKey: z.string().optional(),
});

export async function getGoalDailyViewAction(input: unknown) {
    const t = await getTranslations('StudentGoalActions');

    const session = await getSession();
    if (!session) {
        return { error: t('loginRequired') };
    }

    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
        return { error: parsed.error.errors[0]?.message ?? t('invalidInput') };
    }

    const { studentId, timeZone, fromDateKey, toDateKey } = parsed.data;

    if (session.userId !== studentId) {
        if (!isTeacherOrAdminRole(session.role)) {
            return { error: t('forbidden') };
        }

        const canAccess = await canAccessUserWithinClassroomScope({
            actorUserId: session.userId,
            actorRole: session.role,
            targetUserId: studentId,
        });

        if (!canAccess) {
            return { error: t('classroomScopeDenied') };
        }
    }

    try {
        if (fromDateKey && toDateKey && isValidDateKey(fromDateKey) && isValidDateKey(toDateKey)) {
            const payload = await getGoalDailyViewPayloadByRange({
                studentId,
                timeZone,
                fromDateKey,
                toDateKey,
            });
            return { success: true, data: payload };
        }

        const payload = await getGoalDailyViewPayload({
            studentId,
            timeZone,
        });
        return { success: true, data: payload };
    } catch (error) {
        console.error('[getGoalDailyViewAction] failed:', error);
        return { error: t('fetchFailed') };
    }
}
