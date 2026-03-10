import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildGradingTempFileContext } from '@/lib/grading-temp-path';

describe('grading-temp-path', () => {
    it('同名ファイルでも fileId ごとに保存先を分離する', () => {
        const first = buildGradingTempFileContext('file-1', 'scan.pdf');
        const second = buildGradingTempFileContext('file-2', 'scan.pdf');

        expect(first.jobDirPath).not.toBe(second.jobDirPath);
        expect(first.filePath).not.toBe(second.filePath);
    });

    it('ファイル名を basename 化して危険な文字を除去する', () => {
        const context = buildGradingTempFileContext('file-1', '../スキャン 01?.pdf');

        expect(path.basename(context.filePath)).toBe('01.pdf');
        expect(context.filePath).not.toContain('..');
    });
});
