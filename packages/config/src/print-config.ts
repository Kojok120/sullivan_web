export type PrintSelectionConfig = {
    WEIGHT_TIME: number;
    WEIGHT_WEAKNESS: number;
    WEIGHT_UNANSWERED: number;
    FORGETTING_RATE: number;
    UNANSWERED_BASE: number;
    TIME_SCORE_CAP: number;
    CORRECT_PENALTY: number;
    WEAKNESS_BONUS: number;
    NEW_QUOTA_RATIO: number;
    NEW_QUOTA_MIN: number;
};

export const DEFAULT_PRINT_CONFIG: PrintSelectionConfig = {
    WEIGHT_TIME: 2.0,
    WEIGHT_WEAKNESS: 1.0,
    WEIGHT_UNANSWERED: 1.5,
    FORGETTING_RATE: 5.0,
    UNANSWERED_BASE: 1000,
    TIME_SCORE_CAP: 800,
    CORRECT_PENALTY: 150,
    WEAKNESS_BONUS: 100,
    NEW_QUOTA_RATIO: 0.4,
    NEW_QUOTA_MIN: 5,
};
