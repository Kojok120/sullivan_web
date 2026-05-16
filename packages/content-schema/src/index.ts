// @sullivan/content-schema は ContentPack の構造を定義する純粋型パッケージ。
// 各プロダクト（jp / nihongo / bd）はこの schema に準拠した ContentPackDefinition を提供する。
//
// このパッケージは他の @sullivan/* に依存しない。
// 循環依存を避けるため、ProgressionRules / PrintConfig 型はここで再定義し、
// @sullivan/config 側はこれらを実装値（DEFAULT_*）に束ねる位置づけにする。

export type SubjectId = string;

export interface SubjectDefinition {
    /** 一意の subject id（jp-juken なら 'eng' / 'math' など） */
    id: SubjectId;
    /** 表示名（ロケール依存。多言語化が必要な場合は localizedName へ） */
    name: string;
    /** 頭文字（UI バッジ用、例: 'E' / 'M'） */
    letter: string;
    /** Tailwind 背景色クラス */
    bgColor: string;
    /** Tailwind ホバー色クラス */
    hoverColor: string;
    /** 多言語表示名（任意） */
    localizedName?: Record<string, string>;
}

/** 進行（アンロック / 出題可能）判定のしきい値 */
export interface ProgressionRules {
    unlockAnswerRate: number;
    unlockCorrectRate: number;
    readyMinAnswers: number;
    readyMinCorrectRate: number;
}

/** 印刷選択算法の重み付け設定 */
export interface PrintConfig {
    weightTime: number;
    weightWeakness: number;
    weightDifficulty: number;
    weightFreshness: number;
    cooldownDays: number;
    maxQuestionsPerCoreProblem: number;
}

/** ContentPack そのもの。教科一覧と進行/印刷ルールをまとめる */
export interface ContentPackDefinition {
    /** ContentPack 識別子（DB の ContentPack.id と一致） */
    id: string;
    /** プロダクト識別子（'jp' / 'nihongo' / 'bd' など） */
    productId: string;
    /** ロケール（'ja-JP' / 'en-AU' / 'bn-BD' など） */
    locale: string;
    /** 教科一覧 */
    subjects: readonly SubjectDefinition[];
    /** 進行ルール */
    progressionRules: ProgressionRules;
    /** 印刷選択ルール */
    printConfig: PrintConfig;
}
