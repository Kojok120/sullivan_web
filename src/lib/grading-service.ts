import crypto from 'node:crypto';

import { GoogleGenAI } from '@google/genai';
import { prisma } from '@/lib/prisma';
import type { Prisma, User } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { calculateCoreProblemStatus } from '@/lib/progression';
import { emitRealtimeEvent } from '@/lib/realtime-events';
import { incrementStampCount } from '@/lib/stamp-service';
import { processGamificationUpdates, toGamificationPayload } from '@/lib/gamification-service';
import {
    acquireGradingFileLock,
    acquireGradingLock,
    isGradingFileLocked,
    releaseGradingFileLock,
    releaseGradingLock,
} from '@/lib/grading-lock';
import { claimGradingJob, markGradingJobCompleted, markGradingJobFailed, publishGradingJob } from '@/lib/grading-job';
import { loadInstructionPrompt as loadPrompt } from '@/lib/instruction-prompt';
import { getGeminiMediaResolutionForMimeType } from '@/lib/gemini-media-resolution';
import { buildGradingTempFileContext } from '@/lib/grading-temp-path';
import { downloadProblemAssetFromStorage } from '@/lib/problem-assets';
import {
    buildAiProblemText,
    collectStructuredDocumentAssetIds,
    normalizeAnswerSpecForAi,
    parseAnswerSpec,
    parseStructuredDocument,
} from '@/lib/structured-problem';
import { getSubjectConfig } from '@/lib/subject-config';

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
const DEFAULT_MAX_GRADING_FILE_SIZE_MB = 20;
const MAX_GRADING_FILE_SIZE_MB = (() => {
    const parsed = Number.parseInt(process.env.MAX_GRADING_FILE_SIZE_MB || '', 10);
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_GRADING_FILE_SIZE_MB;
    return Math.min(100, Math.max(1, parsed));
})();
const MAX_GRADING_FILE_SIZE_BYTES = MAX_GRADING_FILE_SIZE_MB * 1024 * 1024;

// Lazy Initialization
let genAI: GoogleGenAI | null = null;
function getGenAI() {
    if (!genAI) {
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
        genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    }
    return genAI;
}

import type { QRData } from '@/lib/qr-utils';
import { decodeUnitToken, expandProblemIds } from '@/lib/qr-utils';
import {
    buildProgressionUpdateScope,
    filterCoreProblemIdsByScope,
    filterCoreProblemsByScope,
} from '@/lib/grading-progression-scope';

// Deprecated local getDrive removed in favor of shared getDriveClient
function getDrive() {
    return getDriveClient();
}

function getStudentIdFromQr(qrData: QRData | null): string | null {
    if (!qrData) return null;
    return qrData.s || null;
}

function requireProblemCustomId(problem: { id: string; customId: string | null }): string {
    if (!problem.customId) {
        throw new Error(`Problem ${problem.id} に customId が設定されていません`);
    }

    return problem.customId;
}

export async function secureDriveCheck(reason: string) {
    const lockLease = await acquireGradingLock();
    if (!lockLease) {
        console.log(`[DriveCheck] Skipped (${reason}): lock active.`);
        return;
    }

    try {
        console.log(`[DriveCheck] Starting (${reason}).`);
        await checkDriveForNewFiles();
    } catch (error) {
        console.error(`[DriveCheck] Failed (${reason}):`, error);
    } finally {
        await releaseGradingLock(lockLease);
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
            q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder' and not name contains '[PROCESSED]' and not name contains '[ERROR]'`,
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
                return publishGradingJob(file.id!, file.name!);
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
    user: User | null;
    cleanup: () => Promise<void>;
};

async function downloadAndAnalyzeFile(fileId: string, fileName: string): Promise<AnalyzedFile> {
    const { jobDirPath, filePath: destPath } = buildGradingTempFileContext(fileId, fileName);

    const cleanup = async () => {
        try {
            await fs.promises.rm(jobDirPath, { recursive: true, force: true });
        } catch (cleanupError) {
            console.error(`[Cleanup] Failed to remove ${jobDirPath}:`, cleanupError);
        }
    };

    try {
        // fileId ごとに専用ディレクトリを作り、同名ファイルの衝突を防ぐ。
        await fs.promises.mkdir(jobDirPath, { recursive: true });

        const dest = fs.createWriteStream(destPath);
        const driveClient = getDrive();
        const res = await driveClient.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
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

export async function processFile(fileId: string, fileName: string) {
    const fileLockLease = await acquireGradingFileLock(fileId);
    if (!fileLockLease) {
        console.log(`[Lock] File ${fileId} is already being processed. Skipping.`);
        return;
    }

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

        // すでにエラー/処理済みのファイルは再採点しない（重複キュー対策）。
        const currentName = await getFileName(fileId);
        if (currentName?.startsWith('[ERROR]')) {
            console.log(`[Idempotency] Skip file ${fileId}: already marked as error (${currentName}).`);
            await finalizeFailure('File already marked as error');
            return;
        }
        if (currentName?.startsWith('[PROCESSED]')) {
            console.log(`[Idempotency] Skip file ${fileId}: already processed (${currentName}).`);
            await finalizeSuccess();
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
        // 採点後は巨大文字列を早めに解放してピークメモリを下げる。
        prepared.base64Data = '';

        // 処理中にタイムアウト監視等でERROR化された場合は保存・アーカイブしない。
        const latestName = await getFileName(fileId);
        if (latestName?.startsWith('[ERROR]')) {
            console.warn(`[Process] Skip post-processing ${fileId}: file is marked as error (${latestName}).`);
            await finalizeFailure('File marked as error during processing');
            return;
        }

        // Update DB
        if (results && results.length > 0) {
            const gradingSummary = await recordGradingResults(results, qrData);

            // [GAMIFICATION] Process XP, Streaks, Achievements
            try {
                const gamificationResult = await processGamificationUpdates(results[0].studentId, results, {
                    currentGroupId: gradingSummary?.groupId,
                    currentSessionIsPerfect: gradingSummary?.sessionIsPerfect,
                });
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
        await releaseGradingFileLock(fileLockLease);
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

async function getFileName(fileId: string): Promise<string | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const driveClient = getDrive();
            const res = await driveClient.files.get({
                fileId,
                fields: 'name',
            });
            return res.data.name ?? null;
        } catch (error) {
            console.warn(`[Drive] Failed to fetch metadata (fileId=${fileId}, attempt=${attempt + 1}/3):`, error);
            if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
            }
        }
    }
    return null;
}

// Archive Logic
async function archiveProcessedFile(fileId: string, studentId: string, problemId: string, date: Date, originalFileName: string = 'file.pdf') {
    try {
        // 1. Get Classroom Name and Student Name
        const user = await prisma.user.findUnique({
            where: { id: studentId },
            include: { classroom: true }
        });
        const classroomName = user?.classroom?.name || '未所属';
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

// ジョブ発行は Cloud Tasks 経由の publishGradingJob に集約している

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
    problemRevisionId?: string | null;
    isCorrect: boolean; // Based on evaluation
    evaluation: 'A' | 'B' | 'C' | 'D';
    feedback: string;
    badCoreProblemIds: string[];
    userAnswer: string;
    confidence?: number | null;
    reason?: string;
};

type GradingValidationResult = {
    isValid: boolean;
    errors: string[];
    validatedResults: GradingResult[];
};

type ProblemRevisionAssetForGrading = {
    id: string;
    fileName: string;
    mimeType: string;
    storageKey: string | null;
};

type ProblemRevisionForGrading = {
    id: string;
    structuredContent: Prisma.JsonValue | null;
    answerSpec: Prisma.JsonValue | null;
    assets: ProblemRevisionAssetForGrading[];
};

export type ProblemForGrading = {
    id: string;
    customId: string;
    subjectName: string;
    question: string;
    answer: string | null;
    acceptedAnswers: string[];
    contentFormat: string;
    publishedRevisionId: string | null;
    structuredContent: Prisma.JsonValue | null;
    answerSpec: Prisma.JsonValue | null;
    revisionAssets: ProblemRevisionAssetForGrading[];
    coreProblems: { id: string; name: string }[];
};

export type GeminiProblemContext = {
    index: number;
    displayId: string;
    subjectName: string;
    contentFormat: string;
    problemText: string;
    referenceAnswer: string;
    alternativeAnswers: string[];
    hasReferenceFigures: boolean;
};

type GeminiReferenceFigure = {
    problemIndex: number;
    problemId: string;
    fileName: string;
    mimeType: string;
    base64Data: string;
};

type GeminiInlinePart = {
    text?: string;
    inlineData?: {
        data: string;
        mimeType: string;
    };
};

function parseAnswerSpecJson(value: Prisma.JsonValue) {
    return parseAnswerSpec(value as unknown);
}

function parseStructuredDocumentJson(value: Prisma.JsonValue) {
    return parseStructuredDocument(value as unknown);
}

function uniqueNonEmpty(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isSupportedReferenceFigureMimeType(mimeType: string) {
    const normalized = mimeType.trim().toLowerCase();
    return normalized === 'application/pdf' || normalized.startsWith('image/');
}

function getReferencedFigureAssets(problem: ProblemForGrading) {
    if (problem.contentFormat !== 'STRUCTURED_V1' || !problem.structuredContent) {
        return [];
    }

    try {
        const document = parseStructuredDocumentJson(problem.structuredContent);
        const assetIds = new Set(collectStructuredDocumentAssetIds(document));
        return problem.revisionAssets.filter((asset) =>
            assetIds.has(asset.id)
            && Boolean(asset.storageKey)
            && isSupportedReferenceFigureMimeType(asset.mimeType),
        );
    } catch (error) {
        console.warn('[grading-service] failed to collect structured asset ids', {
            problemId: problem.id,
            error,
        });
        return [];
    }
}

// 教科ごとに追加で読み込む採点ガイドラインのファイル名。
// fullName は subject-config の SubjectConfig.fullName に対応する。
const SUBJECT_RUBRIC_FILES: Record<string, string> = {
    Math: 'grading-rubric-math.md',
    Science: 'grading-rubric-science.md',
};

/**
 * 採点バッチに含まれる教科に応じた追加ガイドラインを連結して返す。
 * 該当教科がない場合は空文字を返し、プロンプトの該当箇所は空行になる。
 */
export function buildSubjectSpecificGuidelines(problems: ProblemForGrading[]): string {
    const seen = new Set<string>();
    const sections: string[] = [];

    for (const problem of problems) {
        const fullName = getSubjectConfig(problem.subjectName).fullName;
        const file = SUBJECT_RUBRIC_FILES[fullName];
        if (!file || seen.has(file)) continue;
        seen.add(file);

        try {
            sections.push(loadPrompt(file).trim());
        } catch (error) {
            console.warn('[grading-service] Failed to load subject rubric', { file, error });
        }
    }

    return sections.join('\n\n');
}

export function buildProblemContextForGemini(problem: ProblemForGrading, index: number): GeminiProblemContext {
    let problemText = problem.question?.trim() || '(問題文なし)';
    let referenceAnswer = problem.answer?.trim() || '';
    let alternativeAnswers = uniqueNonEmpty(problem.acceptedAnswers);

    if (problem.contentFormat === 'STRUCTURED_V1' && problem.structuredContent && problem.answerSpec) {
        try {
            const document = parseStructuredDocumentJson(problem.structuredContent);
            const normalizedAnswer = normalizeAnswerSpecForAi(parseAnswerSpecJson(problem.answerSpec));
            problemText = buildAiProblemText(document).trim() || problemText;
            referenceAnswer = normalizedAnswer.referenceAnswer.trim() || referenceAnswer;
            alternativeAnswers = uniqueNonEmpty([
                ...normalizedAnswer.alternativeAnswers,
                ...alternativeAnswers,
            ]);
        } catch (error) {
            console.warn('[grading-service] failed to normalize structured problem', {
                problemId: problem.id,
                error,
            });
        }
    }

    return {
        index,
        displayId: problem.customId,
        subjectName: problem.subjectName,
        contentFormat: problem.contentFormat,
        problemText,
        referenceAnswer,
        alternativeAnswers,
        hasReferenceFigures: getReferencedFigureAssets(problem).length > 0,
    };
}

async function loadReferenceFiguresForGemini(problems: ProblemForGrading[]) {
    const figures: GeminiReferenceFigure[] = [];

    for (const [problemIndex, problem] of problems.entries()) {
        const assets = getReferencedFigureAssets(problem);
        for (const asset of assets) {
            if (!asset.storageKey) continue;
            const buffer = await downloadProblemAssetFromStorage(asset.storageKey);
            if (!buffer) continue;

            figures.push({
                problemIndex,
                problemId: problem.id,
                fileName: asset.fileName,
                mimeType: asset.mimeType,
                base64Data: buffer.toString('base64'),
            });
        }
    }

    return figures;
}

export function buildGeminiGradingContents(input: {
    gradingPrompt: string;
    answerSheet: PreparedFile;
    referenceFigures: GeminiReferenceFigure[];
}): GeminiInlinePart[] {
    const contents: GeminiInlinePart[] = [
        { text: input.gradingPrompt },
        {
            inlineData: {
                data: input.answerSheet.base64Data,
                mimeType: input.answerSheet.mimeType,
            },
        },
    ];

    for (const figure of input.referenceFigures) {
        contents.push({
            text: `参考図版 problemIndex=${figure.problemIndex} problemId=${figure.problemId} fileName=${figure.fileName}`,
        });
        contents.push({
            inlineData: {
                data: figure.base64Data,
                mimeType: figure.mimeType,
            },
        });
    }

    return contents;
}

export function validateGradingResponse(
    resultsJson: unknown,
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

    for (const [rawIndex, rawResult] of resultsJson.entries()) {
        if (!isRecord(rawResult)) {
            errors.push(`Result at position ${rawIndex} is not an object`);
            continue;
        }
        const idx = rawResult.problemIndex;

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

        const evaluation = rawResult.evaluation;
        if (evaluation !== 'A' && evaluation !== 'B' && evaluation !== 'C' && evaluation !== 'D') {
            errors.push(`Invalid evaluation for index ${idx}: ${String(evaluation)}`);
            continue;
        }

        const problem = problems[idx];
        const studentAnswer = typeof rawResult.studentAnswer === 'string' ? rawResult.studentAnswer : null;
        const feedback = typeof rawResult.feedback === 'string' ? rawResult.feedback : null;
        const confidence = typeof rawResult.confidence === 'number' && Number.isFinite(rawResult.confidence)
            ? Math.max(0, Math.min(1, rawResult.confidence))
            : null;
        const reason = typeof rawResult.reason === 'string' ? rawResult.reason : null;

        if (studentAnswer === null) {
            errors.push(`Invalid studentAnswer for index ${idx}`);
            continue;
        }

        if (feedback === null) {
            errors.push(`Invalid feedback for index ${idx}`);
            continue;
        }

        if (confidence === null) {
            errors.push(`Invalid confidence for index ${idx}`);
            continue;
        }

        if (reason === null) {
            errors.push(`Invalid reason for index ${idx}`);
            continue;
        }

        validatedResults.push({
            studentId: userId,
            problemId: problem.id,
            problemRevisionId: problem.publishedRevisionId,
            userAnswer: studentAnswer,
            evaluation,
            isCorrect: evaluation === 'A' || evaluation === 'B',
            feedback,
            badCoreProblemIds: [],
            confidence,
            reason,
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
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
        } catch {
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
    const stats = await fs.promises.stat(filePath);
    if (stats.size <= 0) {
        throw new Error('Input file is empty');
    }

    if (stats.size > MAX_GRADING_FILE_SIZE_BYTES) {
        throw new Error(
            `Input file is too large (${stats.size} bytes > ${MAX_GRADING_FILE_SIZE_BYTES} bytes)`,
        );
    }

    // 先頭4バイトのみ読み込み、メモリ使用量を抑えてMIMEを判定する。
    const headerBuffer = Buffer.alloc(4);
    const fileHandle = await fs.promises.open(filePath, 'r');
    try {
        await fileHandle.read(headerBuffer, 0, 4, 0);
    } finally {
        await fileHandle.close();
    }

    // Base64文字列で直接読み込むことで、Buffer保持期間を短くする。
    const base64Data = await fs.promises.readFile(filePath, { encoding: 'base64' });

    // ヘッダの最初の4バイトでPDFかどうか判定
    const headerHex = headerBuffer.toString('hex');
    const isPdfHeader = headerHex === '25504446'; // %PDF
    const mimeType = isPdfHeader ? 'application/pdf' : (filePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    console.log(`Detected MIME Type: ${mimeType} (Header: ${headerHex}, size=${stats.size})`);

    return {
        base64Data,
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
        const modelName = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
        qrData = await scanQRWithGemini(modelName, prepared.base64Data, prepared.mimeType);
    }

    return qrData;
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
    const modelName = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
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
        include: {
            coreProblems: true,
            subject: {
                select: { name: true },
            },
            publishedRevision: {
                select: {
                    id: true,
                    structuredContent: true,
                    answerSpec: true,
                    assets: {
                        select: {
                            id: true,
                            fileName: true,
                            mimeType: true,
                            storageKey: true,
                        },
                    },
                },
            },
        }
    });

    // 単元指定印刷の短縮トークン(u)を検証してログに残す。
    // 実際の進行更新制御は recordGradingResults 側で行う。
    if (qrData.u) {
        const decodedUnitMasterNumber = decodeUnitToken(qrData.u);
        if (decodedUnitMasterNumber === null) {
            console.warn(`[QR] Invalid unit token detected: "${qrData.u}". Fallback to normal progression mode.`);
        } else {
            const subjectIds = new Set(problems.map((problem) => problem.subjectId));
            if (subjectIds.size !== 1) {
                console.warn(`[QR] Unit token "${qrData.u}" ignored: problems span multiple subjects.`);
            } else {
                const [subjectId] = Array.from(subjectIds);
                const targetCoreProblem = await prisma.coreProblem.findFirst({
                    where: {
                        subjectId,
                        masterNumber: decodedUnitMasterNumber,
                    },
                    select: { id: true, name: true }
                });

                if (!targetCoreProblem) {
                    console.warn(
                        `[QR] Unit token "${qrData.u}" resolved to masterNumber=${decodedUnitMasterNumber}, but CoreProblem was not found.`
                    );
                } else {
                    console.log(`[QR] Unit token resolved: ${targetCoreProblem.name} (${targetCoreProblem.id})`);
                }
            }
        }
    }

    // Sort problems to match the order in uniquePids (QR order)
    // Optimization: Create a Map for O(1) lookup
    const idToIndexMap = new Map<string, number>();
    uniquePids.forEach((pid, index) => {
        idToIndexMap.set(String(pid), index);
    });

    problems.sort((a, b) => {
        const customIdA = requireProblemCustomId(a);
        const customIdB = requireProblemCustomId(b);
        const indexA = idToIndexMap.get(a.id) ?? idToIndexMap.get(customIdA) ?? Number.MAX_SAFE_INTEGER;
        const indexB = idToIndexMap.get(b.id) ?? idToIndexMap.get(customIdB) ?? Number.MAX_SAFE_INTEGER;
        return indexA - indexB;
    });

    console.log(`Fetched and sorted ${problems.length} problems from DB.`);

    if (problems.length === 0) {
        console.error("No problems found in DB for IDs:", uniquePids);
        return null;
    }

    // Convert to ProblemForGrading type
    const problemsForGrading: ProblemForGrading[] = problems.map((p) => {
        const matchedRevision = p.publishedRevision as ProblemRevisionForGrading | null;
        const customId = requireProblemCustomId(p);

        return {
            id: p.id,
            customId,
            subjectName: p.subject.name,
            question: p.question,
            answer: p.answer,
            acceptedAnswers: p.acceptedAnswers,
            contentFormat: p.contentFormat,
            publishedRevisionId: matchedRevision?.id ?? p.publishedRevisionId,
            structuredContent: matchedRevision?.structuredContent ?? null,
            answerSpec: matchedRevision?.answerSpec ?? null,
            revisionAssets: matchedRevision?.assets.map((asset) => ({
                id: asset.id,
                fileName: asset.fileName,
                mimeType: asset.mimeType,
                storageKey: asset.storageKey,
            })) ?? [],
            coreProblems: p.coreProblems.map((cp) => ({ id: cp.id, name: cp.name })),
        };
    });

    const problemContexts = problemsForGrading.map((problem, index) => buildProblemContextForGemini(problem, index));
    const referenceFigures = await loadReferenceFiguresForGemini(problemsForGrading);

    const gradingResponseSchema = {
        type: 'array',
        items: {
            type: 'object',
            properties: {
                problemIndex: {
                    type: 'integer',
                    description: "問題のインデックス（0始まり、問題リストの順序に対応）"
                },
                studentAnswer: {
                    type: 'string',
                    description: "生徒の解答をそのまま転記"
                },
                evaluation: {
                    type: 'string',
                    enum: ["A", "B", "C", "D"],
                    description: "A=完璧, B=ほぼ正解, C=部分的に正解, D=不正解"
                },
                confidence: {
                    type: 'number',
                    description: '0 から 1 の信頼度'
                },
                reason: {
                    type: 'string',
                    description: '採点理由の要約'
                },
                feedback: {
                    type: 'string',
                    description: "日本語でのフィードバック"
                }
            },
            required: ["problemIndex", "studentAnswer", "evaluation", "confidence", "reason", "feedback"],
            additionalProperties: false,
        }
    };

    const gradingPrompt = loadPrompt('grading-prompt.md', {
        problemCount: problemContexts.length,
        problemContexts: JSON.stringify(problemContexts, null, 2),
        maxIndex: problemContexts.length - 1,
        subjectSpecificGuidelines: buildSubjectSpecificGuidelines(problemsForGrading),
    });

    let lastErrors: string[] = [];
    const mediaResolution = getGeminiMediaResolutionForMimeType(prepared.mimeType);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`Grading retry attempt ${attempt}/${maxRetries}`);
                // Wait before retry to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            console.log(`Calling Gemini generateContent for grading (attempt ${attempt})...`);
            const result = await getGenAI().models.generateContent({
                model: modelName,
                contents: buildGeminiGradingContents({
                    gradingPrompt,
                    answerSheet: prepared,
                    referenceFigures,
                }),
                config: {
                    responseMimeType: "application/json",
                    responseJsonSchema: gradingResponseSchema,
                    ...(mediaResolution ? { mediaResolution } : {}),
                }
            });

            const text = result.text || '';
            console.log(`Gemini Grading Response (attempt ${attempt}):`, text);

            const resultsJson = parseJSON(text);

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
async function scanQRWithGemini(modelName: string, base64Data: string, mimeType: string): Promise<QRData | null> {
    try {
        const prompt = loadPrompt('qr-scan-prompt.md');
        const mediaResolution = getGeminiMediaResolutionForMimeType(mimeType);
        // ...

        const result = await getGenAI().models.generateContent({
            model: modelName,
            contents: [
                { text: prompt },
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType
                    }
                }
            ],
            config: {
                ...(mediaResolution ? { mediaResolution } : {}),
            }
        });
        const text = result.text || '';
        console.log("Gemini QR Scan Response:", text);
        const parsed = parseJSON(text);
        return normalizeQrData(parsed);

    } catch (e) {
        console.error("Gemini QR Scan Error:", e);
        return null;
    }
}

function normalizeQrData(raw: unknown): QRData | null {
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

    if (!normalized.s && !normalized.c && !normalized.u) return null;
    return normalized;
}

function parseJSON(text: string): unknown {
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
type GradingBatchSummary = {
    groupId: string;
    sessionIsPerfect: boolean;
};

async function recordGradingResults(results: GradingResult[], qrData: QRData): Promise<GradingBatchSummary | null> {
    if (results.length === 0) return null;

    const userId = results[0].studentId; // Assumes all results are for same student
    const problemIds = results.map(r => r.problemId);
    const sessionIsPerfect = results.every((result) => result.isCorrect);

    // Generate Group ID for this batch
    const groupId = crypto.randomUUID();

    // WRAP EVERYTHING IN A SINGLE TRANSACTION
    const { involvedCpIds, isUnitMode } = await prisma.$transaction(async (tx) => {
        // 1. Record History (Batch)
        await Promise.all(results.map((r) => tx.learningHistory.create({
            data: {
                userId,
                problemId: r.problemId,
                problemRevisionId: r.problemRevisionId ?? undefined,
                evaluation: r.evaluation,
                userAnswer: r.userAnswer || '',
                feedback: r.feedback || '',
                answeredAt: new Date(),
                groupId,
                isVideoWatched: false,
            },
        })));

        // 2. 問題と紐づく CoreProblem を取得して、単元集中モードを判定
        const problems = await tx.problem.findMany({
            where: { id: { in: problemIds } },
            include: { coreProblems: true }
        });
        const problemMap = new Map(problems.map((problem) => [problem.id, problem]));
        const allCoreProblemIdsInBatch = Array.from(
            new Set(problems.flatMap((problem) => problem.coreProblems.map((coreProblem) => coreProblem.id)))
        );

        let isUnitMode = false;
        // 単元指定印刷(u)が有効な場合のみ、進行更新対象を
        // 「現在アンロック済み + 指定単元」に制限する。
        let progressionScope: Set<string> | null = null;
        const decodedUnitMasterNumber = qrData.u ? decodeUnitToken(qrData.u) : null;
        if (qrData.u && decodedUnitMasterNumber !== null) {
            const subjectIds = new Set(problems.map((problem) => problem.subjectId));
            if (subjectIds.size === 1) {
                const [subjectId] = Array.from(subjectIds);
                const targetCoreProblem = await tx.coreProblem.findFirst({
                    where: {
                        subjectId,
                        masterNumber: decodedUnitMasterNumber,
                    },
                    select: { id: true, name: true },
                });

                if (!targetCoreProblem) {
                    console.warn(
                        `[ProgressionScope] Unit token "${qrData.u}" was ignored because target CoreProblem was not found.`
                    );
                } else {
                    const unlockedStates = await tx.userCoreProblemState.findMany({
                        where: {
                            userId,
                            coreProblemId: { in: allCoreProblemIdsInBatch },
                            isUnlocked: true,
                        },
                        select: { coreProblemId: true },
                    });

                    progressionScope = buildProgressionUpdateScope(
                        unlockedStates.map((state) => state.coreProblemId),
                        targetCoreProblem.id
                    );
                    isUnitMode = true;
                    console.log(
                        `[ProgressionScope] Unit mode enabled: target=${targetCoreProblem.name}, scopeSize=${progressionScope?.size ?? 0}`
                    );
                }
            } else {
                console.warn(
                    `[ProgressionScope] Unit token "${qrData.u}" was ignored because graded problems span multiple subjects.`
                );
            }
        } else if (qrData.u) {
            console.warn(`[ProgressionScope] Invalid unit token "${qrData.u}". Fallback to normal progression mode.`);
        }

        // 3. Update UserProblemState (Batch Optimized)
        // unit mode では unlock 判定専用フィールドは更新しない
        const currentStates = await tx.userProblemState.findMany({
            where: { userId, problemId: { in: problemIds } }
        });
        const stateMap = new Map(currentStates.map(s => [s.problemId, s]));

        const newStates: Prisma.UserProblemStateCreateManyInput[] = [];
        const updatePromises: Prisma.PrismaPromise<unknown>[] = [];

        for (const r of results) {
            const currentState = stateMap.get(r.problemId);
            const answeredAt = new Date();

            if (!currentState) {
                const newPriority = calculateNewPriority(0, r.evaluation);
                const newState: Prisma.UserProblemStateCreateManyInput = {
                    userId,
                    problemId: r.problemId,
                    isCleared: r.isCorrect,
                    lastAnsweredAt: answeredAt,
                    priority: newPriority
                };

                if (!isUnitMode) {
                    newState.unlockLastAnsweredAt = answeredAt;
                    newState.unlockIsCleared = r.isCorrect;
                }

                newStates.push(newState);
            } else {
                const currentPriority = currentState.priority || 0;
                const newPriority = calculateNewPriority(currentPriority, r.evaluation);
                const updateData: Prisma.UserProblemStateUpdateInput = {
                    isCleared: r.isCorrect,
                    lastAnsweredAt: answeredAt,
                    priority: newPriority
                };

                if (!isUnitMode) {
                    updateData.unlockLastAnsweredAt = answeredAt;
                    updateData.unlockIsCleared = r.isCorrect;
                }

                updatePromises.push(
                    tx.userProblemState.update({
                        where: { userId_problemId: { userId, problemId: r.problemId } },
                        data: updateData
                    })
                );
            }
        }

        if (newStates.length > 0) {
            await tx.userProblemState.createMany({
                data: newStates
            });
        }

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }

        // 4. Collect involved UserCoreProblemState IDs for unlock checks
        const involvedCpIdsInTransaction = new Set<string>();

        for (const result of results) {
            const problem = problemMap.get(result.problemId);
            if (!problem) continue;

            const targetCoreProblems = filterCoreProblemsByScope(problem.coreProblems, progressionScope);

            if (result.isCorrect) {
                for (const coreProblem of targetCoreProblems) {
                    involvedCpIdsInTransaction.add(coreProblem.id);
                }
                continue;
            }

            // 不正解時: badCoreProblemIds が指定されている場合のみ対象を unlock 判定候補に含める
            if (!result.badCoreProblemIds || result.badCoreProblemIds.length === 0) {
                continue;
            }

            const coreProblemIdsOnProblem = new Set(targetCoreProblems.map((coreProblem) => coreProblem.id));
            const scopedBadCoreProblemIds = filterCoreProblemIdsByScope(result.badCoreProblemIds, progressionScope);
            for (const coreProblemId of scopedBadCoreProblemIds) {
                if (!coreProblemIdsOnProblem.has(coreProblemId)) continue;
                involvedCpIdsInTransaction.add(coreProblemId);
            }
        }

        return {
            involvedCpIds: Array.from(involvedCpIdsInTransaction),
            isUnitMode
        };
    });

    // 5. Batch Unlock Check (Outside Transaction)
    // 単元集中(coreProblemId指定)では解放判定を走らせない
    if (!isUnitMode) {
        await checkProgressAndUnlock(userId, involvedCpIds);
    }

    // 6. Emit Event for SSE
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

    return { groupId, sessionIsPerfect };
}

async function checkProgressAndUnlock(userId: string, cpIdsToCheck: string[]) {
    if (cpIdsToCheck.length === 0) return;

    // Fetch CP Details (Total Count & Next CP Candidate)
    const cpDetails = await prisma.coreProblem.findMany({
        where: { id: { in: cpIdsToCheck } },
        include: {
            problems: {
                include: { coreProblems: { select: { id: true } } } // Need dependencies
            },
            subject: {
                select: {
                    id: true,
                    coreProblems: {
                        orderBy: { order: 'asc' },
                        select: {
                            id: true,
                            name: true,
                            order: true,
                            lectureVideos: true,
                        }
                    }
                }
            }
        }
    });

    if (cpDetails.length === 0) return;

    // 0. 以降の再帰アンロック判定用に、対象教科のCoreProblem依存関係を一括取得
    const subjectIds = Array.from(new Set(cpDetails.map(cp => cp.subject.id)));
    const coreProblemsInSubjects = await prisma.coreProblem.findMany({
        where: { subjectId: { in: subjectIds } },
        select: {
            id: true,
            problems: {
                select: {
                    coreProblems: {
                        select: { id: true }
                    }
                }
            }
        }
    });
    const solvableDependencyMap = new Map<string, string[][]>();
    for (const coreProblem of coreProblemsInSubjects) {
        solvableDependencyMap.set(
            coreProblem.id,
            coreProblem.problems.map(problem => problem.coreProblems.map(dep => dep.id))
        );
    }

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

        const answeredCount = userStatesForCp.filter((state) => state.unlockLastAnsweredAt !== null).length;
        const correctCount = userStatesForCp.filter((state) => state.unlockIsCleared).length;

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

                    // 講義動画があるかどうかでisLectureWatchedの初期値を決定
                    const hasLectureVideos = Array.isArray(nextCp.lectureVideos) && nextCp.lectureVideos.length > 0;

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
                            // 講義動画がない場合はtrue（視聴不要）、ある場合はfalse（視聴必須）
                            isLectureWatched: !hasLectureVideos
                        },
                        update: {
                            isUnlocked: true
                        }
                    });
                    console.log(`Unlocked CoreProblem ${nextCp.name} (recursive).`);

                    // tempUnlockedCpIdsにこのCPを追加
                    tempUnlockedCpIds.add(nextCp.id);
                    unlockedCpIds.add(nextCp.id);

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
                    const problemDependencyList = solvableDependencyMap.get(nextCp.id);
                    const hasSolvable = !!problemDependencyList?.some(depIds =>
                        depIds.every(depId => tempUnlockedCpIds.has(depId))
                    );

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


// 2.5 Check for Stuck Files (Timeout > 3 mins)
async function checkStuckFiles() {
    if (!DRIVE_FOLDER_ID) return;

    try {
        const driveClient = getDrive();
        // Look for files created > 3 minutes ago that are NOT [PROCESSED] or [ERROR]
        const timeoutThreshold = new Date(Date.now() - 3 * 60 * 1000);
        const timeStr = timeoutThreshold.toISOString();

        const res = await driveClient.files.list({
            q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder' and createdTime < '${timeStr}' and not name contains '[PROCESSED]' and not name contains '[ERROR]'`,
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

            // 現在処理中のファイルはタイムアウト扱いにしない。
            const isLocked = await isGradingFileLocked(id);
            if (isLocked) {
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
