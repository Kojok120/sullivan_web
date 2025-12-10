import { google } from 'googleapis';
import QRCode from 'qrcode';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import { UNLOCK_ANSWER_RATE, UNLOCK_CORRECT_RATE, calculateCoreProblemStatus } from '@/lib/progression';
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
                .on('error', (err: any) => reject(err))
                .pipe(dest)
                .on('error', (err: any) => reject(err))
                .on('finish', () => resolve(true));
        });

        const stats = await fs.promises.stat(destPath);
        console.log(`Downloaded ${fileName}: ${stats.size} bytes`);

        // Read header
        const fd = await fs.promises.open(destPath, 'r');
        const buffer = Buffer.alloc(8);
        await fd.read(buffer, 0, 8, 0);
        await fd.close();
        console.log(`File Header: ${buffer.toString('hex')}`);

        // Read QR and Grade using Gemini
        const results = await gradeWithGemini(destPath);

        // Update DB
        if (results && results.length > 0) {
            await recordGradingResults(results);
            // Archive the file (using the first result's studentId)
            const problemIdForContext = results[0].problemId;
            await archiveProcessedFile(fileId, results[0].studentId, problemIdForContext, new Date(), fileName);
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
        const timeStr = date.toISOString().replace(/T/, '_').replace(/:/g, '').split('.')[0];
        // ISO: 2023-10-10T10:10:10.000Z -> 2023-10-10_101010
        // User requested: 採点時間. Format YYYYMMDD-HHMMSS? 
        // Let's use YYYYMMDD-HHMMSS
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        const timestamp = `${y}${m}${d}-${h}${min}${s}`;

        const newFileName = `${classroomName}_${studentName}_${subjectName}_${timestamp}${ext}`;

        // 4. Build Path Components for Folders
        const year = y + '年';
        const month = String(date.getMonth() + 1) + '月';
        const day = String(date.getDate()) + '日';

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

// Local QR Reader using Python OpenCV via child_process
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

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
        // Execute python script
        const { stdout } = await execPromise(`${PYTHON_CMD} "${PYTHON_SCRIPT_PATH}" "${filePath}"`);
        const trimmed = stdout.trim();

        if (!trimmed) {
            console.log("Local QR Read Failed (Python returned empty)");
            return null;
        }

        try {
            const json = JSON.parse(trimmed) as QRData;
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

async function gradeWithGemini(filePath: string): Promise<GradingResult[] | null> {
    try {
        const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
        console.log("Using Gemini Model:", modelName);
        const model = getGenAI().getGenerativeModel({ model: modelName });

        // 1. Read header to check actual file type (Magic Bytes)
        const fd = await fs.promises.open(filePath, 'r');
        const headerBuffer = Buffer.alloc(4);
        await fd.read(headerBuffer, 0, 4, 0);
        await fd.close();

        const isPdfHeader = headerBuffer.toString('hex') === '25504446'; // %PDF
        const mimeType = isPdfHeader ? 'application/pdf' : (filePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
        console.log(`Detected MIME Type: ${mimeType} (Header: ${headerBuffer.toString('hex')})`);

        // 2. Read Full File for Gemini
        const fileBuffer = await fs.promises.readFile(filePath);
        const base64Data = fileBuffer.toString('base64');

        // 3. Local QR Reading (Try first)
        let qrData: QRData | null = null;
        if (!isPdfHeader) {
            qrData = await readQRCodeLocally(filePath);
        } else {
            console.log("Skipping local QR read for PDF file.");
        }

        // 4. Fallback: Ask Gemini to read QR validation
        if (!qrData || !qrData.sid) {
            console.log("Local QR read failed/skipped. Attempting to scan QR with Gemini...");
            qrData = await scanQRWithGemini(model, base64Data, mimeType);
        }

        if (!qrData || !qrData.sid || !qrData.pids || !Array.isArray(qrData.pids)) {
            console.error("Failed to extract QR data (Local & AI) from", filePath);
            return null;
        }

        console.log(`QR Found: Student=${qrData.sid}, Problems=${qrData.pids.length}`);

        // 5. Fetch Full Problem Context from DB
        const uniquePids = Array.from(new Set(qrData.pids.filter((p: any) => typeof p === 'string')));
        const problems = await prisma.problem.findMany({
            where: {
                OR: [
                    { id: { in: uniquePids as string[] } },
                    { customId: { in: uniquePids as string[] } }
                ]
            },
            include: { coreProblems: true } // Include CoreProblems for context
        });

        // If no problems found, abort
        if (problems.length === 0) {
            console.error("No problems found in DB for IDs:", uniquePids);
            return null;
        }

        const problemContexts = problems.map(p => ({
            id: p.id,
            question: p.question,
            correctAnswer: p.answer,
            acceptedAnswers: p.acceptedAnswers,
            coreProblems: p.coreProblems.map(cp => ({ id: cp.id, name: cp.name }))
        }));

        // 6. Construct Prompt with FULL Context
        const gradingPrompt = `
        You are an expert teacher grading a student's answer sheet.
        
        **Student ID**: ${qrData.sid}
        
        **Task**:
        1.  Analyze the image/document of the answer sheet.
        2.  Identify the student's handwritten answer for EACH of the following problems.
        3.  Grade each answer based on the provided "Correct Answer" and "Accepted Answers".
        4.  Provide a specific, helpful feedback in Japanese.
        5.  **CRITICAL**: If the student is INCORRECT (C or D), you MUST identify the root cause from the provided "Related CoreProblems". Select the CoreProblem ID that best explains the student's misunderstanding.

        **Problem List** (Use this strictly):
        ${JSON.stringify(problemContexts, null, 2)}

        **Output Format**:
        Return ONLY a JSON array of objects. Do not include markdown formatting like \`\`\`json.
        [
            {
                "problemId": "problem_id_from_list",
                "studentAnswer": "transcribed_text",
                "evaluation": "A" | "B" | "C" | "D",
                "feedback": "Japanese feedback text",
                "badCoreProblemIds": ["core_problem_id_cause"] (Empty if correct)
            },
            ...
        ]
        `;

        const result = await model.generateContent([
            gradingPrompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            }
        ]);

        const text = result.response.text();
        console.log("Gemini Grading Response:", text);

        const resultsJson = parseJSON(text);

        if (!Array.isArray(resultsJson)) {
            console.error("Gemini returned invalid JSON structure", text);
            return null;
        }

        // Map to GradingResult type
        return resultsJson.map((r: any) => ({
            studentId: qrData.sid,
            problemId: r.problemId,
            userAnswer: r.studentAnswer || "(空欄)",
            evaluation: r.evaluation,
            isCorrect: r.evaluation === 'A' || r.evaluation === 'B',
            feedback: r.feedback,
            badCoreProblemIds: r.badCoreProblemIds || []
        }));

    } catch (error) {
        console.error("Gemini Grading Error:", error);
        return null;
    }
}

// Helper: Scan QR with Gemini
async function scanQRWithGemini(model: any, base64Data: string, mimeType: string): Promise<QRData | null> {
    try {
        const prompt = `
        Analyze this document. There is a QR code on it containing JSON data.
        1. Decode the QR code.
        2. Inspect the decoded JSON for "sid".
        3. If identifying from text, look for a string starting with "cmiz" followed by alphanumeric characters (approx 25 chars).

        The expected JSON structure:
        {
            "sid": "student_id",
            "pids": ["problem_id_1", "problem_id_2", ...]
        }

        PRIORITY RULES:
        - If you find a string like "cmizbu15r0000jaw8k1aze4bn", USE IT as "sid".
        - Do NOT use "生徒1" or Japanese names as "sid" if a CUID/UUID is present.
        - The "sid" MUST be the ID, not the Name.
        
        Return ONLY the JSON object.
        `;
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
        return parseJSON(text);

    } catch (e) {
        console.error("Gemini QR Scan Error:", e);
        return null;
    }
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

    const userId = results[0].studentId; // Assumes all results are for same student (which is true per file)
    const problemIds = results.map(r => r.problemId);

    // Generate Group ID for this batch
    const groupId = crypto.randomUUID();

    // 1. Record History (Batch)
    await prisma.learningHistory.createMany({
        data: results.map(r => ({
            userId,
            problemId: r.problemId,
            evaluation: r.evaluation,
            userAnswer: r.userAnswer || '',
            feedback: r.feedback || '',
            answeredAt: new Date(),
            groupId, // Link to batch
            isVideoWatched: false // Default
        }))
    });

    // 2. Update UserProblemState (Batch)
    // Fetch current states
    const currentStates = await prisma.userProblemState.findMany({
        where: { userId, problemId: { in: problemIds } }
    });
    const stateMap = new Map(currentStates.map(s => [s.problemId, s]));

    await prisma.$transaction(
        results.map(r => {
            const currentState = stateMap.get(r.problemId);
            const currentPriority = currentState?.priority || 0;
            const newPriority = calculateNewPriority(currentPriority, r.evaluation);

            return prisma.userProblemState.upsert({
                where: { userId_problemId: { userId, problemId: r.problemId } },
                create: {
                    userId,
                    problemId: r.problemId,
                    isCleared: r.isCorrect,
                    lastAnsweredAt: new Date(),
                    priority: newPriority
                },
                update: {
                    isCleared: r.isCorrect,
                    lastAnsweredAt: new Date(),
                    priority: newPriority
                }
            });
        })
    );

    // 3. Update UserCoreProblemState (Batch / Aggregated)
    // Fetch problems to get coreProblems
    const problems = await prisma.problem.findMany({
        where: { id: { in: problemIds } },
        include: { coreProblems: true }
    });
    const problemMap = new Map(problems.map(p => [p.id, p]));

    // Aggregate Deltas per CoreProblem
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
                    // Verify linkage
                    if (problem.coreProblems.some(cp => cp.id === cpId)) {
                        const current = cpDeltas.get(cpId) || 0;
                        cpDeltas.set(cpId, current + 5);
                        involvedCpIds.add(cpId);
                    }
                }
            }
        }
    }

    // Apply Deltas (Transaction)
    if (cpDeltas.size > 0) {
        await prisma.$transaction(
            Array.from(cpDeltas.entries()).map(([cpId, delta]) => {
                return prisma.userCoreProblemState.upsert({
                    where: { userId_coreProblemId: { userId, coreProblemId: cpId } },
                    create: {
                        userId,
                        coreProblemId: cpId,
                        priority: delta,
                        isUnlocked: true // Assume unlocked if graded
                    },
                    update: { priority: { increment: delta } }
                });
            })
        );
    }

    // 4. Batch Unlock Check
    // We check all involved CoreProblems to see if they are now "Passed".
    // If passed, we unlock the NEXT CoreProblem.
    // To do this efficiently, we need:
    // - Stats for involved CPs (Total Problems, Answered, Correct).
    // - Next CP info for each involved CP.

    if (involvedCpIds.size > 0) {
        const cpIdsToCheck = Array.from(involvedCpIds);

        // Fetch CP Details (Total Count & Next CP Candidate)
        const cpDetails = await prisma.coreProblem.findMany({
            where: { id: { in: cpIdsToCheck } },
            include: {
                problems: { select: { id: true } }, // To count total and get IDs
                subject: {
                    include: {
                        coreProblems: {
                            select: { id: true, order: true, name: true }, // Min selection for next finder
                            orderBy: { order: 'asc' }
                        }
                    }
                }
            }
        });

        // Loop through each checked CP
        for (const cp of cpDetails) {
            const totalProblems = cp.problems.length;
            const problemIds = cp.problems.map(p => p.id);

            // Fetch User States for this CP's problems
            const userStates = await prisma.userProblemState.findMany({
                where: {
                    userId,
                    problemId: { in: problemIds }
                }
            });

            const answeredCount = userStates.length;
            const correctCount = userStates.filter(s => s.isCleared).length;

            const { isPassed } = calculateCoreProblemStatus(totalProblems, answeredCount, correctCount);

            if (isPassed) {
                // Find Next CP
                // We have the subject's CPs sorted.
                const subjectCps = cp.subject.coreProblems;
                // Find current index
                const currentIndex = subjectCps.findIndex(c => c.id === cp.id);
                if (currentIndex !== -1 && currentIndex < subjectCps.length - 1) {
                    const nextCp = subjectCps[currentIndex + 1];

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
                    console.log(`Unlocked CoreProblem ${nextCp.name} for user ${userId}`);
                }
            }
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
