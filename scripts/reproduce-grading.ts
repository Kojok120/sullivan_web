
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../src/lib/prisma';
import { expandProblemIds, QRData } from '../src/lib/qr-utils';
import fs from 'fs';
import path from 'path';

// MOCK: Copy the functionality of gradeWithGemini partially for debugging
async function reproduceGrading(imagePath: string) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    // FORCE GEMINI 2.5 PRO as per user request
    const modelName = "gemini-2.5-pro";
    console.log(`Using Gemini Model: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });

    console.log(`Reading image from: ${imagePath}`);
    const fileBuffer = fs.readFileSync(imagePath);
    const base64Data = fileBuffer.toString('base64');

    // 1. Mock QR Data
    console.log("Scanning QR with Gemini...");
    const qrPrompt = `
        Analyze this document. There is a QR code on it containing JSON data.
        1. Decode the QR code.
        2. Extract the JSON data from the QR code.
        Return ONLY the JSON object found.
    `;

    let qrData: QRData = {};
    try {
        const qrResult = await model.generateContent([
            qrPrompt,
            { inlineData: { data: base64Data, mimeType: 'image/jpeg' } }
        ]);
        const qrText = qrResult.response.text();
        console.log("QR Result:", qrText);
        qrData = JSON.parse(qrText.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
        console.warn("QR Scan failed or parsing failed:", e);
    }

    // FALLBACK IF QR FAILS (For debugging specifically)
    if (expandProblemIds(qrData).length === 0) {
        console.warn("!! QR Scan did not return PIDs. Using FALLBACK IDs for debugging !!");
        qrData.s = "S0001"; // Assuming Test Student ID if needed, or fetch from DB
        // Based on the user's uploaded image content and previous logs
        qrData.p = "E-1,E-26,E-27,E-40,E-42,E-45,E-51";
    }

    // Resolve Student ID if needed (S0001 -> UUID)
    const student = await prisma.user.findFirst({ where: { loginId: 'S0001' } });
    const studentId = student ? student.id : "unknown-student-id";

    const problemIds = expandProblemIds(qrData);
    console.log(`\nFetching problems: ${problemIds.join(', ')}`);
    const problems = await prisma.problem.findMany({
        where: { OR: [{ id: { in: problemIds } }, { customId: { in: problemIds } }] },
        include: { coreProblems: true }
    });

    const problemContexts = problems.map(p => ({
        id: p.id,
        customId: p.customId,
        question: p.question,
        correctAnswer: p.answer,
        acceptedAnswers: p.acceptedAnswers,
        coreProblems: p.coreProblems.map(cp => ({ id: cp.id, name: cp.name }))
    }));

    console.log("Constructing Grading Prompt...");
    const gradingPrompt = `
        You are an expert teacher grading a student's answer sheet.
        
        **Student ID**: ${qrData.s || 'unknown'}
        
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
                "customId": "custom_id_debug",
                "studentAnswer": "transcribed_text",
                "evaluation": "A" | "B" | "C" | "D",
                "feedback": "Japanese feedback text",
                "badCoreProblemIds": ["core_problem_id_cause"] (Empty if correct)
            },
            ...
        ]
        `;

    console.log("Sending Grading Request...");
    const result = await model.generateContent([
        gradingPrompt,
        { inlineData: { data: base64Data, mimeType: 'image/jpeg' } }
    ]);

    console.log("\n--- Gemini Grading Response ---");
    console.log(result.response.text());
}

// ARGS: Pass the image path
const imagePath = process.argv[2];
if (imagePath) {
    reproduceGrading(imagePath)
        .catch(console.error)
        .finally(async () => await prisma.$disconnect());
} else {
    console.log("Please provide image path");
}
