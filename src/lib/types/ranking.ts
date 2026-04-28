import { z } from 'zod';

export const RANKING_PERIOD_KEYS = ['week', 'month'] as const;
export type RankingPeriodKey = (typeof RANKING_PERIOD_KEYS)[number];

export const RANKING_CATEGORY_KEYS = ['problemCount', 'vocabularyScore'] as const;
export type RankingCategoryKey = (typeof RANKING_CATEGORY_KEYS)[number];

export const rankingEntrySchema = z.object({
    rank: z.number().int().positive(),
    userId: z.string().min(1),
    name: z.string(),
    loginId: z.string().min(1),
    group: z.string().nullable(),
    value: z.number().int().nonnegative(),
});
export type RankingEntry = z.infer<typeof rankingEntrySchema>;

export const rankingPeriodMetaSchema = z.object({
    label: z.string().min(1),
});
export type RankingPeriodMeta = z.infer<typeof rankingPeriodMetaSchema>;

export const rankingResponseSchema = z.object({
    classroom: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
    }),
    timeZone: z.string().min(1),
    periods: z.object({
        week: rankingPeriodMetaSchema,
        month: rankingPeriodMetaSchema,
    }),
    problemCount: z.object({
        week: z.array(rankingEntrySchema),
        month: z.array(rankingEntrySchema),
    }),
    vocabularyScore: z.object({
        week: z.array(rankingEntrySchema),
        month: z.array(rankingEntrySchema),
    }),
});
export type RankingResponse = z.infer<typeof rankingResponseSchema>;
