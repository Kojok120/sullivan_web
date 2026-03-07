import { MediaResolution } from '@google/genai';

export function getGeminiMediaResolutionForMimeType(mimeType: string) {
    const normalized = mimeType.trim().toLowerCase();
    if (normalized === 'application/pdf') {
        return MediaResolution.MEDIA_RESOLUTION_MEDIUM;
    }

    if (normalized.startsWith('image/')) {
        return MediaResolution.MEDIA_RESOLUTION_HIGH;
    }

    return undefined;
}
