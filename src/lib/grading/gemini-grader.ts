import { Type } from '@google/genai';

import { prisma } from '@/lib/prisma';
import { loadInstructionPrompt as loadPrompt } from '@/lib/instruction-prompt';
import { decodeUnitToken, expandProblemIds, type QRData } from '@/lib/qr-utils';

import { getGenAI } from './context';
import { parseJSON } from './qr';
import type { GradingResult, GradingValidationResult, PreparedFile, ProblemForGrading } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function validateGradingResponse(
    resultsJson: unknown,
    problems: ProblemForGrading[],
    userId: string,
): GradingValidationResult {
    const errors: string[] = [];
    const validatedResults: GradingResult[] = [];
    const expectedCount = problems.length;

    if (!Array.isArray(resultsJson)) {
        return { isValid: false, errors: ['Response is not an array'], validatedResults: [] };
    }

    if (resultsJson.length !== expectedCount) {
        errors.push(`Expected ${expectedCount} results, got ${resultsJson.length}`);
    }

    const seenIndices = new Set<number>();

    for (const [rawIndex, rawResult] of resultsJson.entries()) {
        if (!isRecord(rawResult)) {
            errors.push(`Result at position ${rawIndex} is not an object`);
            continue;
        }
        const idx = rawResult.problemIndex;

        if (typeof idx !== 'number' || idx < 0 || idx >= expectedCount) {
            errors.push(`Invalid problemIndex: ${String(idx)} (expected 0-${expectedCount - 1})`);
            continue;
        }

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
        const studentAnswer =
            typeof rawResult.studentAnswer === 'string' ? rawResult.studentAnswer : '(空欄)';
        const feedback = typeof rawResult.feedback === 'string' ? rawResult.feedback : '';

        validatedResults.push({
            studentId: userId,
            problemId: problem.id,
            userAnswer: studentAnswer,
            evaluation,
            isCorrect: evaluation === 'A' || evaluation === 'B',
            feedback,
            badCoreProblemIds: [],
        });
    }

    for (let i = 0; i < expectedCount; i++) {
        if (!seenIndices.has(i)) {
            errors.push(`Missing problemIndex: ${i}`);
        }
    }

    const isValid = errors.length === 0 && validatedResults.length === expectedCount;
    return { isValid, errors, validatedResults };
}

export async function gradeWithGemini(
    prepared: PreparedFile,
    qrData: QRData,
    userId: string,
    maxRetries: number = 2,
): Promise<GradingResult[] | null> {
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
    console.log('Using Gemini Model:', modelName);

    const extractedPids = expandProblemIds(qrData);
    const uniquePids = Array.from(new Set(extractedPids));

    console.log(`Fetching problems from DB for IDs: ${uniquePids.join(', ')}`);
    const problems = await prisma.problem.findMany({
        where: {
            OR: [
                { id: { in: uniquePids as string[] } },
                { customId: { in: uniquePids as string[] } },
            ],
        },
        include: { coreProblems: true },
    });

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
                    select: { id: true, name: true },
                });

                if (!targetCoreProblem) {
                    console.warn(
                        `[QR] Unit token "${qrData.u}" resolved to masterNumber=${decodedUnitMasterNumber}, but CoreProblem was not found.`,
                    );
                } else {
                    console.log(`[QR] Unit token resolved: ${targetCoreProblem.name} (${targetCoreProblem.id})`);
                }
            }
        }
    }

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
        console.error('No problems found in DB for IDs:', uniquePids);
        return null;
    }

    const problemsForGrading: ProblemForGrading[] = problems.map((problem) => ({
        id: problem.id,
        customId: problem.customId,
        question: problem.question,
        answer: problem.answer,
        acceptedAnswers: problem.acceptedAnswers,
        coreProblems: problem.coreProblems.map((coreProblem) => ({ id: coreProblem.id, name: coreProblem.name })),
    }));

    const problemContexts = problemsForGrading.map((problem, index) => ({
        index,
        displayId: problem.customId || `Q${index + 1}`,
        question: problem.question,
        correctAnswer: problem.answer,
        acceptedAnswers: problem.acceptedAnswers,
    }));

    const gradingResponseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                problemIndex: {
                    type: Type.INTEGER,
                    description: '問題のインデックス（0始まり、問題リストの順序に対応）',
                },
                studentAnswer: {
                    type: Type.STRING,
                    description: '生徒の解答をそのまま転記',
                },
                evaluation: {
                    type: Type.STRING,
                    enum: ['A', 'B', 'C', 'D'],
                    description: 'A=完璧, B=ほぼ正解, C=部分的に正解, D=不正解',
                },
                feedback: {
                    type: Type.STRING,
                    description: '日本語でのフィードバック',
                },
            },
            required: ['problemIndex', 'studentAnswer', 'evaluation', 'feedback'],
        },
    };

    const gradingPrompt = loadPrompt('grading-prompt.md', {
        problemCount: problemContexts.length,
        problemContexts: JSON.stringify(problemContexts, null, 2),
        maxIndex: problemContexts.length - 1,
    });

    let lastErrors: string[] = [];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`Grading retry attempt ${attempt}/${maxRetries}`);
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            console.log(`Calling Gemini generateContent for grading (attempt ${attempt})...`);
            const result = await getGenAI().models.generateContent({
                model: modelName,
                contents: [
                    { text: gradingPrompt },
                    {
                        inlineData: {
                            data: prepared.base64Data,
                            mimeType: prepared.mimeType,
                        },
                    },
                ],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: gradingResponseSchema,
                },
            });

            const text = result.text || '';
            console.log(`Gemini Grading Response (attempt ${attempt}):`, text);

            const resultsJson = parseJSON(text);
            const validation = validateGradingResponse(resultsJson, problemsForGrading, userId);

            if (validation.isValid) {
                console.log(`Grading validated successfully on attempt ${attempt}`);
                return validation.validatedResults;
            }

            lastErrors = validation.errors;
            console.warn(`Grading validation failed (attempt ${attempt}):`, validation.errors);
        } catch (error) {
            console.error(`Grading attempt ${attempt} failed with error:`, error);
            lastErrors = [String(error)];
        }
    }

    console.error(`All ${maxRetries + 1} grading attempts failed. Last errors:`, lastErrors);
    return null;
}
