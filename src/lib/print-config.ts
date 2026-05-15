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
    // 既存重み（後方互換のため値は維持）
    WEIGHT_TIME: 2.0,
    WEIGHT_WEAKNESS: 1.0,
    WEIGHT_UNANSWERED: 1.5,
    FORGETTING_RATE: 5.0,

    // 未着手のベーススコア。十分大きく取って既着手より優先する
    UNANSWERED_BASE: 1000,

    // 既着手の時間スコア上限。長期放置の score 暴走を防ぐ
    TIME_SCORE_CAP: 800,

    // 正解済問題のスコア減算。再演優先度を大きく下げる
    CORRECT_PENALTY: 150,

    // 不正解問題の弱点ボーナス（WEIGHT_WEAKNESS を実際に使用）
    WEAKNESS_BONUS: 100,

    // 印刷スロットのうち未着手枠の割合と最低数
    NEW_QUOTA_RATIO: 0.4,
    NEW_QUOTA_MIN: 5,
};
