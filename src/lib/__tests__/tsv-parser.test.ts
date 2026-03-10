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

    it('問題 TSV では先頭以外のヘッダー形式の行を自動除外しない', () => {
        const rows = parseProblemTSV([
            '1\t中1\t方程式\t通常の問題\tx=3',
            'マスタ内問題番号\t学年\tCoreProblem名\t問題文\t正解',
        ].join('\n'));

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            masterNumber: 1,
            grade: '中1',
            coreProblemName: '方程式',
        });
        expect(rows[1]).toMatchObject({
            masterNumber: undefined,
            grade: '学年',
            coreProblemName: 'CoreProblem名',
        });
    });

    it('問題 TSV で skipHeader=false のときはヘッダー行もデータとして扱う', () => {
        const rows = parseProblemTSV([
            'マスタ内問題番号\t学年\tCoreProblem名\t問題文\t正解',
            '1\t中1\t方程式\t学年別の考え方を説明する問題\tx=3',
        ].join('\n'), false);

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            masterNumber: undefined,
            grade: '学年',
            coreProblemName: 'CoreProblem名',
            question: '問題文',
            answer: '正解',
        });
        expect(rows[1]).toMatchObject({
            masterNumber: 1,
            grade: '中1',
            coreProblemName: '方程式',
        });
    });

    it('問題 TSV の旧ヘッダー形式でも列ずれせずに読み込む', () => {
        const rows = parseProblemTSV([
            '学年\tCoreProblem名\t問題文\t正解\t別解\t動画URL',
            '中2\t連立方程式\t連立方程式を解け\tx=1,y=2\tx=2,y=1\thttps://example.com/movie',
        ].join('\n'));

        expect(rows).toEqual([
            {
                masterNumber: undefined,
                grade: '中2',
                coreProblemName: '連立方程式',
                coreProblemNames: ['連立方程式'],
                question: '連立方程式を解け',
                answer: 'x=1,y=2',
                acceptedAnswers: ['x=2', 'y=1'],
                videoUrl: 'https://example.com/movie',
            },
        ]);
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

    it('CoreProblem TSV でも先頭以外のヘッダー形式の行は残す', () => {
        const rows = parseCoreProblemTSV([
            '1\t一次関数\t導入\thttps://example.com/movie',
            'マスタNo\tCoreProblem名\t動画タイトル1\t動画URL1',
        ].join('\n'));

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            masterNumber: 1,
            name: '一次関数',
        });
        expect(rows[1]).toMatchObject({
            masterNumber: undefined,
            masterNumberRaw: 'マスタNo',
            name: 'CoreProblem名',
        });
    });
});
