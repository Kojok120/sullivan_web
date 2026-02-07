import { google } from 'googleapis';
import QRCode from 'qrcode';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Client as QStashClient } from '@upstash/qstash';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { calculateCoreProblemStatus } from '@/lib/progression';
import { emitRealtimeEvent } from '@/lib/realtime-events';
import { incrementStampCount } from '@/lib/stamp-service';
import { processGamificationUpdates, toGamificationPayload } from '@/lib/gamification-service';
import { acquireGradingFileLock, releaseGradingFileLock } from '@/lib/grading-lock';
import { claimGradingJob, markGradingJobCompleted, markGradingJobFailed } from '@/lib/grading-job';

// Priority adjustment logic (inlined from removed priority-algo.ts)
type Evaluation = "A" | "B" | "C" | "D";
function calculateNewPriority(currentPriority: number, evaluation: Evaluation): number {
    const adjustments: Record<Evaluation, number> = {
        A: -10,  // Correct: Lower priority
        B: -5,   // Mostly correct: Slightly lower
        C: 5,    // Incorrect: Higher priority
        D: 10,   // Very wrong: Much higher priority
    };
    return currentPriority + adjustments[evaluation];
}

// Configuration
import { getDriveClient } from '@/lib/drive-client';

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || ''; // Folder to watch
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Lazy Initialization
let genAI: GoogleGenerativeAI | null = null;
function getGenAI() {
    if (!genAI) {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    }
    return genAI;
}

import { QRData, compressProblemIds, expandProblemIds } from '@/lib/qr-utils';

// Deprecated local getDrive removed in favor of shared getDriveClient
function getDrive() {
    return getDriveClient();
}

/**
 * Loads a prompt from a markdown file in the instructions directory.
 * Replaces {{key}} placeholders with values from the variables object.
 */
function loadPrompt(filename: string, variables: Record<string, any> = {}): string {
    const filePath = path.join(process.cwd(), 'instructions', filename);
    let content = fs.readFileSync(filePath, 'utf-8');
    for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    return content;
}

function getStudentIdFromQr(qrData: QRData | null): string | null {
    if (!qrData) return null;
    return qrData.s || null;
}

// 1. Generate QR Code
export async function generateQRCode(studentId: string, problemIds: string[]): Promise<string> {
    // Attempt compression
    const compressed = compressProblemIds(problemIds);

    const data: QRData = {
        s: studentId,
        ...compressed
    };

    const json = JSON.stringify(data);
    // Balance robustness and density with moderate error correction
    return await QRCode.toDataURL(json, {
        errorCorrectionLevel: 'M',
        width: 300, // Ensure sufficient resolution
        margin: 4
    });
}

// 2. Poll Drive for New Files
import { acquireGradingLock, releaseGradingLock } from '@/lib/grading-lock';

export async function secureDriveCheck(reason: string) {
    const lockAcquired = await acquireGradingLock();
    if (!lockAcquired) {
        console.log(`[DriveCheck] Skipped (${reason}): lock active.`);
        return;
    }

    try {
        console.log(`[DriveCheck] Starting (${reason}).`);
        await checkDriveForNewFiles();
    } catch (error) {
        console.error(`[DriveCheck] Failed (${reason}):`, error);
    } finally {
        await releaseGradingLock();
    }
}

export async function checkDriveForNewFiles() {
    if (!DRIVE_FOLDER_ID) {
        console.error('DRIVE_FOLDER_ID is not set');
        return;
    }

    try {
        const driveClient = getDrive();
        const res = await driveClient.files.list({
            q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
            fields: 'files(id, name, mimeType, createdTime)',
            orderBy: 'createdTime desc',
            pageSize: 10, // Process a few at a time
        });

        const files = res.data.files;
        if (!files || files.length === 0) {
            console.log('No files found.');
            return;
        }

        // 処理対象ファイルをフィルタリング
        const filesToProcess = files.filter((file: { id?: string | null; name?: string | null }) =>
            file.id && file.name &&
            !file.name.startsWith('[PROCESSED]') &&
            !file.name.startsWith('[ERROR]')
        );

        if (filesToProcess.length === 0) {
            console.log('No new files to process.');
            return;
        }

        // 並列でジョブを発行（スループット向上）
        await Promise.all(
            filesToProcess.map((file: { id?: string | null; name?: string | null }) => {
                console.log(`Queuing grading job for file: ${file.name} (${file.id})`);
                return triggerGradingJob(file.id!, file.name!);
            })
        );

    } catch (error) {
        console.error('Error checking Drive:', error);
    }

    // Also check for stuck files
    await checkStuckFiles();
}


// 3. Process File (Now Exported for API Route)

// Helper to consolidate File I/O and QR Analysis
type AnalyzedFile = {
    destPath: string;
    prepared: PreparedFile;
    qrData: QRData | null;
    studentId: string | null;
    user: any | null; // Prisma User
    cleanup: () => Promise<void>;
};

async function downloadAndAnalyzeFile(fileId: string, fileName: string): Promise<AnalyzedFile> {
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
        // Ensure parent dir exists
        await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

        const dest = fs.createWriteStream(destPath);
        const driveClient = getDrive();
        const res = await driveClient.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        await new Promise((resolve, reject) => {
            res.data
                .on('error', (err: any) => reject(err))
                .pipe(dest)
                .on('error', (err: any) => reject(err))
                .on('finish', () => resolve(true));
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

export async function processFile(fileId: string, fileName: string) {
    const lockAcquired = await acquireGradingFileLock(fileId);
    if (!lockAcquired) {
        console.log(`[Lock] File ${fileId} is already being processed. Skipping.`);
        return;
    }

    let destPath = "";
    let jobFinalized = false;

    const finalizeFailure = async (message: string) => {
        if (jobFinalized) return;
        jobFinalized = true;
        await markGradingJobFailed(fileId, message);
    };

    const finalizeSuccess = async () => {
        if (jobFinalized) return;
        jobFinalized = true;
        await markGradingJobCompleted(fileId);
    };

    let cleanupFn = async () => { };

    try {
        const claim = await claimGradingJob(fileId, fileName);
        if (!claim.shouldProcess) {
            console.log(`[Idempotency] Skip file ${fileId} (${claim.reason ?? 'unknown'}).`);
            return;
        }

        // Use helper for download and analysis
        const { destPath, prepared, qrData, studentId, user, cleanup } = await downloadAndAnalyzeFile(fileId, fileName);
        cleanupFn = cleanup;

        if (!qrData) {
            console.error("Failed to extract QR data (Local & AI) from", destPath);
            await renameFile(fileId, `[ERROR] ${fileName}`);
            await finalizeFailure('QR data not found');
            return;
        }

        if (!studentId) {
            console.error("QR data missing student ID for", destPath);
            await renameFile(fileId, `[ERROR] ${fileName}`);
            await finalizeFailure('Student ID not found');
            return;
        }

        // SECURITY: Mask student ID in logs
        const pidsCount = expandProblemIds(qrData).length;
        console.log(`QR Found: Student=...${studentId.slice(-4)}, Problems=${pidsCount}`);

        if (!user) {
            console.error(`User for QR ID ${studentId} not found in DB (checked loginId and id).`);
            await renameFile(fileId, `[ERROR] ${fileName}`);
            await finalizeFailure('User not found');
            return;
        }

        console.log(`Resolved User: ${user.name} (${user.loginId}) -> ${user.id}`);

        // Stamp is the canonical "upload time" trigger (before grading completes).
        try {
            await incrementStampCount(user.id);
            console.log(`[Effort] Incremented stamp count for user ${user.id}.`);
        } catch (e) {
            console.error("[Effort] Failed to update stamp count:", e);
        }

        // Grade using Gemini with prepared data
        const results = await gradeWithGemini(prepared, qrData, user.id);

        // Update DB
        if (results && results.length > 0) {
            await recordGradingResults(results);

            // [GAMIFICATION] Process XP, Streaks, Achievements
            try {
                const gamificationResult = await processGamificationUpdates(results[0].studentId, results);
                const payload = toGamificationPayload(gamificationResult);
                await emitRealtimeEvent({
                    userId: gamificationResult.userId,
                    type: 'gamification_update',
                    payload,
                });
                console.log(`[Gamification] Updated for user ${results[0].studentId}: +${gamificationResult.xpGained} XP`);
            } catch (e) {
                console.error("[Gamification] Error processing updates:", e);
            }

            // Archive the file (using the first result's studentId)
            const problemIdForContext = results[0].problemId;
            await archiveProcessedFile(fileId, results[0].studentId, problemIdForContext, new Date(), fileName);

            console.log(`Archived file ${fileName}`);
            await finalizeSuccess();
        } else {
            await renameFile(fileId, `[ERROR] ${fileName}`);
            await finalizeFailure('No grading results');

            // Notify if possible
            if (user) {
                console.log(`Grading failed (no results). Notifying user ${user.id}...`);
                try {
                    await emitRealtimeEvent({
                        userId: user.id,
                        type: 'grading_failed',
                        payload: { fileName },
                    });
                } catch (e) {
                    console.error('[Realtime] Failed to emit grading_failed event:', e);
                }
            }
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing file ${fileId}:`, error);
        await renameFile(fileId, `[ERROR] ${fileName}`);
        await finalizeFailure(message);

        // Try to recover user context if possible to notify them
        try {
            await notifyErrorForFile(fileId, fileName, "Processing Error");
        } catch (e) {
            console.error(`Failed to notify for error file ${fileName}:`, e);
        }
    } finally {
        await cleanupFn();
        await releaseGradingFileLock(fileId);
    }
}

async function renameFile(fileId: string, newName: string) {
    try {
        const driveClient = getDrive();
        await driveClient.files.update({
            fileId,
            requestBody: { name: newName },
        });
    } catch (error) {
        console.error('Error renaming file:', error);
    }
}

// Archive Logic
async function archiveProcessedFile(fileId: string, studentId: string, problemId: string, date: Date, originalFileName: string = 'file.pdf') {
    try {
        // 1. Get Classroom Name and Student Name
        const user = await prisma.user.findUnique({
            where: { id: studentId },
            include: { classroom: true }
        });
        const classroomName = (user as any)?.classroom?.name || '未所属';
        const studentName = user?.name || user?.loginId || '不明な生徒';

        // 2. Get Subject Name via Problem
        const problem = await prisma.problem.findUnique({
            where: { id: problemId },
            include: { coreProblems: { include: { subject: true } } }
        });

        // Try to find the subject. Problems can have multiple CoreProblems, but usually same Subject.
        let subjectName = '不明な教科';
        if (problem && problem.coreProblems.length > 0) {
            subjectName = problem.coreProblems[0].subject.name;
            // Clean subject name if needed (remove special chars?)
        }

        // 3. Build New Filename: 教室名_生徒名_科目_採点時間.pdf
        const ext = path.extname(originalFileName) || '.pdf';

        // JST Construction
        const jstDate = new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        // Format parts to YYYYMMDD-HHMMSS
        const parts = jstDate.formatToParts(date);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

        const y = getPart('year');
        const m = getPart('month');
        const d = getPart('day');
        const h = getPart('hour');
        const min = getPart('minute');
        const s = getPart('second');

        const timestamp = `${y}${m}${d}-${h}${min}${s}`;

        const newFileName = `${classroomName}_${studentName}_${subjectName}_${timestamp}${ext}`;

        // 4. Build Path Components for Folders
        const year = y + '年';
        const month = String(parseInt(m)) + '月'; // Remove leading zero for folder name if desired, or keep it. Original used String(date.getMonth() + 1).
        const day = String(parseInt(d)) + '日';

        // 5. Resolve/Create Folders
        // Root: "採点済" inside DRIVE_FOLDER_ID
        const rootId = await ensureFolder('採点済', DRIVE_FOLDER_ID);
        const classId = await ensureFolder(classroomName, rootId);
        const yearId = await ensureFolder(year, classId);
        const monthId = await ensureFolder(month, yearId);
        const dayId = await ensureFolder(day, monthId);

        // 6. Move & Rename File
        const driveClient = getDrive();
        // We need to retrieve the current parents to remove them
        const file = await driveClient.files.get({ fileId, fields: 'parents' });
        const previousParents = file.data.parents?.join(',') || '';

        await driveClient.files.update({
            fileId,
            addParents: dayId,
            removeParents: previousParents,
            requestBody: { name: newFileName },
            fields: 'id, parents, name'
        });
        console.log(`Moved and Renamed file to: ${newFileName}`);

    } catch (error) {
        console.error('Error archiving file:', error);
        // Fallback to rename if archiving fails
        await renameFile(fileId, `[PROCESSED] (Archive Failed)`);
    }
}

// QStash Integration
async function triggerGradingJob(fileId: string, fileName: string) {
    const token = process.env.QSTASH_TOKEN;
    if (!token) {
        console.warn('QSTASH_TOKEN not set, falling back to synchronous processing');
        await processFile(fileId, fileName);
        return;
    }

    const client = new QStashClient({ token });
    const appUrl = process.env.GRADING_WORKER_URL || process.env.APP_URL;

    if (!appUrl) {
        console.warn('GRADING_WORKER_URL/APP_URL not set, cannot use QStash. Processing synchronously.');
        await processFile(fileId, fileName);
        return;
    }

    const baseUrl = appUrl.replace(/\/+$/, '');

    try {
        await client.publishJSON({
            url: `${baseUrl}/api/queue/grading`,
            body: { fileId, fileName },
            retries: 3,
        });
        console.log(`Published grading job to QStash for ${fileName}`);
    } catch (error) {
        console.error('Failed to publish to QStash:', error);
        // Fallback to sync
        await processFile(fileId, fileName);
    }
}

// Helper to find or create a folder
const folderCache = new Map<string, string>(); // Cache folder IDs key="${name}:${parentId}"

async function ensureFolder(name: string, parentId: string): Promise<string> {
    const cacheKey = `${name}:${parentId}`;
    if (folderCache.has(cacheKey)) {
        return folderCache.get(cacheKey)!;
    }

    try {
        const driveClient = getDrive();
        // Check if exists
        const q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`;
        const res = await driveClient.files.list({
            q,
            fields: 'files(id)',
            pageSize: 1
        });

        if (res.data.files && res.data.files.length > 0) {
            const id = res.data.files[0].id!;
            folderCache.set(cacheKey, id);
            return id;
        }

        // Create if not exists
        const fileMetadata = {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        };
        const file = await driveClient.files.create({
            requestBody: fileMetadata,
            fields: 'id'
        });

        const id = file.data.id!;
        folderCache.set(cacheKey, id);
        return id;
    } catch (error) {
        console.error(`Error ensuring folder ${name}:`, error);
        throw error;
    }
}


// 4. Grade with Gemini (Refactored)
type GradingResult = {
    studentId: string;
    problemId: string;
    isCorrect: boolean; // Based on evaluation
    evaluation: 'A' | 'B' | 'C' | 'D';
    feedback: string;
    badCoreProblemIds: string[];
    userAnswer: string;
};

// Validation types for grading response
type GradingValidationResult = {
    isValid: boolean;
    errors: string[];
    validatedResults: GradingResult[];
};

// Problem type for grading context (subset of Prisma Problem)
type ProblemForGrading = {
    id: string;
    customId: string | null;
    question: string;
    answer: string | null;
    acceptedAnswers: string[];
    coreProblems: { id: string; name: string }[];
};

/**
 * Validates Gemini's grading response and converts index-based results to problemId-based results.
 * This ensures that the response matches the expected structure and all indices are valid.
 */
function validateGradingResponse(
    resultsJson: any[],
    problems: ProblemForGrading[],
    userId: string
): GradingValidationResult {
    const errors: string[] = [];
    const validatedResults: GradingResult[] = [];
    const expectedCount = problems.length;

    // 1. Check if response is an array
    if (!Array.isArray(resultsJson)) {
        return { isValid: false, errors: ["Response is not an array"], validatedResults: [] };
    }

    // 2. Check result count
    if (resultsJson.length !== expectedCount) {
        errors.push(`Expected ${expectedCount} results, got ${resultsJson.length}`);
    }

    // 3. Validate each result and check for duplicates
    const seenIndices = new Set<number>();

    for (const r of resultsJson) {
        const idx = r.problemIndex;

        // Index range check
        if (typeof idx !== 'number' || idx < 0 || idx >= expectedCount) {
            errors.push(`Invalid problemIndex: ${idx} (expected 0-${expectedCount - 1})`);
            continue;
        }

        // Duplicate check
        if (seenIndices.has(idx)) {
            errors.push(`Duplicate problemIndex: ${idx}`);
            continue;
        }
        seenIndices.add(idx);

        // Evaluation value check
        if (!['A', 'B', 'C', 'D'].includes(r.evaluation)) {
            errors.push(`Invalid evaluation for index ${idx}: ${r.evaluation}`);
            continue;
        }

        // Convert index to actual problem ID
        const problem = problems[idx];
        validatedResults.push({
            studentId: userId,
            problemId: problem.id,  // Convert index to actual problemId
            userAnswer: r.studentAnswer || "(空欄)",
            evaluation: r.evaluation,
            isCorrect: r.evaluation === 'A' || r.evaluation === 'B',
            feedback: r.feedback || "",
            badCoreProblemIds: []  // Not used in new schema for simplicity
        });
    }

    // 4. Check for missing indices
    for (let i = 0; i < expectedCount; i++) {
        if (!seenIndices.has(i)) {
            errors.push(`Missing problemIndex: ${i}`);
        }
    }

    const isValid = errors.length === 0 && validatedResults.length === expectedCount;
    return { isValid, errors, validatedResults };
}

// Local QR Reader using Python OpenCV via child_process
import { spawn } from 'child_process';

// Path to python script (assuming it stays in scripts/ and running from root)
const PYTHON_SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'qr_reader.py');
// Use system python that likely has opencv (based on user environment)
const PYTHON_CMD = '/usr/bin/python3';

async function readQRCodeLocally(filePath: string): Promise<QRData | null> {
    try {
        if (!fs.existsSync(PYTHON_SCRIPT_PATH)) {
            console.warn("Python QR script not found at", PYTHON_SCRIPT_PATH);
            return null;
        }

        console.log(`Local QR Read: Calling Python OpenCV...`);

        // SECURITY: Use spawn with separate arguments to prevent command injection
        // Also sanitize filePath using path.basename to prevent path traversal
        const safeFilePath = path.resolve(path.dirname(filePath), path.basename(filePath));

        const result = await new Promise<string>((resolve, reject) => {
            const proc = spawn(PYTHON_CMD, [PYTHON_SCRIPT_PATH, safeFilePath]);
            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

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
            console.log("Local QR Read Failed (Python returned empty)");
            return null;
        }

        try {
            const json = normalizeQrData(JSON.parse(trimmed));
            if (!json) {
                console.warn("Python returned invalid QR data:", trimmed);
                return null;
            }
            console.log("Local QR Read Success (Python OpenCV):", json);
            return json;
        } catch (e) {
            console.warn("Python returned non-JSON:", trimmed);
            return null;
        }
    } catch (error) {
        console.error("Local QR Read Error (Python exec):", error);
        return null;
    }
}

type PreparedFile = {
    base64Data: string;
    mimeType: string;
    isPdfHeader: boolean;
};

async function prepareFileForGemini(filePath: string): Promise<PreparedFile> {
    const fd = await fs.promises.open(filePath, 'r');
    const headerBuffer = Buffer.alloc(4);
    await fd.read(headerBuffer, 0, 4, 0);
    await fd.close();

    const isPdfHeader = headerBuffer.toString('hex') === '25504446'; // %PDF
    const mimeType = isPdfHeader ? 'application/pdf' : (filePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    console.log(`Detected MIME Type: ${mimeType} (Header: ${headerBuffer.toString('hex')})`);

    const fileBuffer = await fs.promises.readFile(filePath);

    return {
        base64Data: fileBuffer.toString('base64'),
        mimeType,
        isPdfHeader
    };
}

async function getQrDataWithFallback(filePath: string, prepared: PreparedFile): Promise<QRData | null> {
    // 1. Try Local
    let qrData: QRData | null = null;
    if (!prepared.isPdfHeader) {
        qrData = await readQRCodeLocally(filePath);
    } else {
        console.log("Skipping local QR read for PDF file.");
    }

    const hasStudentId = !!getStudentIdFromQr(qrData);
    const hasProblems = qrData ? expandProblemIds(qrData).length > 0 : false;

    // 2. Fallback to Gemini
    if (!hasStudentId || !hasProblems) {
        console.log("Local QR read failed/skipped or incomplete. Attempting to scan QR with Gemini...");
        const modelName = process.env.GEMINI_MODEL || "gemini-2.5-pro";
        const model = getGenAI().getGenerativeModel({ model: modelName });
        qrData = await scanQRWithGemini(model, prepared.base64Data, prepared.mimeType);
    }

    return qrData;
}

// Deprecated/Wrapper for backward compatibility if needed, else used as the implementation
async function extractQrDataFromFile(filePath: string, prepared: PreparedFile): Promise<QRData | null> {
    return getQrDataWithFallback(filePath, prepared);
}

async function resolveUserFromQr(qrData: QRData) {
    // [NEW] Resolve User (Strict loginId only)
    // User requested to rely solely on loginId (e.g. S0001) for persistence.
    const userId = getStudentIdFromQr(qrData);
    if (!userId) return null;
    return await prisma.user.findUnique({
        where: { loginId: userId }
    });
}

async function gradeWithGemini(
    prepared: PreparedFile,
    qrData: QRData,
    userId: string,
    maxRetries: number = 2
): Promise<GradingResult[] | null> {
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-pro";
    console.log("Using Gemini Model:", modelName);

    // 1. Fetch Full Problem Context from DB
    const extractedPids = expandProblemIds(qrData);
    const uniquePids = Array.from(new Set(extractedPids));

    console.log(`Fetching problems from DB for IDs: ${uniquePids.join(', ')}`);
    const problems = await prisma.problem.findMany({
        where: {
            OR: [
                { id: { in: uniquePids as string[] } },
                { customId: { in: uniquePids as string[] } }
            ]
        },
        include: { coreProblems: true }
    });

    // Sort problems to match the order in uniquePids (QR order)
    // Optimization: Create a Map for O(1) lookup
    const idToIndexMap = new Map<string, number>();
    uniquePids.forEach((pid, index) => {
        idToIndexMap.set(String(pid), index);
    });

    problems.sort((a, b) => {
        const indexA = idToIndexMap.get(a.id) ?? idToIndexMap.get(a.customId || '') ?? Number.MAX_SAFE_INTEGER;
        const indexB = idToIndexMap.get(b.id) ?? idToIndexMap.get(b.customId || '') ?? Number.MAX_SAFE_INTEGER;
        return indexA - indexB;
    });

    console.log(`Fetched and sorted ${problems.length} problems from DB.`);

    if (problems.length === 0) {
        console.error("No problems found in DB for IDs:", uniquePids);
        return null;
    }

    // Convert to ProblemForGrading type
    const problemsForGrading: ProblemForGrading[] = problems.map(p => ({
        id: p.id,
        customId: p.customId,
        question: p.question,
        answer: p.answer,
        acceptedAnswers: p.acceptedAnswers,
        coreProblems: p.coreProblems.map(cp => ({ id: cp.id, name: cp.name }))
    }));

    // 2. Build problem contexts with INDEX instead of ID
    const problemContexts = problemsForGrading.map((p, index) => ({
        index: index,
        displayId: p.customId || `Q${index + 1}`,
        question: p.question,
        correctAnswer: p.answer,
        acceptedAnswers: p.acceptedAnswers,
    }));

    // 3. Define responseSchema for structured output
    const gradingResponseSchema = {
        type: "array" as const,
        items: {
            type: "object" as const,
            properties: {
                problemIndex: {
                    type: "integer" as const,
                    description: "問題のインデックス（0始まり、問題リストの順序に対応）"
                },
                studentAnswer: {
                    type: "string" as const,
                    description: "生徒の解答をそのまま転記"
                },
                evaluation: {
                    type: "string" as const,
                    enum: ["A", "B", "C", "D"],
                    description: "A=完璧, B=ほぼ正解, C=部分的に正解, D=不正解"
                },
                feedback: {
                    type: "string" as const,
                    description: "日本語でのフィードバック"
                }
            },
            required: ["problemIndex", "studentAnswer", "evaluation", "feedback"]
        }
    };

    // 4. Create model with structured output configuration
    const model = getGenAI().getGenerativeModel({
        model: modelName,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: gradingResponseSchema
        } as any  // Type assertion needed for responseSchema
    });

    // 5. Build enhanced prompt
    // 5. Build enhanced prompt
    const gradingPrompt = loadPrompt('grading-prompt.md', {
        problemCount: problemContexts.length,
        problemContexts: JSON.stringify(problemContexts, null, 2),
        maxIndex: problemContexts.length - 1
    });

    // 6. Retry loop
    let lastErrors: string[] = [];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`Grading retry attempt ${attempt}/${maxRetries}`);
                // Wait before retry to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            console.log(`Calling Gemini generateContent for grading (attempt ${attempt})...`);
            const result = await model.generateContent([
                gradingPrompt,
                {
                    inlineData: {
                        data: prepared.base64Data,
                        mimeType: prepared.mimeType
                    }
                }
            ]);

            const text = result.response.text();
            console.log(`Gemini Grading Response (attempt ${attempt}):`, text);

            const resultsJson = parseJSON(text);

            // Validate response using the new validation function
            const validation = validateGradingResponse(resultsJson, problemsForGrading, userId);

            if (validation.isValid) {
                console.log(`Grading validated successfully on attempt ${attempt}`);
                return validation.validatedResults;
            }

            // Validation failed
            lastErrors = validation.errors;
            console.warn(`Grading validation failed (attempt ${attempt}):`, validation.errors);

        } catch (error) {
            console.error(`Grading attempt ${attempt} failed with error:`, error);
            lastErrors = [String(error)];
        }
    }

    // All retries failed
    console.error(`All ${maxRetries + 1} grading attempts failed. Last errors:`, lastErrors);
    return null;
}

// Helper: Scan QR with Gemini
async function scanQRWithGemini(model: any, base64Data: string, mimeType: string): Promise<QRData | null> {
    try {
        const prompt = loadPrompt('qr-scan-prompt.md');
        // ...

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            }
        ]);
        const text = result.response.text();
        console.log("Gemini QR Scan Response:", text);
        const parsed = parseJSON(text);
        return normalizeQrData(parsed);

    } catch (e) {
        console.error("Gemini QR Scan Error:", e);
        return null;
    }
}

function normalizeQrData(raw: any): QRData | null {
    if (!raw || typeof raw !== 'object') return null;

    const normalized: QRData = {};

    if (raw.s !== undefined && raw.s !== null) {
        normalized.s = String(raw.s).trim();
    }

    if (raw.c !== undefined && raw.c !== null) {
        normalized.c = String(raw.c).trim();
    }

    if (raw.p !== undefined && raw.p !== null) {
        if (Array.isArray(raw.p)) {
            const list = raw.p.map((id: any) => String(id).trim()).filter(Boolean);
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
                        const list = parsed.map((id: any) => String(id).trim()).filter(Boolean);
                        if (list.length > 0) {
                            normalized.p = list.join(',');
                        }
                    }
                } catch {
                    // Fall back to raw string when JSON parsing fails.
                }
            }
            if (!normalized.p && !parsedArray) {
                normalized.p = trimmed;
            }
        }
    }

    if (!normalized.s && !normalized.p && !normalized.c) return null;
    return normalized;
}

function parseJSON(text: string): any {
    try {
        // Clean markdown code blocks
        let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        // Sometimes Gemini adds "JSON" at start
        if (clean.startsWith('JSON')) clean = clean.substring(4).trim();
        return JSON.parse(clean);
    } catch (e) {
        console.error("JSON Parse Error", e);
        return null;
    }
}



// 5. Save Result (Unified)
// Unified Grading Logic (Batch)
export async function recordGradingResults(results: GradingResult[]) {
    if (results.length === 0) return;

    const userId = results[0].studentId; // Assumes all results are for same student
    const problemIds = results.map(r => r.problemId);

    // Generate Group ID for this batch
    const groupId = crypto.randomUUID();

    // WRAP EVERYTHING IN A SINGLE TRANSACTION
    await prisma.$transaction(async (tx) => {
        // 1. Record History (Batch)
        // Note: createMany is not supported in interactive transactions for SQLite/some adapters if using executeRaw, 
        // but typically supported in modern Prisma client (tx.learningHistory.createMany).
        await tx.learningHistory.createMany({
            data: results.map(r => ({
                userId,
                problemId: r.problemId,
                evaluation: r.evaluation,
                userAnswer: r.userAnswer || '',
                feedback: r.feedback || '',
                answeredAt: new Date(),
                groupId,
                isVideoWatched: false
            }))
        });

        // 2. Update UserProblemState (Batch Optimized)
        // Fetch current states using TX
        const currentStates = await tx.userProblemState.findMany({
            where: { userId, problemId: { in: problemIds } }
        });
        const stateMap = new Map(currentStates.map(s => [s.problemId, s]));

        const newStates: any[] = [];
        const updatePromises: any[] = [];

        for (const r of results) {
            const currentState = stateMap.get(r.problemId);

            if (!currentState) {
                // New State -> Add to batch create list
                const newPriority = calculateNewPriority(0, r.evaluation);
                newStates.push({
                    userId,
                    problemId: r.problemId,
                    isCleared: r.isCorrect,
                    lastAnsweredAt: new Date(),
                    priority: newPriority
                });
            } else {
                // Existing State -> Add to update promise list
                const currentPriority = currentState.priority || 0;
                const newPriority = calculateNewPriority(currentPriority, r.evaluation);
                updatePromises.push(
                    tx.userProblemState.update({
                        where: { userId_problemId: { userId, problemId: r.problemId } },
                        data: {
                            isCleared: r.isCorrect,
                            lastAnsweredAt: new Date(),
                            priority: newPriority
                        }
                    })
                );
            }
        }

        // Execute Batch Create
        if (newStates.length > 0) {
            await tx.userProblemState.createMany({
                data: newStates
            });
        }

        // Execute Updates
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }

        // 3. Update UserCoreProblemState (Batch / Aggregated)
        const problems = await tx.problem.findMany({
            where: { id: { in: problemIds } },
            include: { coreProblems: true }
        });
        const problemMap = new Map(problems.map(p => [p.id, p]));

        const cpDeltas = new Map<string, number>();
        const involvedCpIds = new Set<string>();

        for (const r of results) {
            const problem = problemMap.get(r.problemId);
            if (!problem) continue;

            if (r.isCorrect) {
                // Correct: -5 for ALL CoreProblems
                for (const cp of problem.coreProblems) {
                    const current = cpDeltas.get(cp.id) || 0;
                    cpDeltas.set(cp.id, current - 5);
                    involvedCpIds.add(cp.id);
                }
            } else {
                // Incorrect: +5 for BAD CoreProblems
                if (r.badCoreProblemIds && r.badCoreProblemIds.length > 0) {
                    for (const cpId of r.badCoreProblemIds) {
                        if (problem.coreProblems.some(cp => cp.id === cpId)) {
                            const current = cpDeltas.get(cpId) || 0;
                            cpDeltas.set(cpId, current + 5);
                            involvedCpIds.add(cpId);
                        }
                    }
                }
            }
        }

        for (const [cpId, delta] of cpDeltas.entries()) {
            await tx.userCoreProblemState.upsert({
                where: { userId_coreProblemId: { userId, coreProblemId: cpId } },
                create: {
                    userId,
                    coreProblemId: cpId,
                    priority: delta,
                    isUnlocked: true // Assume unlocked if graded
                },
                update: { priority: { increment: delta } }
            });
        }

        // Pass involved CpIds out or call check function? 
        // We can't easily call checkProgressAndUnlock inside here if it uses `prisma` global.
        // We should move the check LOGIC to use `tx` or call it AFTER transaction.
        // But if check fails (crash), transaction is committed. That's actually OK. 
        // Unlock failure is less critical than Data Consistency.
        // However, we need to export the involved IPs to run the check AFTER.
        // But interactive transaction returns result.
        return involvedCpIds;
    })
        .then(async (involvedCpIds) => {
            // 4. Batch Unlock Check (Outside Transaction)
            await checkProgressAndUnlock(userId, Array.from(involvedCpIds));

            // 5. Emit Event for SSE
            try {
                await emitRealtimeEvent({
                    userId,
                    type: 'grading_completed',
                    payload: {
                        groupId,
                        timestamp: new Date().toISOString(),
                    },
                });
            } catch (e) {
                console.error('[Realtime] Failed to emit grading_completed event:', e);
            }
            console.log(`Emitted GRADING_COMPLETED event for user ${userId}, group ${groupId}`);
        });
}

export async function checkProgressAndUnlock(userId: string, cpIdsToCheck: string[]) {
    if (cpIdsToCheck.length === 0) return;

    // Fetch CP Details (Total Count & Next CP Candidate)
    const cpDetails = await prisma.coreProblem.findMany({
        where: { id: { in: cpIdsToCheck } },
        include: {
            problems: {
                include: { coreProblems: { select: { id: true } } } // Need dependencies
            },
            subject: {
                include: {
                    coreProblems: {
                        // [Optimization] lectureVideos is a scalar, so it's included by default.
                        // We just order them.
                        include: {
                            _count: {
                                select: { problems: true }
                            }
                        },
                        orderBy: { order: 'asc' }
                    }
                }
            }
        }
    });

    if (cpDetails.length === 0) return;

    // === OPTIMIZATION: Batch fetch all user states upfront ===

    // 1. Fetch all UserProblemStates for this user (for problems in checked CPs)
    const allProblemIds = new Set<string>();
    cpDetails.forEach(cp => cp.problems.forEach(p => allProblemIds.add(p.id)));

    const allUserProblemStates = await prisma.userProblemState.findMany({
        where: {
            userId,
            problemId: { in: Array.from(allProblemIds) }
        }
    });
    const userProblemStateMap = new Map(allUserProblemStates.map(s => [s.problemId, s]));

    // 2. Fetch all Unlocked CPs for this user across involved subjects
    const allCpIdsInSubjects = new Set<string>();
    cpDetails.forEach(cp => cp.subject.coreProblems.forEach(c => allCpIdsInSubjects.add(c.id)));

    const allUnlockedCpStates = await prisma.userCoreProblemState.findMany({
        where: {
            userId,
            coreProblemId: { in: Array.from(allCpIdsInSubjects) },
            isUnlocked: true
        },
        select: { coreProblemId: true }
    });
    const unlockedCpIds = new Set(allUnlockedCpStates.map(s => s.coreProblemId));

    // 3. Ensure first CP of each subject is unlocked
    // Optimization: We already have the subject struct with sorted coreProblems in cpDetails
    // We can just extract the first CP from each unique subject present in cpDetails.
    const firstCpIds = new Set<string>();
    cpDetails.forEach(cp => {
        if (cp.subject && cp.subject.coreProblems && cp.subject.coreProblems.length > 0) {
            firstCpIds.add(cp.subject.coreProblems[0].id);
        }
    });
    firstCpIds.forEach(id => unlockedCpIds.add(id));

    // === END OPTIMIZATION ===

    // Loop through each checked CP
    for (const cp of cpDetails) {
        // Filter: Count ONLY problems where ALL associated CoreProblems are unlocked
        const validProblems = cp.problems.filter(p => {
            // A problem is valid if every CP it belongs to is currently unlocked for the user.
            return p.coreProblems.every(relatedCp => unlockedCpIds.has(relatedCp.id));
        });

        const totalProblems = validProblems.length;
        const validProblemIds = new Set(validProblems.map(p => p.id));

        // Use pre-fetched user states instead of querying in loop
        const userStatesForCp = Array.from(validProblemIds)
            .map(pid => userProblemStateMap.get(pid))
            .filter((s): s is NonNullable<typeof s> => s !== undefined);

        const answeredCount = userStatesForCp.length;
        const correctCount = userStatesForCp.filter(s => s.isCleared).length;

        console.log(`Checking CP ${cp.name}: Valid/Total=${validProblems.length}/${cp.problems.length}, Answered=${answeredCount}`);

        const status = calculateCoreProblemStatus(totalProblems, answeredCount, correctCount);
        console.log(`  -> Status: isPassed=${status.isPassed}, AR=${status.answerRate}, CR=${status.correctRate}`);
        console.log(`  -> Counts: Total=${totalProblems}, Ans=${answeredCount}, Corr=${correctCount}`);

        if (status.isPassed) {
            // Find Next CP
            // We have the subject's CPs sorted.
            const subjectCps = cp.subject.coreProblems;
            // Find current index
            const currentIndex = subjectCps.findIndex(c => c.id === cp.id);
            console.log(`  -> Index: ${currentIndex} / ${subjectCps.length}`);

            if (currentIndex !== -1 && currentIndex < subjectCps.length - 1) {
                let nextIndex = currentIndex + 1;

                // アンロック済みCPを追跡するためのSetを構築
                // （現在のunlockedCpIdsをコピーし、アンロックするたびに追加）
                const tempUnlockedCpIds = new Set(unlockedCpIds);

                // [MODIFIED] Recursive Unlock Logic
                // 問題数が0、または問題があっても依存不足で解けない場合は、次を続けてアンロックする
                while (nextIndex < subjectCps.length) {
                    const nextCp = subjectCps[nextIndex];

                    // Unlock Next CP
                    await prisma.userCoreProblemState.upsert({
                        where: {
                            userId_coreProblemId: {
                                userId,
                                coreProblemId: nextCp.id
                            }
                        },
                        create: {
                            userId,
                            coreProblemId: nextCp.id,
                            isUnlocked: true,
                            priority: 0
                        },
                        update: {
                            isUnlocked: true
                        }
                    });
                    console.log(`Unlocked CoreProblem ${nextCp.name} (recursive).`);

                    // tempUnlockedCpIdsにこのCPを追加
                    tempUnlockedCpIds.add(nextCp.id);

                    // 講義動画情報の確認ログ
                    console.log(`  -> LectureVideos found: ${nextCp.lectureVideos ? 'YES' : 'NO'}`);

                    // アンロック通知イベントを発行
                    try {
                        await emitRealtimeEvent({
                            userId,
                            type: 'core_problem_unlocked',
                            payload: {
                                coreProblemId: nextCp.id,
                                coreProblemName: nextCp.name,
                                lectureVideos: nextCp.lectureVideos || null
                            }
                        });
                        console.log(`Emitted core_problem_unlocked event for user ${userId}, CP ${nextCp.name}`);
                    } catch (e) {
                        console.error('[Realtime] Failed to emit core_problem_unlocked event:', e);
                    }

                    // このCoreProblemで「実際に解ける問題」があるかをチェック
                    // 問題が解ける条件: その問題に紐づくすべてのCoreProblemがアンロックされていること
                    const hasSolvable = await hasSolvableProblemsInCp(nextCp.id, tempUnlockedCpIds);

                    if (hasSolvable) {
                        console.log(`  -> CP ${nextCp.name} has solvable problems. Stopping recursion.`);
                        // 解ける問題があるのでループ終了
                        break;
                    } else {
                        console.log(`  -> CP ${nextCp.name} has no solvable problems yet. Continuing to next CP...`);
                        nextIndex++;
                    }
                }
            } else {
                console.log(`  -> No next CP found (or is last).`);
            }
        }
    }
}

/**
 * 指定されたCoreProblemに、実際に解ける問題が存在するかを判定する。
 * 問題が解ける条件: その問題に紐づくすべてのCoreProblemがアンロックされていること
 * @param coreProblemId 対象のCoreProblem ID
 * @param unlockedCpIds 現在アンロックされているCoreProblem IDのSet
 */
async function hasSolvableProblemsInCp(
    coreProblemId: string,
    unlockedCpIds: Set<string>
): Promise<boolean> {
    const cp = await prisma.coreProblem.findUnique({
        where: { id: coreProblemId },
        include: {
            problems: {
                include: {
                    coreProblems: { select: { id: true } }
                }
            }
        }
    });

    if (!cp || cp.problems.length === 0) return false;

    // この単元に属する問題のうち、1問でも「全依存が満たされる」ものがあるか
    return cp.problems.some(problem =>
        problem.coreProblems.every(dep => unlockedCpIds.has(dep.id))
    );
}


// 2.5 Check for Stuck Files (Timeout > 3 mins)
export async function checkStuckFiles() {
    if (!DRIVE_FOLDER_ID) return;

    try {
        const driveClient = getDrive();
        // Look for files created > 3 minutes ago that are NOT [PROCESSED] or [ERROR]
        const timeoutThreshold = new Date(Date.now() - 3 * 60 * 1000);
        const timeStr = timeoutThreshold.toISOString();

        const res = await driveClient.files.list({
            q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder' and createdTime < '${timeStr}'`,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc',
            pageSize: 20,
        });

        const files = res.data.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            const name = file.name || '';
            const id = file.id || '';

            if (!name || name.startsWith('[PROCESSED]') || name.startsWith('[ERROR]')) {
                continue;
            }

            console.log(`Found stuck file (Timeout > 3m): ${name} (${id})`);

            // 1. Rename to [ERROR] (Timeout)
            const newName = `[ERROR] (Timeout) ${name}`;
            await renameFile(id, newName);

            // 2. Try to identify user to notify
            try {
                await notifyErrorForFile(id, name, "Timeout");
            } catch (e) {
                console.error(`Failed to notify for stuck file ${name}:`, e);
            }
        }

    } catch (error) {
        console.error('Error checking stuck files:', error);
    }
}

// Helper to download, scan QR, and notify error
async function notifyErrorForFile(fileId: string, fileName: string, reason: string) {
    let cleanupFn = async () => { };
    try {
        const notifyFileName = `notify_${fileName}`;
        const { user, cleanup } = await downloadAndAnalyzeFile(fileId, notifyFileName);
        cleanupFn = cleanup;

        if (user) {
            console.log(`Notifying user ${user.id} of error: ${reason}`);
            await emitRealtimeEvent({
                userId: user.id,
                type: 'grading_failed',
                payload: { fileName, reason },
            });
        }
    } catch (error) {
        console.warn(`Could not extract user for error notification (${fileName}):`, error);
    } finally {
        await cleanupFn();
    }
}
