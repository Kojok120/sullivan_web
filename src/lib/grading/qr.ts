import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

import { prisma } from '@/lib/prisma';
import { loadInstructionPrompt as loadPrompt } from '@/lib/instruction-prompt';
import { expandProblemIds, type QRData } from '@/lib/qr-utils';

import { getDrive, getGenAI, MAX_GRADING_FILE_SIZE_BYTES } from './context';
import type { AnalyzedFile, PreparedFile } from './types';

const PYTHON_SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'qr_reader.py');
const PYTHON_CMD = '/usr/bin/python3';

export function getStudentIdFromQr(qrData: QRData | null): string | null {
    if (!qrData) return null;
    return qrData.s || null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function normalizeQrData(raw: unknown): QRData | null {
    if (!isRecord(raw)) return null;

    const normalized: QRData = {};

    if (raw.s !== undefined && raw.s !== null) {
        normalized.s = String(raw.s).trim();
    }

    if (raw.c !== undefined && raw.c !== null) {
        normalized.c = String(raw.c).trim();
    }

    if (raw.u !== undefined && raw.u !== null) {
        const unitToken = String(raw.u).trim();
        if (unitToken) {
            normalized.u = unitToken;
        }
    }

    if (raw.p !== undefined && raw.p !== null) {
        if (Array.isArray(raw.p)) {
            const list = raw.p.map((id) => String(id).trim()).filter(Boolean);
            if (list.length > 0) {
                normalized.p = list.join(',');
            }
        } else if (typeof raw.p === 'string') {
            const trimmed = raw.p.trim();
            let parsedArray = false;
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        parsedArray = true;
                        const list = parsed.map((id) => String(id).trim()).filter(Boolean);
                        if (list.length > 0) {
                            normalized.p = list.join(',');
                        }
                    }
                } catch {
                    // JSONでなければ生文字列扱いにフォールバック
                }
            }
            if (!normalized.p && !parsedArray) {
                normalized.p = trimmed;
            }
        }
    }

    if (!normalized.s && !normalized.p && !normalized.c && !normalized.u) return null;
    return normalized;
}

export function parseJSON(text: string): unknown {
    try {
        let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        if (clean.startsWith('JSON')) clean = clean.substring(4).trim();
        return JSON.parse(clean);
    } catch (error) {
        console.error('JSON Parse Error', error);
        return null;
    }
}

export async function readQRCodeLocally(filePath: string): Promise<QRData | null> {
    try {
        if (!fs.existsSync(PYTHON_SCRIPT_PATH)) {
            console.warn('Python QR script not found at', PYTHON_SCRIPT_PATH);
            return null;
        }

        console.log('Local QR Read: Calling Python OpenCV...');

        const safeFilePath = path.resolve(path.dirname(filePath), path.basename(filePath));

        const result = await new Promise<string>((resolve, reject) => {
            const proc = spawn(PYTHON_CMD, [PYTHON_SCRIPT_PATH, safeFilePath]);
            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(`Python exited with code ${code}: ${stderr}`));
                }
            });
            proc.on('error', reject);
        });

        const trimmed = result.trim();
        if (!trimmed) {
            console.log('Local QR Read Failed (Python returned empty)');
            return null;
        }

        try {
            const json = normalizeQrData(JSON.parse(trimmed));
            if (!json) {
                console.warn('Python returned invalid QR data:', trimmed);
                return null;
            }
            console.log('Local QR Read Success (Python OpenCV):', json);
            return json;
        } catch {
            console.warn('Python returned non-JSON:', trimmed);
            return null;
        }
    } catch (error) {
        console.error('Local QR Read Error (Python exec):', error);
        return null;
    }
}

export async function prepareFileForGemini(filePath: string): Promise<PreparedFile> {
    const stats = await fs.promises.stat(filePath);
    if (stats.size <= 0) {
        throw new Error('Input file is empty');
    }

    if (stats.size > MAX_GRADING_FILE_SIZE_BYTES) {
        throw new Error(
            `Input file is too large (${stats.size} bytes > ${MAX_GRADING_FILE_SIZE_BYTES} bytes)`,
        );
    }

    const headerBuffer = Buffer.alloc(4);
    const fileHandle = await fs.promises.open(filePath, 'r');
    try {
        await fileHandle.read(headerBuffer, 0, 4, 0);
    } finally {
        await fileHandle.close();
    }

    const base64Data = await fs.promises.readFile(filePath, { encoding: 'base64' });

    const headerHex = headerBuffer.toString('hex');
    const isPdfHeader = headerHex === '25504446';
    const mimeType = isPdfHeader
        ? 'application/pdf'
        : filePath.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'image/jpeg';

    console.log(`Detected MIME Type: ${mimeType} (Header: ${headerHex}, size=${stats.size})`);

    return {
        base64Data,
        mimeType,
        isPdfHeader,
    };
}

export async function scanQRWithGemini(modelName: string, base64Data: string, mimeType: string): Promise<QRData | null> {
    try {
        const prompt = loadPrompt('qr-scan-prompt.md');

        const result = await getGenAI().models.generateContent({
            model: modelName,
            contents: [
                { text: prompt },
                {
                    inlineData: {
                        data: base64Data,
                        mimeType,
                    },
                },
            ],
        });
        const text = result.text || '';
        console.log('Gemini QR Scan Response:', text);
        const parsed = parseJSON(text);
        return normalizeQrData(parsed);
    } catch (error) {
        console.error('Gemini QR Scan Error:', error);
        return null;
    }
}

export async function getQrDataWithFallback(filePath: string, prepared: PreparedFile): Promise<QRData | null> {
    let qrData: QRData | null = null;
    if (!prepared.isPdfHeader) {
        qrData = await readQRCodeLocally(filePath);
    } else {
        console.log('Skipping local QR read for PDF file.');
    }

    const hasStudentId = !!getStudentIdFromQr(qrData);
    const hasProblems = qrData ? expandProblemIds(qrData).length > 0 : false;

    if (!hasStudentId || !hasProblems) {
        console.log('Local QR read failed/skipped or incomplete. Attempting to scan QR with Gemini...');
        const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
        qrData = await scanQRWithGemini(modelName, prepared.base64Data, prepared.mimeType);
    }

    return qrData;
}

export async function resolveUserFromQr(qrData: QRData) {
    const userId = getStudentIdFromQr(qrData);
    if (!userId) return null;
    return prisma.user.findUnique({
        where: { loginId: userId },
    });
}

export async function downloadAndAnalyzeFile(fileId: string, fileName: string): Promise<AnalyzedFile> {
    const destPath = path.join(os.tmpdir(), fileName);

    const cleanup = async () => {
        try {
            if (fs.existsSync(destPath)) {
                await fs.promises.unlink(destPath);
            }
        } catch (cleanupError) {
            console.error(`[Cleanup] Failed to unlink ${destPath}:`, cleanupError);
        }
    };

    try {
        await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

        const dest = fs.createWriteStream(destPath);
        const driveClient = getDrive();
        const res = await driveClient.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' },
        );

        await new Promise<void>((resolve, reject) => {
            res.data
                .on('error', (err: unknown) => reject(err))
                .pipe(dest)
                .on('error', (err: unknown) => reject(err))
                .on('finish', () => resolve());
        });

        const stats = await fs.promises.stat(destPath);
        console.log(`Downloaded ${fileName}: ${stats.size} bytes`);

        const prepared = await prepareFileForGemini(destPath);
        const qrData = await getQrDataWithFallback(destPath, prepared);

        const studentId = getStudentIdFromQr(qrData);
        let user = null;
        if (qrData) {
            user = await resolveUserFromQr(qrData);
        }

        return { destPath, prepared, qrData, studentId, user, cleanup };
    } catch (error) {
        await cleanup();
        throw error;
    }
}
