import { describe, expect, it } from 'vitest';

import { buildPrintPdfCacheKey, buildProblemIdsHash } from '@/lib/print-pdf/render-service';
import type { PrintableProblem } from '@/lib/print-types';

function makeProblem(id: string, customId = `E-${id}`): PrintableProblem {
    return {
        id,
        customId,
        order: 0,
    };
}

describe('print-pdf render service helpers', () => {
    it('問題ID配列から安定したハッシュを生成する', () => {
        const hashA = buildProblemIdsHash([
            [makeProblem('p1', 'E-1001'), makeProblem('p2', 'E-1002')],
            [makeProblem('p3', 'E-1003')],
        ]);

        const hashB = buildProblemIdsHash([
            [makeProblem('p1', 'E-1001'), makeProblem('p2', 'E-1002')],
            [makeProblem('p3', 'E-1003')],
        ]);

        const hashC = buildProblemIdsHash([
            [makeProblem('p1', 'E-1001'), makeProblem('p2', 'E-1002')],
            [makeProblem('p3', 'E-1004')],
        ]);

        expect(hashA).toBe(hashB);
        expect(hashA).not.toBe(hashC);
    });

    it('キャッシュキーに対象ユーザーと問題ハッシュを含める', () => {
        const cacheKey = buildPrintPdfCacheKey({
            targetUserId: 'user-1',
            subjectId: 'subject-1',
            coreProblemId: 'cp-1',
            sets: 3,
            problemIdsHash: 'abc123',
        });

        expect(cacheKey).toBe('user-1:subject-1:cp-1:3:abc123');
    });

    it('coreProblemId未指定時はallを使う', () => {
        const cacheKey = buildPrintPdfCacheKey({
            targetUserId: 'user-1',
            subjectId: 'subject-1',
            sets: 1,
            problemIdsHash: 'abc123',
        });

        expect(cacheKey).toBe('user-1:subject-1:all:1:abc123');
    });
});
