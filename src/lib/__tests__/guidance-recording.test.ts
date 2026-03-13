import { describe, expect, it } from 'vitest';

import {
    formatGuidanceSummaryAsPlainText,
    getGuidanceAudioFileExtension,
    isSupportedGuidanceAudioMimeType,
    pickGuidanceRecordingFormat,
} from '@/lib/guidance-recording';

describe('guidance-recording', () => {
    it('録音形式は webm を優先する', () => {
        const format = pickGuidanceRecordingFormat((mimeType) => mimeType.startsWith('audio/webm'));

        expect(format).toEqual({
            mediaRecorderMimeType: 'audio/webm;codecs=opus',
            uploadMimeType: 'audio/webm',
            fileExtension: 'webm',
        });
    });

    it('webm が使えない場合は mp4 にフォールバックする', () => {
        const format = pickGuidanceRecordingFormat((mimeType) => mimeType.startsWith('audio/mp4'));

        expect(format).toEqual({
            mediaRecorderMimeType: 'audio/mp4;codecs=mp4a.40.2',
            uploadMimeType: 'audio/mp4',
            fileExtension: 'm4a',
        });
    });

    it('対応 MIME は codec 付きでも判定できる', () => {
        expect(isSupportedGuidanceAudioMimeType('audio/webm;codecs=opus')).toBe(true);
        expect(isSupportedGuidanceAudioMimeType('audio/mp4;codecs=mp4a.40.2')).toBe(true);
        expect(isSupportedGuidanceAudioMimeType('audio/wav')).toBe(false);
    });

    it('MIME から拡張子を解決できる', () => {
        expect(getGuidanceAudioFileExtension('audio/webm')).toBe('webm');
        expect(getGuidanceAudioFileExtension('audio/ogg')).toBe('ogg');
        expect(getGuidanceAudioFileExtension('audio/mp4')).toBe('m4a');
    });

    it('面談メモは plain text の構造化形式で整形する', () => {
        const content = formatGuidanceSummaryAsPlainText({
            summary: '英語の学習時間が不足しているため、宿題量を見直す方針になった。',
            topics: ['英語の家庭学習量の見直し'],
            currentStatus: ['学校課題で時間が取られ、英語の自学時間が不足している'],
            concerns: ['英単語の定着が弱く、小テストで取りこぼしがある'],
            agreements: ['平日は毎日20分の英単語学習を行う'],
            nextActions: ['生徒: 次回までに英単語帳を30ページ進める'],
            followUpPoints: ['講師: 次回面談で英単語テストの結果を確認する'],
        });

        expect(content).toContain('面談要約');
        expect(content).toContain('主な話題');
        expect(content).toContain('現在の学習状況');
        expect(content).toContain('課題・懸念点');
        expect(content).toContain('合意事項');
        expect(content).toContain('次回までの行動');
        expect(content).toContain('教室フォロー・次回確認');
        expect(content).toContain('1. 平日は毎日20分の英単語学習を行う');
        expect(content).not.toContain('##');
    });
});
