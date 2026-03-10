import { describe, expect, it } from 'vitest';

import { parseCoreProblemTSV, parseProblemTSV } from '@/lib/tsv-parser';

describe('tsv-parser', () => {
    it('問題 TSV ではヘッダー行だけを除外する', () => {
        const rows = parseProblemTSV([
            'マスタ内問題番号\t学年\tCoreProblem名\t問題文\t正解',
            '1\t中1\t方程式\t学年別の考え方を説明する問題\tx=3',
        ].join('\n'));

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            masterNumber: 1,
            grade: '中1',
            coreProblemName: '方程式',
        });
    });

    it('CoreProblem TSV ではデータ行に CoreProblem が含まれても除外しない', () => {
        const rows = parseCoreProblemTSV([
            'マスタNo\tCoreProblem名\t動画タイトル1\t動画URL1',
            '1\tCoreProblem演習\t導入\thttps://example.com/movie',
        ].join('\n'));

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            masterNumber: 1,
            name: 'CoreProblem演習',
            lectureVideos: [
                {
                    title: '導入',
                    url: 'https://example.com/movie',
                },
            ],
        });
    });
});
