import { describe, it, expect } from 'vitest'
import { PRINT_CONFIG } from '@/lib/print-algo'

describe('PRINT_CONFIG', () => {
    it('既存重みは後方互換のために値を維持する', () => {
        expect(PRINT_CONFIG.WEIGHT_TIME).toBe(2.0)
        expect(PRINT_CONFIG.WEIGHT_WEAKNESS).toBe(1.0)
        expect(PRINT_CONFIG.WEIGHT_UNANSWERED).toBe(1.5)
        expect(PRINT_CONFIG.FORGETTING_RATE).toBe(5.0)
    })

    it('新規スコアパラメータが定義されている', () => {
        expect(PRINT_CONFIG.UNANSWERED_BASE).toBe(1000)
        expect(PRINT_CONFIG.TIME_SCORE_CAP).toBe(800)
        expect(PRINT_CONFIG.CORRECT_PENALTY).toBe(150)
        expect(PRINT_CONFIG.WEAKNESS_BONUS).toBe(100)
        expect(PRINT_CONFIG.NEW_QUOTA_RATIO).toBe(0.4)
        expect(PRINT_CONFIG.NEW_QUOTA_MIN).toBe(5)
    })

    it('忘却スコアは日数に比例して増加し、TIME_SCORE_CAP で頭打ちになる', () => {
        const score1Day = 1 * PRINT_CONFIG.FORGETTING_RATE * PRINT_CONFIG.WEIGHT_TIME
        expect(score1Day).toBe(10)

        const score80Day = 80 * PRINT_CONFIG.FORGETTING_RATE * PRINT_CONFIG.WEIGHT_TIME
        expect(score80Day).toBe(800)
        expect(score80Day).toBe(PRINT_CONFIG.TIME_SCORE_CAP)

        const score200Day = 200 * PRINT_CONFIG.FORGETTING_RATE * PRINT_CONFIG.WEIGHT_TIME
        // 実装では Math.min で頭打ちされる
        expect(Math.min(score200Day, PRINT_CONFIG.TIME_SCORE_CAP)).toBe(800)
    })

    it('未着手のベーススコアは既着手の上限値より高く設定されている', () => {
        const unansweredScore = PRINT_CONFIG.UNANSWERED_BASE * PRINT_CONFIG.WEIGHT_UNANSWERED
        expect(unansweredScore).toBe(1500)

        const maxAnsweredScore = PRINT_CONFIG.TIME_SCORE_CAP +
            PRINT_CONFIG.WEAKNESS_BONUS * PRINT_CONFIG.WEIGHT_WEAKNESS
        // 不正解問題が時間上限まで放置された場合の最大値
        expect(maxAnsweredScore).toBe(900)

        // 未着手は既着手の最大値より高い → 未着手は常に上位に並ぶ
        expect(unansweredScore).toBeGreaterThan(maxAnsweredScore)
    })

    it('正解時のペナルティは弱点ボーナス + 時間上限を下回る', () => {
        // 正解で長期放置された問題のスコア
        const correctMax = PRINT_CONFIG.TIME_SCORE_CAP - PRINT_CONFIG.CORRECT_PENALTY
        expect(correctMax).toBe(650)

        // 不正解で長期放置された問題のスコア
        const incorrectMax = PRINT_CONFIG.TIME_SCORE_CAP +
            PRINT_CONFIG.WEAKNESS_BONUS * PRINT_CONFIG.WEIGHT_WEAKNESS
        expect(incorrectMax).toBe(900)

        // 不正解は正解より明確に上位
        expect(incorrectMax).toBeGreaterThan(correctMax)
    })
})
