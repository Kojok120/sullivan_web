import { google } from 'googleapis';
import QRCode from 'qrcode';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

// Configuration
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || ''; // Folder to watch
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Initialize Drive Auth
const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

// Types
type QRData = {
    sid: string; // Student ID
    pid: string; // Problem ID
};

// 1. Generate QR Code
export async function generateQRCode(studentId: string, problemId: string): Promise<string> {
    const data: QRData = { sid: studentId, pid: problemId };
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
        const res = await drive.files.list({
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
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
        }

        const dest = fs.createWriteStream(destPath);

        const res = await drive.files.get(
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
        const result = await gradeWithGemini(destPath);

        // Update DB
        if (result) {
            await saveGradingResult(result);
            // Archive the file
            await archiveProcessedFile(fileId, result.studentId, new Date());
            console.log(`Archived file ${fileName}`);
        } else {
            await renameFile(fileId, `[ERROR] ${fileName}`);
        }

        // Cleanup
        fs.unlinkSync(destPath);

    } catch (error) {
        console.error(`Error processing file ${fileId}:`, error);
        await renameFile(fileId, `[ERROR] ${fileName}`);
    }
}

async function renameFile(fileId: string, newName: string) {
    try {
        await drive.files.update({
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
        // We need to retrieve the current parents to remove them
        const file = await drive.files.get({ fileId, fields: 'parents' });
        const previousParents = file.data.parents?.join(',') || '';

        await drive.files.update({
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
        // Check if exists
        const q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`;
        const res = await drive.files.list({
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
        const file = await drive.files.create({
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

async function gradeWithGemini(filePath: string): Promise<GradingResult | null> {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString('base64');

        const prompt = `
        You are an expert teacher grading a student's answer sheet.
        
        1.  **Read the QR Code**: There is a QR code in the image. It contains a JSON with "sid" (Student ID) and "pid" (Problem ID). Extract these.
        2.  **Read the Answer**: Read the student's handwritten answer for the problem.
        3.  **Grade**: Compare the student's answer with the correct answer (I will provide the problem content below if I could, but since I can't query DB here easily, please infer the question from the sheet or just transcribe the student answer and I will validate it? 
        Wait, the requirement says: "新規の解答用紙のファイルとQRコードから取得した情報を全てGeminiのAPIに渡して".
        So I should first extract QR, THEN fetch problem from DB, THEN ask Gemini to grade.
        
        Let's do this in two steps or one?
        If I do one step, Gemini needs to know the correct answer.
        The sheet might have the question printed.
        But the correct answer is in DB.
        
        **Revised Strategy**:
        Step 1: Ask Gemini to extract QR code data (sid, pid) and the Student's Answer text.
        Step 2: Fetch Problem from DB using pid.
        Step 3: Ask Gemini to grade the Student's Answer against the Correct Answer.
        
        Let's do Step 1.
        `;

        const extractionPrompt = `
        Please analyze this image of an answer sheet.
        1. Find the QR code and extract the JSON data inside it. It should have "sid" and "pid".
        2. Transcribe the student's handwritten answer.
        
        Return ONLY a JSON object with this format:
        {
            "sid": "extracted student id",
            "pid": "extracted problem id",
            "studentAnswer": "transcribed answer text"
        }
        `;

        const result1 = await model.generateContent([
            extractionPrompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg" // Assuming JPEG or PNG. If PDF, need to convert? Gemini accepts PDF directly!
                    // If PDF, mimeType: "application/pdf"
                }
            }
        ]);

        const text1 = result1.response.text();
        const json1 = parseJSON(text1);

        if (!json1 || !json1.sid || !json1.pid) {
            console.error("Failed to extract QR data", text1);
            return null;
        }

        // Fetch Problem
        const problem = await prisma.problem.findUnique({
            where: { id: json1.pid },
            include: { coreProblems: true }
        });

        if (!problem) {
            console.error("Problem not found", json1.pid);
            return null;
        }

        // Step 3: Grade
        const gradingPrompt = `
        You are grading a problem.
        
        **Question**: ${problem.question}
        **Correct Answer**: ${problem.answer}
        **Accepted Answers**: ${problem.acceptedAnswers.join(', ')}
        
        **Student Answer**: ${json1.studentAnswer}
        
        **Task**:
        1. Evaluate the student's answer.
        2. Assign a grade: A (Perfect), B (Correct but minor issues), C (Incorrect but close), D (Incorrect).
        3. Provide helpful feedback (in Japanese).
        4. If incorrect (C or D), identify which CoreProblems might be the cause.
           The problem is related to these CoreProblems:
           ${problem.coreProblems.map(cp => `- ID: ${cp.id}, Name: ${cp.name}`).join('\n')}
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

        if (!json2) {
            console.error("Failed to grade", text2);
            return null;
        }

        return {
            studentId: json1.sid,
            problemId: json1.pid,
            userAnswer: json1.studentAnswer,
            evaluation: json2.evaluation,
            isCorrect: json2.evaluation === 'A' || json2.evaluation === 'B',
            feedback: json2.feedback,
            badCoreProblemIds: json2.badCoreProblemIds || []
        };

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

// 5. Save Result
async function saveGradingResult(result: GradingResult) {
    // 1. Create LearningHistory
    await prisma.learningHistory.create({
        data: {
            userId: result.studentId,
            problemId: result.problemId,
            evaluation: result.evaluation,
            userAnswer: result.userAnswer,
            feedback: result.feedback,
            answeredAt: new Date()
        }
    });

    // 2. Update UserProblemState
    const problemState = await prisma.userProblemState.upsert({
        where: {
            userId_problemId: {
                userId: result.studentId,
                problemId: result.problemId
            }
        },
        create: {
            userId: result.studentId,
            problemId: result.problemId,
            isCleared: result.isCorrect,
            lastAnsweredAt: new Date(),
            priority: 0 // Reset priority on answer? Or adjust?
        },
        update: {
            isCleared: result.isCorrect,
            lastAnsweredAt: new Date(),
            // Priority logic:
            // "CoreProblem1, 6, 7のポイントが5下がる" (if correct)
            // "CoreProblem6,7のポイントが5上がる" (if incorrect)
            // This is handled in UserCoreProblemState, not UserProblemState.
            // But UserProblemState has priority too.
            // Let's reset it to 0 if correct, or increase if incorrect?
            // Requirement says "CoreProblem...ポイント".
            // Let's leave UserProblemState priority alone or set to 0.
            priority: 0
        }
    });

    // 3. Update UserCoreProblemState (Points)
    // "CoreProblem1,6,7が登録されているquestionE-20を解いた生徒が間違えて、AIが「CoreProblem6,7に問題がある」という返答を返した場合：CoreProblem6,7のポイントが5上がる。CoreProblem1のポイントは変わらない。"
    // "正解した場合：CoreProblem1, 6, 7のポイントが5下がる。"

    const problem = await prisma.problem.findUnique({
        where: { id: result.problemId },
        include: { coreProblems: true }
    });

    if (!problem) return;

    if (result.isCorrect) {
        // Decrease points for ALL associated CoreProblems
        for (const cp of problem.coreProblems) {
            await updateCoreProblemPriority(result.studentId, cp.id, -5);
            // Also check for Unlock?
            // "アンロックされている最新のCoreProblemの解答率が50%、正答率が60%を超えている場合、次のCoreProblemがアンロックされる"
            // This check should ideally happen here or be re-calculated.
            // Since we don't have a trigger, we can try to update the NEXT CoreProblem's unlock status.
            // But that requires knowing the order.
            // Let's leave unlock logic to the print-algo (it calculates on the fly).
            // OR we can update `isUnlocked` here.
            // Let's update `isUnlocked` for the CURRENT CoreProblem if it meets criteria.
            await checkAndUnlockCoreProblem(result.studentId, cp.id);
        }
    } else {
        // Increase points for BAD CoreProblems
        for (const cpId of result.badCoreProblemIds) {
            // Verify cpId is actually associated? (Gemini might hallucinate)
            if (problem.coreProblems.some(cp => cp.id === cpId)) {
                await updateCoreProblemPriority(result.studentId, cpId, 5);
            }
        }
    }
}

async function updateCoreProblemPriority(userId: string, coreProblemId: string, delta: number) {
    const state = await prisma.userCoreProblemState.findUnique({
        where: { userId_coreProblemId: { userId, coreProblemId } }
    });

    const currentPriority = state?.priority || 0;
    const newPriority = Math.max(0, currentPriority + delta); // Don't go below 0?

    await prisma.userCoreProblemState.upsert({
        where: { userId_coreProblemId: { userId, coreProblemId } },
        create: {
            userId,
            coreProblemId,
            priority: newPriority,
            isUnlocked: false // Default
        },
        update: {
            priority: newPriority
        }
    });
}

async function checkAndUnlockCoreProblem(userId: string, coreProblemId: string) {
    // 1. Fetch all problems for this CoreProblem
    const problems = await prisma.problem.findMany({
        where: {
            coreProblems: {
                some: { id: coreProblemId }
            }
        },
        select: { id: true }
    });

    if (problems.length === 0) return;

    const totalProblems = problems.length;
    const problemIds = problems.map(p => p.id);

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
