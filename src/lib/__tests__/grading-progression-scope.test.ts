import { describe, expect, it } from 'vitest'
import {
    buildProgressionUpdateScope,
    filterCoreProblemIdsByScope,
    filterCoreProblemsByScope,
} from '@/lib/grading-progression-scope'

describe('grading-progression-scope', () => {
    it('target がなければスコープ制限しない', () => {
        const scope = buildProgressionUpdateScope(['cp-1'], null)
        expect(scope).toBeNull()
        expect(filterCoreProblemIdsByScope(['cp-1', 'cp-2'], scope)).toEqual(['cp-1', 'cp-2'])
    })

    it('target があればアンロック済み + target のみを許可する', () => {
        const scope = buildProgressionUpdateScope(['cp-1', 'cp-2'], 'cp-3')
        expect(scope).not.toBeNull()
        expect(filterCoreProblemIdsByScope(['cp-1', 'cp-3', 'cp-9'], scope)).toEqual(['cp-1', 'cp-3'])
    })

    it('CoreProblem オブジェクト配列も同様にフィルタできる', () => {
        const scope = new Set(['cp-2'])
        const filtered = filterCoreProblemsByScope(
            [
                { id: 'cp-1', name: 'a' },
                { id: 'cp-2', name: 'b' }
            ],
            scope
        )
        expect(filtered).toEqual([{ id: 'cp-2', name: 'b' }])
    })
})
