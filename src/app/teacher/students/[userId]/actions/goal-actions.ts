import { revalidatePath } from 'next/cache';
import { isValidDateKey, getTodayDateKey, normalizeTimeZone } from '@/lib/date-key';
import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import { buildDraftWithGemini, buildFallbackDraft } from './goal-draft';
import {
    buildMilestoneKeys,
    generateDraftSchema,
    hasMilestoneValue,
    MAX_ACTIVE_GOALS,
    normalizeNullableText,
    saveStudentGoalsSchema,
    updateStudentGoalDaySchema,
    validateCustomGoalNames,
} from './goal-schemas';
import { ensureTeacherCanAccessStudent } from './teacher-access';

function revalidateGoalPaths(studentId: string) {
    revalidatePath('/');
    revalidatePath('/dashboard');
    revalidatePath(`/teacher/students/${studentId}`);
}

async function validateTeacherScope(session: Awaited<ReturnType<typeof getSession>>, userId: string) {
    if (!session) {
        return { error: '権限がありません' };
    }

    if (session.role === 'TEACHER' || session.role === 'HEAD_TEACHER') {
        const accessError = await ensureTeacherCanAccessStudent(session.userId, userId, '担当教室外の生徒は編集できません');
        if (accessError) {
            return { error: accessError };
        }
    }

    return null;
}

export async function saveStudentGoalsActionImpl(userId: string, input: unknown) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    const scopeError = await validateTeacherScope(session, userId);
    if (scopeError) return scopeError;

    const parsed = saveStudentGoalsSchema.safeParse(input);
    if (!parsed.success) {
        return { error: parsed.error.errors[0]?.message ?? '入力値が不正です' };
    }

    const safeTimeZone = normalizeTimeZone(parsed.data.timeZone);
    const todayKey = getTodayDateKey(safeTimeZone);
    const goals = parsed.data.goals;

    const activeSubmittedGoals = goals.filter((goal) => goal.dueDateKey >= todayKey);
    const submittedPersistedIds = goals
        .map((goal) => goal.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const existingActiveOtherCount = await prisma.studentGoal.count({
        where: {
            studentId: userId,
            deletedAt: null,
            dueDateKey: { gte: todayKey },
            id: submittedPersistedIds.length > 0 ? { notIn: submittedPersistedIds } : undefined,
        },
    });

    if (activeSubmittedGoals.length + existingActiveOtherCount > MAX_ACTIVE_GOALS) {
        return { error: `有効目標は最大${MAX_ACTIVE_GOALS}件までです` };
    }

    const activeCustomNames = activeSubmittedGoals
        .filter((goal) => goal.type === 'CUSTOM')
        .map((goal) => goal.name.trim());

    if (!validateCustomGoalNames(activeCustomNames)) {
        return { error: '任意目標名が重複しています' };
    }

    const existingCustomNames = await prisma.studentGoal.findMany({
        where: {
            studentId: userId,
            deletedAt: null,
            dueDateKey: { gte: todayKey },
            type: 'CUSTOM',
            id: submittedPersistedIds.length > 0 ? { notIn: submittedPersistedIds } : undefined,
        },
        select: { name: true },
    });
    const existingCustomNameSet = new Set(existingCustomNames.map((goal) => goal.name.trim().toLowerCase()));
    for (const name of activeCustomNames) {
        if (existingCustomNameSet.has(name.trim().toLowerCase())) {
            return { error: '任意目標名が重複しています' };
        }
    }

    for (const goal of goals) {
        if (goal.type === 'PROBLEM_COUNT' && !goal.subjectId) {
            return { error: '問題数目標には科目の選択が必要です' };
        }
        const milestoneDateKeys = goal.milestones.map((milestone) => milestone.dateKey);
        if (new Set(milestoneDateKeys).size !== milestoneDateKeys.length) {
            return { error: '同一目標内で日付が重複しています' };
        }
        if (!isValidDateKey(goal.dueDateKey)) {
            return { error: '期限日付の形式が不正です' };
        }
    }

    try {
        await prisma.$transaction(async (tx) => {
            const existingGoals = await tx.studentGoal.findMany({
                where: { studentId: userId, deletedAt: null },
                select: { id: true },
            });
            const existingIds = new Set(existingGoals.map((goal) => goal.id));

            for (const goal of goals) {
                const cleanMilestones = goal.milestones.map((milestone) => ({
                    dateKey: milestone.dateKey,
                    targetCount: milestone.targetCount ?? null,
                    targetText: normalizeNullableText(milestone.targetText),
                }));

                if (goal.id && existingIds.has(goal.id)) {
                    await tx.studentGoal.update({
                        where: { id: goal.id },
                        data: {
                            type: goal.type,
                            name: goal.name.trim(),
                            subjectId: goal.type === 'PROBLEM_COUNT' ? goal.subjectId ?? null : null,
                            dueDateKey: goal.dueDateKey,
                            updatedByTeacherId: session.userId,
                            milestones: {
                                deleteMany: {},
                                createMany: { data: cleanMilestones },
                            },
                        },
                    });
                    continue;
                }

                await tx.studentGoal.create({
                    data: {
                        studentId: userId,
                        type: goal.type,
                        name: goal.name.trim(),
                        subjectId: goal.type === 'PROBLEM_COUNT' ? goal.subjectId ?? null : null,
                        dueDateKey: goal.dueDateKey,
                        createdByTeacherId: session.userId,
                        updatedByTeacherId: session.userId,
                        milestones: {
                            createMany: { data: cleanMilestones },
                        },
                    },
                });
            }
        });

        revalidateGoalPaths(userId);
        return { success: true };
    } catch (error) {
        console.error('[saveStudentGoalsAction] failed:', error);
        return { error: '目標の保存に失敗しました' };
    }
}

export async function updateStudentGoalDayActionImpl(userId: string, input: unknown) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    const scopeError = await validateTeacherScope(session, userId);
    if (scopeError) return scopeError;

    const parsed = updateStudentGoalDaySchema.safeParse(input);
    if (!parsed.success) {
        return { error: parsed.error.errors[0]?.message ?? '入力値が不正です' };
    }

    const { dateKey, entries } = parsed.data;

    try {
        const goals = await prisma.studentGoal.findMany({
            where: {
                id: { in: entries.map((entry) => entry.goalId) },
                studentId: userId,
                deletedAt: null,
            },
            select: { id: true },
        });

        const goalIdSet = new Set(goals.map((goal) => goal.id));
        for (const entry of entries) {
            if (!goalIdSet.has(entry.goalId)) {
                return { error: '更新対象に無効な目標が含まれています' };
            }
        }

        await prisma.$transaction(async (tx) => {
            for (const entry of entries) {
                const normalizedText = normalizeNullableText(entry.targetText);
                const normalizedCount = entry.targetCount ?? null;

                if (!hasMilestoneValue(normalizedCount, normalizedText)) {
                    await tx.studentGoalMilestone.deleteMany({
                        where: {
                            goalId: entry.goalId,
                            dateKey,
                        },
                    });
                    continue;
                }

                await tx.studentGoalMilestone.upsert({
                    where: {
                        goalId_dateKey: {
                            goalId: entry.goalId,
                            dateKey,
                        },
                    },
                    update: {
                        targetCount: normalizedCount,
                        targetText: normalizedText,
                    },
                    create: {
                        goalId: entry.goalId,
                        dateKey,
                        targetCount: normalizedCount,
                        targetText: normalizedText,
                    },
                });
            }
        });

        revalidateGoalPaths(userId);
        return { success: true };
    } catch (error) {
        console.error('[updateStudentGoalDayAction] failed:', error);
        return { error: '日次目標の更新に失敗しました' };
    }
}

export async function renameStudentGoalActionImpl(goalId: string, newName: string) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    const normalizedName = newName.trim();
    if (!normalizedName) {
        return { error: '目標名を入力してください' };
    }

    try {
        const goal = await prisma.studentGoal.findUnique({
            where: { id: goalId },
            select: { id: true, studentId: true, type: true, deletedAt: true },
        });
        if (!goal || goal.deletedAt) {
            return { error: '目標が見つかりません' };
        }

        const scopeError = await validateTeacherScope(session, goal.studentId);
        if (scopeError) return scopeError;

        if (goal.type === 'CUSTOM') {
            const duplicate = await prisma.studentGoal.findFirst({
                where: {
                    studentId: goal.studentId,
                    id: { not: goal.id },
                    deletedAt: null,
                    type: 'CUSTOM',
                    name: normalizedName,
                },
                select: { id: true },
            });
            if (duplicate) {
                return { error: '同名の目標がすでに存在します' };
            }
        }

        await prisma.studentGoal.update({
            where: { id: goalId },
            data: {
                name: normalizedName,
                updatedByTeacherId: session.userId,
            },
        });

        revalidateGoalPaths(goal.studentId);
        return { success: true };
    } catch (error) {
        console.error('[renameStudentGoalAction] failed:', error);
        return { error: '目標名の更新に失敗しました' };
    }
}

export async function deleteStudentGoalActionImpl(goalId: string) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    try {
        const goal = await prisma.studentGoal.findUnique({
            where: { id: goalId },
            select: { id: true, studentId: true, deletedAt: true },
        });

        if (!goal || goal.deletedAt) {
            return { error: '目標が見つかりません' };
        }

        const scopeError = await validateTeacherScope(session, goal.studentId);
        if (scopeError) return scopeError;

        await prisma.studentGoal.update({
            where: { id: goalId },
            data: {
                deletedAt: new Date(),
                updatedByTeacherId: session.userId,
            },
        });

        revalidateGoalPaths(goal.studentId);
        return { success: true };
    } catch (error) {
        console.error('[deleteStudentGoalAction] failed:', error);
        return { error: '目標削除に失敗しました' };
    }
}

export async function generateStudentGoalDraftActionImpl(userId: string, input: unknown) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    const scopeError = await validateTeacherScope(session, userId);
    if (scopeError) return scopeError;

    const parsed = generateDraftSchema.safeParse(input);
    if (!parsed.success) {
        return { error: parsed.error.errors[0]?.message ?? '入力値が不正です' };
    }

    const safeTimeZone = normalizeTimeZone(parsed.data.timeZone);
    const todayKey = getTodayDateKey(safeTimeZone);
    const { goal, granularity } = parsed.data;

    if (goal.dueDateKey < todayKey) {
        return { error: '期限日は今日以降を選択してください' };
    }

    const milestoneKeys = buildMilestoneKeys(todayKey, goal.dueDateKey, granularity);
    const aiDraft = await buildDraftWithGemini({ milestoneKeys, goal });
    const fallbackDraft = buildFallbackDraft({ milestoneKeys, goal });
    const draft = aiDraft ?? fallbackDraft;

    return { success: true, data: draft };
}
