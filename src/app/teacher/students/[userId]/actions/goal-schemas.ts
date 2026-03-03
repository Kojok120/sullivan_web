import { z } from 'zod';

import { addDaysToDateKey, listDateKeysBetween } from '@/lib/date-key';
import type { DraftGranularity, TeacherGoalInput } from '@/lib/types/student-goal';

export const MAX_ACTIVE_GOALS = 10;
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const milestoneSchema = z.object({
    dateKey: z.string().regex(DATE_KEY_REGEX, '日付形式が不正です'),
    targetCount: z.number().int().min(0).nullable().optional(),
    targetText: z.string().max(500, 'テキストが長すぎます').nullable().optional(),
});

export const teacherGoalSchema: z.ZodType<TeacherGoalInput> = z.object({
    id: z.string().optional(),
    type: z.enum(['PROBLEM_COUNT', 'CUSTOM']),
    name: z.string().trim().min(1, '目標名は必須です').max(120, '目標名が長すぎます'),
    subjectId: z.string().trim().nullable().optional(),
    dueDateKey: z.string().regex(DATE_KEY_REGEX, '期限日付形式が不正です'),
    milestones: z.array(milestoneSchema).max(400, 'マイルストーン数が多すぎます'),
});

export const saveStudentGoalsSchema = z.object({
    goals: z.array(teacherGoalSchema),
    timeZone: z.string().optional().nullable(),
});

export const updateStudentGoalDaySchema = z.object({
    dateKey: z.string().regex(DATE_KEY_REGEX),
    timeZone: z.string().optional().nullable(),
    entries: z.array(
        z.object({
            goalId: z.string().min(1),
            targetCount: z.number().int().min(0).nullable().optional(),
            targetText: z.string().max(500).nullable().optional(),
        }),
    ),
});

export const draftGoalSchema = z.object({
    type: z.enum(['PROBLEM_COUNT', 'CUSTOM']),
    name: z.string().trim().min(1).max(120),
    dueDateKey: z.string().regex(DATE_KEY_REGEX),
    subjectName: z.string().trim().max(120).optional().nullable(),
    targetCount: z.number().int().min(0).nullable().optional(),
    targetText: z.string().trim().max(500).optional().nullable(),
    milestones: z.array(milestoneSchema).optional(),
});

export const generateDraftSchema = z.object({
    goal: draftGoalSchema,
    granularity: z.enum(['HALF', 'WEEKLY', 'DAILY']),
    timeZone: z.string().optional().nullable(),
});

export function normalizeNullableText(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

export function hasMilestoneValue(targetCount: number | null | undefined, targetText: string | null | undefined) {
    return targetCount !== null && targetCount !== undefined
        ? true
        : !!(targetText && targetText.trim().length > 0);
}

export function buildMilestoneKeys(todayKey: string, dueDateKey: string, granularity: DraftGranularity): string[] {
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

export function validateCustomGoalNames(names: string[]): boolean {
    const normalized = names.map((name) => name.trim().toLowerCase());
    return new Set(normalized).size === normalized.length;
}
