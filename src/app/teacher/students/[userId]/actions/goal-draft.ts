import { z } from 'zod';

import type { GoalDraftProposal } from '@/lib/types/student-goal';

import { draftGoalSchema } from './goal-schemas';

export function buildFallbackDraft(params: {
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
        targetText:
            index === 0
                ? `${goal.name}に着手する`
                : index === milestoneKeys.length - 1
                    ? `${goal.name}を完了する`
                    : `${goal.name}を継続する`,
        targetCount: null,
    }));
}

export async function buildDraftWithGemini(params: {
    milestoneKeys: string[];
    goal: z.infer<typeof draftGoalSchema>;
}): Promise<GoalDraftProposal[] | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || params.milestoneKeys.length === 0) {
        return null;
    }

    try {
        const { GoogleGenAI, Type } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });

        const modelName = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash-lite';
        const dateKeysText = params.milestoneKeys.join(', ');
        const goalSummary =
            params.goal.type === 'PROBLEM_COUNT'
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
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            dateKey: { type: Type.STRING },
                            targetCount: { type: Type.NUMBER, nullable: true },
                            targetText: { type: Type.STRING, nullable: true },
                        },
                        required: ['dateKey'],
                    },
                },
                temperature: 0.5,
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
                targetCount: typeof item.targetCount === 'number' && item.targetCount >= 0 ? Math.floor(item.targetCount) : null,
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
