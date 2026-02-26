export type RankingPeriodKey = 'week' | 'month';

export type RankingCategoryKey = 'problemCount' | 'vocabularyScore';

export type RankingEntry = {
    rank: number;
    userId: string;
    name: string;
    loginId: string;
    group: string | null;
    value: number;
};

export type RankingPeriodMeta = {
    label: string;
};

export type RankingResponse = {
    classroom: {
        id: string;
        name: string;
    };
    timeZone: string;
    periods: {
        week: RankingPeriodMeta;
        month: RankingPeriodMeta;
    };
    problemCount: {
        week: RankingEntry[];
        month: RankingEntry[];
    };
    vocabularyScore: {
        week: RankingEntry[];
        month: RankingEntry[];
    };
};
