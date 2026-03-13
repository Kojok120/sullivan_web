import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
    getGuidanceAudioFileExtension,
    GuidanceAudioMimeType,
} from '@/lib/guidance-recording';

const execFileAsync = promisify(execFile);
const GEMINI_GUIDANCE_AUDIO_MIME_TYPE = 'audio/ogg' as const;

export type GeminiGuidanceAudioMimeType = typeof GEMINI_GUIDANCE_AUDIO_MIME_TYPE;

function buildOutputFileName(inputName: string): string {
    const sanitized = inputName.trim();
    const baseName = sanitized.length > 0
        ? sanitized.replace(/\.[^.]+$/, '')
        : `guidance-${Date.now()}`;

    return `${baseName || `guidance-${Date.now()}`}.ogg`;
}

export async function prepareGuidanceAudioForGemini(params: {
    audioFile: File;
    mimeType: GuidanceAudioMimeType;
}): Promise<{
    audioFile: File;
    mimeType: GeminiGuidanceAudioMimeType;
}> {
    if (params.mimeType === GEMINI_GUIDANCE_AUDIO_MIME_TYPE) {
        return {
            audioFile: params.audioFile,
            mimeType: GEMINI_GUIDANCE_AUDIO_MIME_TYPE,
        };
    }

    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'guidance-audio-'));
    const inputPath = path.join(tempDir, `input.${getGuidanceAudioFileExtension(params.mimeType)}`);
    const outputPath = path.join(tempDir, 'output.ogg');

    try {
        const inputBuffer = Buffer.from(await params.audioFile.arrayBuffer());
        await writeFile(inputPath, inputBuffer);

        await execFileAsync(
            ffmpegPath,
            [
                '-y',
                '-loglevel',
                'error',
                '-i',
                inputPath,
                '-vn',
                '-c:a',
                'libopus',
                '-b:a',
                '48k',
                outputPath,
            ],
            { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
        );

        const outputBuffer = await readFile(outputPath);
        return {
            audioFile: new File(
                [outputBuffer],
                buildOutputFileName(params.audioFile.name),
                { type: GEMINI_GUIDANCE_AUDIO_MIME_TYPE },
            ),
            mimeType: GEMINI_GUIDANCE_AUDIO_MIME_TYPE,
        };
    } catch (error) {
        if (
            typeof error === 'object'
            && error !== null
            && 'code' in error
            && error.code === 'ENOENT'
        ) {
            throw new Error('ffmpeg is not installed');
        }

        throw error;
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
}
