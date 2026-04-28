import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    buildInterviewSummaryPrompt,
    normalizeGuidanceSummaryError,
    parseGuidanceSummaryResponse,
    waitForGeminiFileActive,
} from '@/lib/guidance-summary';

describe('guidance-summary', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('JSON コードフェンス付きの応答を構造化データへ変換する', () => {
        const parsed = parseGuidanceSummaryResponse(`\`\`\`json
{
  "summary": "学習時間の確保方法を中心に面談した。",
  "topics": ["学習時間", "宿題"],
  "currentStatus": ["英語の学習時間が不足している"],
  "concerns": ["宿題の着手が遅れがち"],
  "agreements": ["学習開始時刻を固定する"],
  "nextActions": ["生徒: 毎日19時に英語を30分進める"],
  "followUpPoints": ["次回面談で実施率を確認する"]
}
\`\`\``);

        expect(parsed.summary).toBe('学習時間の確保方法を中心に面談した。');
        expect(parsed.topics).toEqual(['学習時間', '宿題']);
        expect(parsed.nextActions).toEqual(['生徒: 毎日19時に英語を30分進める']);
    });

    it('ffmpeg 未導入エラーを専用コードへ正規化する', () => {
        expect(normalizeGuidanceSummaryError(new Error('ffmpeg is not installed'), 'unexpected')).toEqual({
            code: 'ffmpeg_missing',
            userMessage: '音声変換に必要な ffmpeg が見つかりませんでした。',
            logMessage: 'ffmpeg is not installed',
        });
    });

    it('プロンプトへ面談メタ情報を埋め込む', () => {
        const prompt = buildInterviewSummaryPrompt({
            studentName: '山田太郎',
            teacherName: '佐藤先生',
            recordedAt: new Date('2026-04-05T01:23:00.000Z'),
            durationMinutes: 18,
            timeZone: 'Asia/Tokyo',
        });

        expect(prompt).toContain('生徒名: 山田太郎');
        expect(prompt).toContain('面談担当: 佐藤先生');
        expect(prompt).toContain('録音時間(分): 18');
    });

    it('Gemini file が FAILED の場合は失敗扱いにする', async () => {
        await expect(waitForGeminiFileActive({
            ai: {
                files: {
                    get: vi.fn().mockResolvedValue({
                        state: 'FAILED',
                        error: { message: 'processing failed' },
                    }),
                },
            } as never,
            fileName: 'files/abc',
        })).rejects.toMatchObject({
            code: 'gemini_file_processing_failed',
        });
    });
});
