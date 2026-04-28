'use server';

import { prisma } from '@/lib/prisma';
import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { GuidanceRecordStatus, GuidanceType } from '@prisma/client';
import { normalizeOptionalSelection } from '@/lib/form-selection';
import { z } from 'zod';
import { addDaysToDateKey, getTodayDateKey, isValidDateKey, listDateKeysBetween, normalizeTimeZone } from '@/lib/date-key';
import type { DraftGranularity, GoalDraftProposal, TeacherGoalInput } from '@/lib/types/student-goal';

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

const MAX_ACTIVE_GOALS = 10;
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const milestoneSchema = z.object({
    dateKey: z.string().regex(DATE_KEY_REGEX, '日付形式が不正です'),
    targetCount: z.number().int().min(0).nullable().optional(),
    targetText: z.string().max(500, 'テキストが長すぎます').nullable().optional(),
});

const teacherGoalSchema: z.ZodType<TeacherGoalInput> = z.object({
    id: z.string().optional(),
    type: z.enum(['PROBLEM_COUNT', 'CUSTOM']),
    name: z.string().trim().min(1, '目標名は必須です').max(120, '目標名が長すぎます'),
    subjectId: z.string().trim().nullable().optional(),
    dueDateKey: z.string().regex(DATE_KEY_REGEX, '期限日付形式が不正です'),
    milestones: z.array(milestoneSchema).max(400, 'マイルストーン数が多すぎます'),
});

const saveStudentGoalsSchema = z.object({
    goals: z.array(teacherGoalSchema),
    timeZone: z.string().optional().nullable(),
});

const updateStudentGoalDaySchema = z.object({
    dateKey: z.string().regex(DATE_KEY_REGEX),
    timeZone: z.string().optional().nullable(),
    entries: z.array(
        z.object({
            goalId: z.string().min(1),
            targetCount: z.number().int().min(0).nullable().optional(),
            targetText: z.string().max(500).nullable().optional(),
        })
    ),
});

const draftGoalSchema = z.object({
    type: z.enum(['PROBLEM_COUNT', 'CUSTOM']),
    name: z.string().trim().min(1).max(120),
    dueDateKey: z.string().regex(DATE_KEY_REGEX),
    subjectName: z.string().trim().max(120).optional().nullable(),
    targetCount: z.number().int().min(0).nullable().optional(),
    targetText: z.string().trim().max(500).optional().nullable(),
    milestones: z.array(milestoneSchema).optional(),
});

const generateDraftSchema = z.object({
    goal: draftGoalSchema,
    granularity: z.enum(['HALF', 'WEEKLY', 'DAILY']),
    timeZone: z.string().optional().nullable(),
});

function normalizeNullableText(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

function hasMilestoneValue(targetCount: number | null | undefined, targetText: string | null | undefined) {
    return targetCount !== null && targetCount !== undefined
        ? true
        : !!(targetText && targetText.trim().length > 0);
}

function buildMilestoneKeys(todayKey: string, dueDateKey: string, granularity: DraftGranularity): string[] {
    if (dueDateKey < todayKey) return [];

    if (granularity === 'DAILY') {
        return listDateKeysBetween(todayKey, dueDateKey);
    }

    if (granularity === 'WEEKLY') {
        const keys: string[] = [];
        let cursor = todayKey;
        while (cursor <= dueDateKey) {
            keys.push(cursor);
            cursor = addDaysToDateKey(cursor, 7);
        }
        if (keys[keys.length - 1] !== dueDateKey) {
            keys.push(dueDateKey);
        }
        return keys;
    }

    const allKeys = listDateKeysBetween(todayKey, dueDateKey);
    if (allKeys.length === 0) return [];

    const midIndex = Math.floor((allKeys.length - 1) / 2);
    const midpoint = allKeys[midIndex];

    return Array.from(new Set([todayKey, midpoint, dueDateKey])).sort();
}

function buildFallbackDraft(params: {
    milestoneKeys: string[];
    goal: z.infer<typeof draftGoalSchema>;
}): GoalDraftProposal[] {
    const { milestoneKeys, goal } = params;
    if (milestoneKeys.length === 0) return [];

    if (goal.type === 'PROBLEM_COUNT') {
        const total = goal.targetCount ?? 0;
        const bucket = milestoneKeys.length;
        let remaining = total;

        return milestoneKeys.map((dateKey, index) => {
            const remainingSlots = bucket - index;
            const suggested = remainingSlots > 0 ? Math.ceil(remaining / remainingSlots) : 0;
            remaining = Math.max(0, remaining - suggested);
            return {
                dateKey,
                targetCount: suggested,
                targetText: goal.subjectName ? `${goal.subjectName}の演習を進める` : '演習を進める',
            };
        });
    }

    return milestoneKeys.map((dateKey, index) => ({
        dateKey,
        targetText: index === 0
            ? `${goal.name}に着手する`
            : index === milestoneKeys.length - 1
                ? `${goal.name}を完了する`
                : `${goal.name}を継続する`,
        targetCount: null,
    }));
}

async function buildDraftWithGemini(params: {
    milestoneKeys: string[];
    goal: z.infer<typeof draftGoalSchema>;
}): Promise<GoalDraftProposal[] | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || params.milestoneKeys.length === 0) {
        return null;
    }

    try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });

        const modelName = process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-pro-preview';
        const dateKeysText = params.milestoneKeys.join(', ');
        const goalSummary = params.goal.type === 'PROBLEM_COUNT'
            ? `目標名: ${params.goal.name}, 科目: ${params.goal.subjectName || '未指定'}, 合計問題数: ${params.goal.targetCount ?? 0}`
            : `目標名: ${params.goal.name}, 目標内容: ${params.goal.targetText || params.goal.name}`;

        const prompt = [
            '学習目標のマイルストーン案を作成してください。',
            '必ず指定日付のみを返してください。',
            `対象日付: ${dateKeysText}`,
            `目標情報: ${goalSummary}`,
            'JSON配列で返してください。各要素は { "dateKey": "YYYY-MM-DD", "targetCount": number|null, "targetText": string|null }。',
            'targetTextは短く具体的にしてください。',
        ].join('\n');

        const response = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: 'application/json',
                responseJsonSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            dateKey: { type: 'string' },
                            targetCount: {
                                anyOf: [{ type: 'integer' }, { type: 'null' }],
                            },
                            targetText: {
                                anyOf: [{ type: 'string' }, { type: 'null' }],
                            },
                        },
                        required: ['dateKey'],
                        additionalProperties: false,
                    },
                },
                maxOutputTokens: 2048,
            },
        });

        const rawText = response.text?.trim();
        if (!rawText) return null;

        const parsed = JSON.parse(rawText) as Array<{
            dateKey?: unknown;
            targetCount?: unknown;
            targetText?: unknown;
        }>;
        if (!Array.isArray(parsed)) return null;

        const keySet = new Set(params.milestoneKeys);
        const normalized: GoalDraftProposal[] = parsed
            .filter((item) => typeof item.dateKey === 'string' && keySet.has(item.dateKey))
            .map((item) => ({
                dateKey: item.dateKey as string,
                targetCount: typeof item.targetCount === 'number' && item.targetCount >= 0
                    ? Math.floor(item.targetCount)
                    : null,
                targetText: typeof item.targetText === 'string' ? item.targetText.trim() : null,
            }));

        if (normalized.length === 0) return null;

        const byKey = new Map(normalized.map((item) => [item.dateKey, item]));
        return params.milestoneKeys.map((key) => byKey.get(key) ?? { dateKey: key, targetCount: null, targetText: null });
    } catch (error) {
        console.error('[generateStudentGoalDraftAction] Gemini draft failed:', error);
        return null;
    }
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
                status: GuidanceRecordStatus.COMPLETED,
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

export async function saveStudentGoalsAction(userId: string, input: unknown) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    if (session.role === 'TEACHER' || session.role === 'HEAD_TEACHER') {
        const accessError = await ensureTeacherCanAccessStudent(session.userId, userId, '担当教室外の生徒は編集できません');
        if (accessError) return { error: accessError };
    }

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
        .map((goal) => goal.name.trim().toLowerCase());
    const customNameSet = new Set(activeCustomNames);
    if (customNameSet.size !== activeCustomNames.length) {
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
        if (existingCustomNameSet.has(name)) {
            return { error: '任意目標名が重複しています' };
        }
    }

    for (const goal of goals) {
        if (goal.type === 'PROBLEM_COUNT' && !goal.subjectId) {
            return { error: '問題数目標には科目の選択が必要です' };
        }
        const milestoneDateKeys = goal.milestones.map((m) => m.dateKey);
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
                                createMany: {
                                    data: cleanMilestones,
                                },
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
                            createMany: {
                                data: cleanMilestones,
                            },
                        },
                    },
                });
            }
        });

        revalidatePath('/');
        revalidatePath('/dashboard');
        revalidatePath(`/teacher/students/${userId}`);
        return { success: true };
    } catch (error) {
        console.error('[saveStudentGoalsAction] failed:', error);
        return { error: '目標の保存に失敗しました' };
    }
}

export async function updateStudentGoalDayAction(userId: string, input: unknown) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    if (session.role === 'TEACHER' || session.role === 'HEAD_TEACHER') {
        const accessError = await ensureTeacherCanAccessStudent(session.userId, userId, '担当教室外の生徒は編集できません');
        if (accessError) return { error: accessError };
    }

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

        revalidatePath('/');
        revalidatePath('/dashboard');
        revalidatePath(`/teacher/students/${userId}`);
        return { success: true };
    } catch (error) {
        console.error('[updateStudentGoalDayAction] failed:', error);
        return { error: '日次目標の更新に失敗しました' };
    }
}

export async function renameStudentGoalAction(goalId: string, newName: string) {
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

        if (session.role === 'TEACHER' || session.role === 'HEAD_TEACHER') {
            const accessError = await ensureTeacherCanAccessStudent(session.userId, goal.studentId, '担当教室外の生徒は編集できません');
            if (accessError) return { error: accessError };
        }

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

        revalidatePath('/');
        revalidatePath('/dashboard');
        revalidatePath(`/teacher/students/${goal.studentId}`);
        return { success: true };
    } catch (error) {
        console.error('[renameStudentGoalAction] failed:', error);
        return { error: '目標名の更新に失敗しました' };
    }
}

export async function deleteStudentGoalAction(goalId: string) {
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

        if (session.role === 'TEACHER' || session.role === 'HEAD_TEACHER') {
            const accessError = await ensureTeacherCanAccessStudent(session.userId, goal.studentId, '担当教室外の生徒は編集できません');
            if (accessError) return { error: accessError };
        }

        await prisma.studentGoal.update({
            where: { id: goalId },
            data: {
                deletedAt: new Date(),
                updatedByTeacherId: session.userId,
            },
        });

        revalidatePath('/');
        revalidatePath('/dashboard');
        revalidatePath(`/teacher/students/${goal.studentId}`);
        return { success: true };
    } catch (error) {
        console.error('[deleteStudentGoalAction] failed:', error);
        return { error: '目標削除に失敗しました' };
    }
}

export async function generateStudentGoalDraftAction(userId: string, input: unknown) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        return { error: '権限がありません' };
    }

    if (session.role === 'TEACHER' || session.role === 'HEAD_TEACHER') {
        const accessError = await ensureTeacherCanAccessStudent(session.userId, userId, '担当教室外の生徒は編集できません');
        if (accessError) return { error: accessError };
    }

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
