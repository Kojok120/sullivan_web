import { describe, expect, it } from 'vitest'
import {
    calculateCoreProblemStatus,
    UNLOCK_ANSWER_RATE,
    UNLOCK_CORRECT_RATE,
    getEntryCoreProblemId,
    hasLectureVideos,
} from '@/lib/progression'

describe('calculateCoreProblemStatus', () => {
    it('問題数が0の場合、isPassed=falseを返す', () => {
        const result = calculateCoreProblemStatus(0, 0, 0)
        expect(result).toEqual({
            isPassed: false,
            answerRate: 0,
            correctRate: 0,
        })
    })

    it('未回答の場合、isPassed=falseを返す', () => {
        const result = calculateCoreProblemStatus(10, 0, 0)
        expect(result).toEqual({
            isPassed: false,
            answerRate: 0,
            correctRate: 0,
        })
    })

    it('回答率・正答率が閾値以上の場合、isPassed=trueを返す', () => {
        // 10問中6問回答（60% >= 40%）、6問中4問正解（66.7% >= 50%）
        const result = calculateCoreProblemStatus(10, 6, 4)
        expect(result.isPassed).toBe(true)
        expect(result.answerRate).toBeCloseTo(0.6)
        expect(result.correctRate).toBeCloseTo(4 / 6)
    })

    it('回答率が閾値未満の場合、isPassed=falseを返す', () => {
        // 10問中3問回答（30% < 40%）、正解率は十分
        const result = calculateCoreProblemStatus(10, 3, 3)
        expect(result.isPassed).toBe(false)
        expect(result.answerRate).toBeCloseTo(0.3)
        expect(result.correctRate).toBeCloseTo(1.0)
    })

    it('正答率が閾値未満の場合、isPassed=falseを返す', () => {
        // 10問中4問回答（40% >= 40%）、正解1/4（25% < 50%）
        const result = calculateCoreProblemStatus(10, 4, 1)
        expect(result.isPassed).toBe(false)
        expect(result.answerRate).toBeCloseTo(0.4)
        expect(result.correctRate).toBeCloseTo(0.25)
    })

    it('回答率・正答率がちょうど閾値の場合、isPassed=trueを返す', () => {
        // 閾値ちょうど: answerRate = 40%, correctRate = 50%
        // 10問中4問回答、4問中2問正解
        const result = calculateCoreProblemStatus(10, 4, 2)
        expect(result.isPassed).toBe(true)
        expect(result.answerRate).toBe(UNLOCK_ANSWER_RATE)
        expect(result.correctRate).toBe(UNLOCK_CORRECT_RATE)
    })

    it('全問正解の場合、isPassed=trueを返す', () => {
        const result = calculateCoreProblemStatus(10, 10, 10)
        expect(result.isPassed).toBe(true)
        expect(result.answerRate).toBe(1.0)
        expect(result.correctRate).toBe(1.0)
    })

    it('正答率は回答済み問題数に対して計算される', () => {
        // 正答率 = 正解数 / 回答済み問題数（全問題数ではない）
        const result = calculateCoreProblemStatus(100, 2, 2)
        expect(result.correctRate).toBe(1.0) // 2/2 = 100%
        expect(result.answerRate).toBe(0.02) // 2/100 = 2%
        expect(result.isPassed).toBe(false) // 回答率が足りない
    })
})

describe('getEntryCoreProblemId', () => {
    it('order昇順で最初のCoreProblemを返す', () => {
        const result = getEntryCoreProblemId([
            { id: 'cp-2', order: 2 },
            { id: 'cp-1', order: 1 },
            { id: 'cp-3', order: 3 },
        ])
        expect(result).toBe('cp-1')
    })

    it('order同値の場合はid昇順で先頭を返す', () => {
        const result = getEntryCoreProblemId([
            { id: 'cp-b', order: 1 },
            { id: 'cp-a', order: 1 },
            { id: 'cp-c', order: 1 },
        ])
        expect(result).toBe('cp-a')
    })

    it('空配列の場合はnullを返す', () => {
        expect(getEntryCoreProblemId([])).toBeNull()
    })
})

describe('hasLectureVideos', () => {
    it('配列で1件以上あればtrue', () => {
        expect(hasLectureVideos([{ title: '動画1', url: 'https://example.com' }])).toBe(true)
    })

    it('空配列または配列以外はfalse', () => {
        expect(hasLectureVideos([])).toBe(false)
        expect(hasLectureVideos(null)).toBe(false)
        expect(hasLectureVideos({ title: '動画1' })).toBe(false)
    })
})
