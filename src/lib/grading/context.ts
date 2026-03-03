import { GoogleGenAI } from '@google/genai';

import { getDriveClient } from '@/lib/drive-client';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const DEFAULT_MAX_GRADING_FILE_SIZE_MB = 20;
const MAX_GRADING_FILE_SIZE_MB = (() => {
    const parsed = Number.parseInt(process.env.MAX_GRADING_FILE_SIZE_MB || '', 10);
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_GRADING_FILE_SIZE_MB;
    return Math.min(100, Math.max(1, parsed));
})();

export const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '';
export const MAX_GRADING_FILE_SIZE_BYTES = MAX_GRADING_FILE_SIZE_MB * 1024 * 1024;

let genAI: GoogleGenAI | null = null;

export function getGenAI() {
    if (!genAI) {
        if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
        genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    }
    return genAI;
}

export function getDrive() {
    return getDriveClient();
}
