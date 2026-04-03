import { describe, it, expect } from 'vitest'
import { PRINT_CONFIG } from '@/lib/print-algo'

describe('PRINT_CONFIG', () => {
    it('設定値が期待通りであること', () => {
        expect(PRINT_CONFIG.WEIGHT_TIME).toBe(2.0)
        expect(PRINT_CONFIG.WEIGHT_WEAKNESS).toBe(1.0)
        expect(PRINT_CONFIG.WEIGHT_UNANSWERED).toBe(1.5)
        expect(PRINT_CONFIG.FORGETTING_RATE).toBe(5.0)
    })

    it('忘却スコアは日数に比例して増加する', () => {
        // 1日経過: 5.0 * 2.0 = 10
        const score1Day = 1 * PRINT_CONFIG.FORGETTING_RATE * PRINT_CONFIG.WEIGHT_TIME
        expect(score1Day).toBe(10)

        // 7日経過: 5.0 * 7 * 2.0 = 70
        const score7Days = 7 * PRINT_CONFIG.FORGETTING_RATE * PRINT_CONFIG.WEIGHT_TIME
        expect(score7Days).toBe(70)

        // 日数が長いほどスコアが高い
        expect(score7Days).toBeGreaterThan(score1Day)
    })

    it('未回答の問題のベーススコアが忘却スコアより高い（初期段階）', () => {
        // 未回答: 100 * 1.5 = 150
        const unansweredScore = 100 * PRINT_CONFIG.WEIGHT_UNANSWERED

        // 1日前に回答: 1 * 5.0 * 2.0 = 10
        const oneDayForgotten = 1 * PRINT_CONFIG.FORGETTING_RATE * PRINT_CONFIG.WEIGHT_TIME

        expect(unansweredScore).toBeGreaterThan(oneDayForgotten)
    })

    it('15日以上経過した問題は未回答問題と同等以上のスコアになる', () => {
        const unansweredScore = 100 * PRINT_CONFIG.WEIGHT_UNANSWERED
        const fifteenDayScore = 15 * PRINT_CONFIG.FORGETTING_RATE * PRINT_CONFIG.WEIGHT_TIME
        // 15日: 15 * 5.0 * 2.0 = 150 >= 150
        expect(fifteenDayScore).toBeGreaterThanOrEqual(unansweredScore)
    })
})
