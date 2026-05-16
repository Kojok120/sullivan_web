// jp-juken ContentPack 定義。
// DB の ContentPack.id = 'jp-juken' に対応し、UI/算法側はこのパックから
// 教科色・進行ルール・印刷ルールを引く想定。
//
// 現状の runtime コード（src/lib/print-algo.ts, src/lib/progression.ts）は
// @sullivan/config の DEFAULT_* を直接参照しているため、本ファイルの値は
// 「論理仕様の宣言」として置く。Phase 3 以降に runtime をパック参照に切り替える。

import type { ContentPackDefinition } from '@sullivan/content-schema';

export const jpJukenPack: ContentPackDefinition = {
    id: 'jp-juken',
    productId: 'jp',
    locale: 'ja-JP',
    subjects: [
        {
            id: 'eng',
            name: '英語',
            letter: 'E',
            bgColor: 'bg-orange-500',
            hoverColor: 'hover:bg-orange-600',
            localizedName: { 'ja-JP': '英語', 'en-AU': 'English' },
        },
        {
            id: 'math',
            name: '数学',
            letter: 'M',
            bgColor: 'bg-blue-500',
            hoverColor: 'hover:bg-blue-600',
            localizedName: { 'ja-JP': '数学', 'en-AU': 'Math' },
        },
        {
            id: 'sci',
            name: '理科',
            letter: 'S',
            bgColor: 'bg-cyan-500',
            hoverColor: 'hover:bg-cyan-600',
            localizedName: { 'ja-JP': '理科', 'en-AU': 'Science' },
        },
        {
            id: 'jpn',
            name: '国語',
            letter: 'N',
            bgColor: 'bg-green-500',
            hoverColor: 'hover:bg-green-600',
            localizedName: { 'ja-JP': '国語', 'en-AU': 'Japanese' },
        },
    ],
    progressionRules: {
        // @sullivan/config の UNLOCK_ANSWER_RATE / UNLOCK_CORRECT_RATE と同値。
        unlockAnswerRate: 0.4,
        unlockCorrectRate: 0.5,
        readyMinAnswers: 5,
        readyMinCorrectRate: 0.6,
    },
    printConfig: {
        // @sullivan/config の DEFAULT_PRINT_CONFIG を ContentPack 用に正規化したもの。
        weightTime: 2.0,
        weightWeakness: 1.0,
        weightDifficulty: 1.0,
        weightFreshness: 1.5,
        cooldownDays: 7,
        maxQuestionsPerCoreProblem: 10,
    },
} as const;
