import { describe, expect, it } from 'vitest';
import { MediaResolution } from '@google/genai';

import { getGeminiMediaResolutionForMimeType } from '@/lib/gemini-media-resolution';

describe('gemini-media-resolution', () => {
    it('PDF は medium を返す', () => {
        expect(getGeminiMediaResolutionForMimeType('application/pdf')).toBe(
            MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        );
    });

    it('画像は high を返す', () => {
        expect(getGeminiMediaResolutionForMimeType('image/jpeg')).toBe(
            MediaResolution.MEDIA_RESOLUTION_HIGH,
        );
    });

    it('その他 MIME は未指定にする', () => {
        expect(getGeminiMediaResolutionForMimeType('audio/ogg')).toBeUndefined();
    });
});
