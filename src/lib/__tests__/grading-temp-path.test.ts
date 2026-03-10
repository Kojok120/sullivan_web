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

    it('fileId が空でも unknown-file を使って保存先を作る', () => {
        const context = buildGradingTempFileContext('', 'scan.pdf');

        expect(context.jobDirPath).toContain('unknown-file');
    });

    it('fileName が空でも upload を使う', () => {
        const context = buildGradingTempFileContext('file-1', '');

        expect(context.safeFileName).toBe('upload');
    });

    it('長いファイル名は上限長に収まるよう切り詰める', () => {
        const context = buildGradingTempFileContext('file-1', `${'a'.repeat(100)}.pdf`);

        expect(context.safeFileName.length).toBeLessThanOrEqual(84);
        expect(context.safeFileName.endsWith('.pdf')).toBe(true);
    });

    it('拡張子だけのファイル名でも安全な名前に正規化する', () => {
        const context = buildGradingTempFileContext('file-1', '.gitignore');

        expect(context.safeFileName).toBe('gitignore');
    });
});
