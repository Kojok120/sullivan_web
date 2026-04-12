import { z } from 'zod';

const MONTH_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const RANKING_CUSTOM_RANGE_MAX_MONTHS = 12;
export const RANKING_ACCURACY_MIN_ANSWER_COUNT = 10;

export const RANKING_PERIOD_KEYS = ['1m', '3m', '12m', 'custom'] as const;
export type RankingPeriodKey = (typeof RANKING_PERIOD_KEYS)[number];

export const RANKING_CATEGORY_KEYS = ['problemCount', 'vocabularyScore', 'accuracy'] as const;
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
    key: z.enum(RANKING_PERIOD_KEYS),
    label: z.string().min(1),
    startMonth: z.string().regex(MONTH_KEY_REGEX),
    endMonth: z.string().regex(MONTH_KEY_REGEX),
});
export type RankingPeriodMeta = z.infer<typeof rankingPeriodMetaSchema>;

export const rankingResponseSchema = z.object({
    classroom: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
    }),
    timeZone: z.string().min(1),
    period: rankingPeriodMetaSchema,
    problemCount: z.array(rankingEntrySchema),
    vocabularyScore: z.array(rankingEntrySchema),
    accuracy: z.array(rankingEntrySchema),
});
export type RankingResponse = z.infer<typeof rankingResponseSchema>;

export const LEGACY_RANKING_PERIOD_KEYS = ['week', 'month'] as const;
export type LegacyRankingPeriodKey = (typeof LEGACY_RANKING_PERIOD_KEYS)[number];

export const legacyRankingPeriodMetaSchema = z.object({
    label: z.string().min(1),
});
export type LegacyRankingPeriodMeta = z.infer<typeof legacyRankingPeriodMetaSchema>;

export const legacyRankingResponseSchema = z.object({
    classroom: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
    }),
    timeZone: z.string().min(1),
    periods: z.object({
        week: legacyRankingPeriodMetaSchema,
        month: legacyRankingPeriodMetaSchema,
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
export type LegacyRankingResponse = z.infer<typeof legacyRankingResponseSchema>;
