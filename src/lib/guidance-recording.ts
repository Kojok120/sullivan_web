export type GuidanceSummary = {
    summary: string;
    topics: string[];
    currentStatus: string[];
    concerns: string[];
    agreements: string[];
    nextActions: string[];
    followUpPoints: string[];
};

export type GuidanceAudioMimeType = 'audio/webm' | 'audio/ogg' | 'audio/mp4';

export type GuidanceRecordingFormat = {
    mediaRecorderMimeType: string;
    uploadMimeType: GuidanceAudioMimeType;
    fileExtension: 'webm' | 'ogg' | 'm4a';
};

export const MAX_GUIDANCE_AUDIO_SIZE_LIMIT_BYTES = 20 * 1024 * 1024;
export const MAX_GUIDANCE_AUDIO_AUTO_STOP_BYTES = MAX_GUIDANCE_AUDIO_SIZE_LIMIT_BYTES - (512 * 1024);
export const MAX_GUIDANCE_AUDIO_SIZE_LIMIT_LABEL = `${MAX_GUIDANCE_AUDIO_SIZE_LIMIT_BYTES / (1024 * 1024)}MB`;

const SUPPORTED_GUIDANCE_AUDIO_MIME_TYPES = new Set<GuidanceAudioMimeType>([
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
]);

const FILE_EXTENSION_BY_MIME_TYPE: Record<GuidanceAudioMimeType, GuidanceRecordingFormat['fileExtension']> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
};

export const GUIDANCE_RECORDING_FORMAT_CANDIDATES: readonly GuidanceRecordingFormat[] = [
    {
        mediaRecorderMimeType: 'audio/ogg;codecs=opus',
        uploadMimeType: 'audio/ogg',
        fileExtension: 'ogg',
    },
    {
        mediaRecorderMimeType: 'audio/ogg',
        uploadMimeType: 'audio/ogg',
        fileExtension: 'ogg',
    },
    {
        mediaRecorderMimeType: 'audio/webm;codecs=opus',
        uploadMimeType: 'audio/webm',
        fileExtension: 'webm',
    },
    {
        mediaRecorderMimeType: 'audio/webm',
        uploadMimeType: 'audio/webm',
        fileExtension: 'webm',
    },
    {
        mediaRecorderMimeType: 'audio/mp4;codecs=mp4a.40.2',
        uploadMimeType: 'audio/mp4',
        fileExtension: 'm4a',
    },
    {
        mediaRecorderMimeType: 'audio/mp4',
        uploadMimeType: 'audio/mp4',
        fileExtension: 'm4a',
    },
];

export function normalizeGuidanceAudioMimeType(value: string | null | undefined): string {
    return value?.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function isSupportedGuidanceAudioMimeType(value: string | null | undefined): value is GuidanceAudioMimeType {
    const normalized = normalizeGuidanceAudioMimeType(value);
    return SUPPORTED_GUIDANCE_AUDIO_MIME_TYPES.has(normalized as GuidanceAudioMimeType);
}

export function pickGuidanceRecordingFormat(
    isTypeSupported: (mimeType: string) => boolean,
): GuidanceRecordingFormat | null {
    for (const candidate of GUIDANCE_RECORDING_FORMAT_CANDIDATES) {
        if (isTypeSupported(candidate.mediaRecorderMimeType)) {
            return candidate;
        }
    }

    return null;
}

export function getGuidanceAudioFileExtension(
    mimeType: GuidanceAudioMimeType,
): GuidanceRecordingFormat['fileExtension'] {
    return FILE_EXTENSION_BY_MIME_TYPE[mimeType];
}

function formatSectionItems(items: string[]): string {
    if (items.length === 0) {
        return 'なし';
    }

    return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

export function formatGuidanceSummaryAsPlainText(summary: GuidanceSummary): string {
    return [
        '面談要約',
        summary.summary,
        '',
        '主な話題',
        formatSectionItems(summary.topics),
        '',
        '現在の学習状況',
        formatSectionItems(summary.currentStatus),
        '',
        '課題・懸念点',
        formatSectionItems(summary.concerns),
        '',
        '合意事項',
        formatSectionItems(summary.agreements),
        '',
        '次回までの行動',
        formatSectionItems(summary.nextActions),
        '',
        '教室フォロー・次回確認',
        formatSectionItems(summary.followUpPoints),
    ].join('\n');
}
