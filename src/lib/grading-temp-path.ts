import os from 'node:os';
import path from 'node:path';

const GRADING_TEMP_ROOT_DIR = 'sullivan-grading';

function sanitizeSegment(value: string, fallback: string, maxLength: number) {
    const normalized = value
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[_ .-]+|[_ .-]+$/g, '')
        .slice(0, maxLength);

    return normalized || fallback;
}

function sanitizeFileName(fileName: string) {
    const baseName = path.basename(fileName).trim();
    const normalizedBaseName = baseName || 'upload';
    const ext = path.extname(normalizedBaseName);
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 16);
    const stem = ext ? normalizedBaseName.slice(0, -ext.length) : normalizedBaseName;
    const safeStem = sanitizeSegment(stem, 'upload', 80);

    return `${safeStem}${safeExt}`;
}

export function buildGradingTempFileContext(fileId: string, fileName: string) {
    const safeFileId = sanitizeSegment(fileId, 'unknown-file', 120);
    const safeFileName = sanitizeFileName(fileName);
    const jobDirPath = path.join(os.tmpdir(), GRADING_TEMP_ROOT_DIR, safeFileId);

    return {
        jobDirPath,
        filePath: path.join(jobDirPath, safeFileName),
        safeFileName,
    };
}
