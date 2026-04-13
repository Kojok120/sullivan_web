import { describe, expect, it } from 'vitest'
import { compressProblemIds, decodeUnitToken, encodeUnitToken, expandProblemIds } from '@/lib/qr-utils'

describe('qr-utils', () => {
    it('連番IDを圧縮して展開できる', () => {
        const compressed = compressProblemIds(['E-1', 'E-2', 'E-3', 'E-5'])
        expect(compressed).toEqual({ c: 'E|1-3,5' })

        const expanded = expandProblemIds({ ...compressed, s: 'S0001' })
        expect(expanded).toEqual(['E-1', 'E-2', 'E-3', 'E-5'])
    })

    it('unit token を encode/decode できる', () => {
        const token = encodeUnitToken(6)
        expect(token).toBe('6')
        expect(decodeUnitToken(token || '')).toBe(6)
    })

    it('無効な unit token は null を返す', () => {
        expect(encodeUnitToken(0)).toBeNull()
        expect(encodeUnitToken(-1)).toBeNull()
        expect(encodeUnitToken(1.5)).toBeNull()

        expect(decodeUnitToken('')).toBeNull()
        expect(decodeUnitToken('!!')).toBeNull()
        expect(decodeUnitToken('  ')).toBeNull()
    })

    it('u があっても問題ID展開には影響しない', () => {
        const expanded = expandProblemIds({
            s: 'S0007',
            c: 'E|10-11',
            u: '6'
        })
        expect(expanded).toEqual(['E-10', 'E-11'])
    })

    it('不正な問題IDは fail fast で弾く', () => {
        expect(() => compressProblemIds(['invalid-id'])).toThrow('QR圧縮対象の問題IDが不正です')
        expect(() => compressProblemIds(['M-1', 'S-2'])).toThrow('QR圧縮対象の問題IDプレフィックスが混在しています')
    })
})
