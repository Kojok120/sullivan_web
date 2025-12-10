import { google } from 'googleapis';
import QRCode from 'qrcode';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

import { calculateNewPriority } from '@/lib/priority-algo';

// Configuration
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || ''; // Folder to watch
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');
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

let drive: any | null = null;
function getDrive() {
    if (!drive) {
        if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
            // Safe guard: if file missing, return null or throw. 
            // Throwing might break app start if this is called at module level, but we are inside function.
            // If we return null, callers must handle.
            // Let's assume validation happens elsewhere or throw here.
            throw new Error(`Service account file not found at ${SERVICE_ACCOUNT_PATH}`);
        }
        const auth = new google.auth.GoogleAuth({
            keyFile: SERVICE_ACCOUNT_PATH,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
        drive = google.drive({ version: 'v3', auth });
    }
    return drive;
}

// Types
type QRData = {
    sid: string; // Student ID
    pids: string[]; // Problem IDs
};

// 1. Generate QR Code
export async function generateQRCode(studentId: string, problemIds: string[]): Promise<string> {
    const data: QRData = { sid: studentId, pids: problemIds };
    const json = JSON.stringify(data);
    return await QRCode.toDataURL(json);
}

// 2. Poll Drive for New Files
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

        for (const file of files) {
            if (!file.id || !file.name) continue;

            // Check if already processed (check DB or move file?)
            // Best practice: Move processed files to a "Processed" folder.
            // For now, let's assume we move them or rename them.
            // Or we check if we have a LearningHistory for this file? 
            // Hard to link file to history before reading QR.
            // Let's assume we move them to a 'processed' folder.
            // But we need a processed folder ID.
            // Simplified: Rename file with prefix "[PROCESSED]"

            if (file.name.startsWith('[PROCESSED]')) continue;
            if (file.name.startsWith('[ERROR]')) continue;

            console.log(`Processing file: ${file.name} (${file.id})`);
            await processFile(file.id, file.name);
        }

    } catch (error) {
        console.error('Error checking Drive:', error);
    }
}

// 3. Process File
async function processFile(fileId: string, fileName: string) {
    try {
        // Download file
        const destPath = path.join(process.cwd(), 'tmp', fileName);
        if (!fs.existsSync(path.dirname(destPath))) {
            await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
        }

        const dest = fs.createWriteStream(destPath);

        const driveClient = getDrive();
        const res = await driveClient.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        await new Promise((resolve, reject) => {
            res.data
                .on('end', () => resolve(true))
                .on('error', (err: any) => reject(err))
                .pipe(dest);
        });

        // Read QR and Grade using Gemini
        const results = await gradeWithGemini(destPath);

        // Update DB
        if (results && results.length > 0) {
            for (const result of results) {
                await saveGradingResult(result);
            }
            // Archive the file (using the first result's studentId)
            await archiveProcessedFile(fileId, results[0].studentId, new Date());
            console.log(`Archived file ${fileName}`);
        } else {
            await renameFile(fileId, `[ERROR] ${fileName}`);
        }

        // Cleanup
        await fs.promises.unlink(destPath);

    } catch (error) {
        console.error(`Error processing file ${fileId}:`, error);
        await renameFile(fileId, `[ERROR] ${fileName}`);
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
async function archiveProcessedFile(fileId: string, studentId: string, date: Date) {
    try {
        // 1. Get Classroom Name
        const user = await prisma.user.findUnique({
            where: { id: studentId },
            include: { classroomRef: true }
        });
        const classroomName = user?.classroomRef?.name || '未所属';

        // 2. Build Path Components
        const year = date.getFullYear().toString() + '年';
        const month = (date.getMonth() + 1).toString() + '月';
        const day = date.getDate().toString() + '日';

        // 3. Resolve/Create Folders
        // Root: "採点済" inside DRIVE_FOLDER_ID
        const rootId = await ensureFolder('採点済', DRIVE_FOLDER_ID);
        const classId = await ensureFolder(classroomName, rootId);
        const yearId = await ensureFolder(year, classId);
        const monthId = await ensureFolder(month, yearId);
        const dayId = await ensureFolder(day, monthId);

        // 4. Move File
        const driveClient = getDrive();
        // We need to retrieve the current parents to remove them
        const file = await driveClient.files.get({ fileId, fields: 'parents' });
        const previousParents = file.data.parents?.join(',') || '';

        await driveClient.files.update({
            fileId,
            addParents: dayId,
            removeParents: previousParents,
            fields: 'id, parents'
        });

    } catch (error) {
        console.error('Error archiving file:', error);
        // Fallback to rename if archiving fails
        await renameFile(fileId, `[PROCESSED] (Archive Failed)`);
    }
}

// Helper to find or create a folder
async function ensureFolder(name: string, parentId: string): Promise<string> {
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
            return res.data.files[0].id!;
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

        return file.data.id!;
    } catch (error) {
        console.error(`Error ensuring folder ${name}:`, error);
        throw error;
    }
}

// 4. Grade with Gemini
type GradingResult = {
    studentId: string;
    problemId: string;
    isCorrect: boolean; // Based on evaluation
    evaluation: 'A' | 'B' | 'C' | 'D';
    feedback: string;
    badCoreProblemIds: string[];
    userAnswer: string;
};

async function gradeWithGemini(filePath: string): Promise<GradingResult[] | null> {
    try {
        const model = getGenAI().getGenerativeModel({ model: "gemini-1.5-flash" });

        const fileBuffer = await fs.promises.readFile(filePath);
        const base64Data = fileBuffer.toString('base64');

        const extractionPrompt = `
        Please analyze this image of an answer sheet.
        1. Find the QR code and extract the JSON data inside it. It should have "sid" and "pids" (array of problem IDs).
        2. Transcribe the student's handwritten answers for EACH problem.
           The problems are usually numbered 1, 2, 3... corresponding to the order in "pids".
        
        Return ONLY a JSON object with this format:
        {
            "sid": "extracted student id",
            "pids": ["pid1", "pid2", ...],
            "answers": [
                { "pid": "pid1", "studentAnswer": "transcribed answer 1" },
                { "pid": "pid2", "studentAnswer": "transcribed answer 2" }
            ]
        }
        `;

        const result1 = await model.generateContent([
            extractionPrompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg"
                }
            }
        ]);

        const text1 = result1.response.text();
        const json1 = parseJSON(text1);

        if (!json1 || !json1.sid || !json1.pids || !Array.isArray(json1.pids)) {
            console.error("Failed to extract QR data", text1);
            return null;
        }

        const gradingResults: GradingResult[] = [];

        // Grade each problem
        // Grade each problem in PARALLEL
        const promises = json1.answers.map(async (answerData: any) => {
            const pid = answerData.pid;
            const studentAnswer = answerData.studentAnswer;

            if (!pid) return null;

            // Fetch Problem
            const problem = await prisma.problem.findUnique({
                where: { id: pid },
                include: { coreProblems: true }
            });

            if (!problem) {
                console.error("Problem not found", pid);
                return null;
            }

            // Step 3: Grade
            const gradingPrompt = `
            You are grading a problem.
            
            **Question**: ${problem.question}
            **Correct Answer**: ${problem.answer}
            **Accepted Answers**: ${problem.acceptedAnswers.join(', ')}
            
            **Student Answer**: ${studentAnswer}
            
            **Task**:
            1. Evaluate the student's answer.
            2. Assign a grade: A (Perfect), B (Correct but minor issues), C (Incorrect but close), D (Incorrect).
            3. Provide helpful feedback (in Japanese).
            4. If incorrect (C or D), identify which CoreProblems might be the cause.
               The problem is related to these CoreProblems:
               ${problem.coreProblems.map((cp: any) => `- ID: ${cp.id}, Name: ${cp.name}`).join('\n')}
               Return the IDs of the CoreProblems that the student seems to misunderstand.
            
            Return ONLY a JSON object:
            {
                "evaluation": "A" | "B" | "C" | "D",
                "feedback": "feedback text",
                "badCoreProblemIds": ["id1", "id2"]
            }
            `;

            const result2 = await model.generateContent(gradingPrompt);
            const text2 = result2.response.text();
            const json2 = parseJSON(text2);

            if (json2) {
                return {
                    studentId: json1.sid,
                    problemId: pid,
                    userAnswer: studentAnswer,
                    evaluation: json2.evaluation,
                    isCorrect: json2.evaluation === 'A' || json2.evaluation === 'B',
                    feedback: json2.feedback,
                    badCoreProblemIds: json2.badCoreProblemIds || []
                };
            }
            return null;
        });

        const results = await Promise.all(promises);
        return results.filter((r): r is GradingResult => r !== null);

    } catch (error) {
        console.error("Gemini Error:", error);
        return null;
    }
}

function parseJSON(text: string): any {
    try {
        // Clean markdown code blocks
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return null;
    }
}

// 5. Save Result (Unified)
async function saveGradingResult(result: GradingResult) {
    await recordGradingResult(
        result.studentId,
        result.problemId,
        result.evaluation,
        result.userAnswer,
        result.feedback,
        result.badCoreProblemIds
    );
}

// Unified Grading Logic used by both AI (Scan) and Manual (App) evaluation
export async function recordGradingResult(
    userId: string,
    problemId: string,
    evaluation: "A" | "B" | "C" | "D",
    userAnswer?: string,
    feedback?: string,
    badCoreProblemIds?: string[]
) {
    const isCorrect = evaluation === 'A' || evaluation === 'B';

    // 1. Record History
    await prisma.learningHistory.create({
        data: {
            userId,
            problemId,
            evaluation,
            userAnswer,
            feedback,
            answeredAt: new Date()
        }
    });

    // 2. Update UserProblemState with CalculateNewPriority
    const currentState = await prisma.userProblemState.findUnique({
        where: { userId_problemId: { userId, problemId } }
    });

    const currentPriority = currentState?.priority || 0;
    const newPriority = calculateNewPriority(currentPriority, evaluation);

    await prisma.userProblemState.upsert({
        where: { userId_problemId: { userId, problemId } },
        create: {
            userId,
            problemId,
            isCleared: isCorrect,
            lastAnsweredAt: new Date(),
            priority: newPriority
        },
        update: {
            isCleared: isCorrect,
            lastAnsweredAt: new Date(),
            priority: newPriority
        }
    });

    // 3. Update UserCoreProblemState (Points)
    const problem = await prisma.problem.findUnique({
        where: { id: problemId },
        include: { coreProblems: true }
    });

    if (!problem) return;

    if (isCorrect) {
        // Decrease points for ALL associated CoreProblems
        for (const cp of problem.coreProblems) {
            await updateCoreProblemPriority(userId, cp.id, -5);
            // Check Unlock
            await checkAndUnlockCoreProblem(userId, cp.id);
        }
    } else {
        // Increase points for BAD CoreProblems
        // If badCoreProblemIds provided (AI), use them.
        // If not (Manual), maybe use ALL? Or None?
        // Let's assume Manual grading doesn't pinpoint bad CP yet.
        // But we should probably punish ALL if we don't know better?
        // "Unify logic": If manual grading is C/D, usually it implies the student doesn't understand the core concepts.
        // Safest: If IDs provided, use them. If not, maybe skip or use all.
        // Let's use provided IDs if any, else skip for now to avoid punishing everything.
        if (badCoreProblemIds && badCoreProblemIds.length > 0) {
            for (const cpId of badCoreProblemIds) {
                if (problem.coreProblems.some((cp: any) => cp.id === cpId)) {
                    await updateCoreProblemPriority(userId, cpId, 5);
                }
            }
        }
    }
}

async function updateCoreProblemPriority(userId: string, coreProblemId: string, delta: number) {
    // Upsert State
    const state = await prisma.userCoreProblemState.findUnique({
        where: { userId_coreProblemId: { userId, coreProblemId } }
    });

    if (state) {
        await prisma.userCoreProblemState.update({
            where: { userId_coreProblemId: { userId, coreProblemId } },
            data: { priority: { increment: delta } }
        });
    } else {
        await prisma.userCoreProblemState.create({
            data: {
                userId,
                coreProblemId,
                priority: delta,
                isUnlocked: true // Assume unlocked if we are grading it
            }
        });
    }
}

async function checkAndUnlockCoreProblem(userId: string, coreProblemId: string) {
    // 1. Get current CoreProblem
    const currentCP = await prisma.coreProblem.findUnique({
        where: { id: coreProblemId },
        include: { subject: true } // Changed from unit to subject
    });

    if (!currentCP) return;

    // 2. Fetch problems associated with this CoreProblem
    const problemsInCoreProblem = await prisma.problem.findMany({
        where: {
            coreProblems: {
                some: {
                    id: coreProblemId
                }
            }
        },
        select: { id: true }
    });
    const problemIds = problemsInCoreProblem.map(p => p.id);
    const totalProblems = problemIds.length;

    // 2. Fetch user states
    const userStates = await prisma.userProblemState.findMany({
        where: {
            userId,
            problemId: { in: problemIds }
        }
    });

    // 3. Calculate Stats
    const answeredCount = userStates.length;
    const correctCount = userStates.filter(s => s.isCleared).length;

    const answerRate = (answeredCount / totalProblems) * 100;
    const correctRate = answeredCount > 0 ? (correctCount / answeredCount) * 100 : 0;

    // Thresholds (could be configurable)
    const UNLOCK_ANSWER_RATE = 50;
    const UNLOCK_CORRECT_RATE = 60;

    if (answerRate >= UNLOCK_ANSWER_RATE && correctRate >= UNLOCK_CORRECT_RATE) {
        // Unlock Next CoreProblem
        const currentCp = await prisma.coreProblem.findUnique({
            where: { id: coreProblemId }
        });

        if (!currentCp) return;

        const nextCp = await prisma.coreProblem.findFirst({
            where: {
                subjectId: currentCp.subjectId,
                order: { gt: currentCp.order }
            },
            orderBy: { order: 'asc' }
        });

        if (nextCp) {
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
            console.log(`Unlocked CoreProblem ${nextCp.name} for user ${userId}`);
        }
    }
}

export async function gradeTextAnswer(problemId: string, studentAnswer: string): Promise<{ evaluation: string, feedback: string }> {
    const problem = await prisma.problem.findUnique({
        where: { id: problemId }
    });

    if (!problem) {
        throw new Error("Problem not found");
    }

    const prompt = `
    You are a strict but helpful teacher.
    Problem: ${problem.question}
    Correct Answer: ${problem.answer}
    Student Answer: ${studentAnswer}

    Evaluate the student's answer.
    1. Determine if it is Correct (A), Mostly Correct (B), Partially Correct (C), or Incorrect (D).
    2. Provide a short, encouraging feedback in Japanese.

    Return ONLY a JSON object:
    {
        "evaluation": "A" | "B" | "C" | "D",
        "feedback": "feedback string"
    }
    `;

    const model = getGenAI().getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    try {
        const json = parseJSON(text);
        return {
            evaluation: json.evaluation || "C",
            feedback: json.feedback || "AI判定に失敗しました"
        };
    } catch (e) {
        console.error("Failed to parse AI response", text);
        return { evaluation: "C", feedback: "AI判定エラー" };
    }
}
