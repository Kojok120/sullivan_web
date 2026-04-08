import crypto from 'node:crypto';

import { GoogleGenAI } from '@google/genai';

import type { AnswerSpec, GradingConfig } from '@/lib/structured-problem';

export type StructuredGradeResult = {
    score: number;
    maxScore: number;
    evaluation: 'A' | 'B' | 'C' | 'D';
    isCorrect: boolean;
    feedback: string;
    reason: string;
    confidence: number;
    graderType: 'DETERMINISTIC' | 'AI' | 'AI_VISION';
    modelVersion?: string;
    promptVersion?: string;
    rawResponseDigest?: string;
};

let genAI: GoogleGenAI | null = null;

function getGenAI() {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY が設定されていません');
        }
        genAI = new GoogleGenAI({ apiKey });
    }

    return genAI;
}

function normalizeText(value: string): string {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) =>
            String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
        )
        .toLowerCase();
}

function numericValue(value: string): number | null {
    const cleaned = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!cleaned) return null;
    const parsed = Number.parseFloat(cleaned[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

function buildDeterministicFeedback(isCorrect: boolean, reason: string): string {
    return isCorrect
        ? `正解です。${reason}`
        : `今回は不正解です。${reason}`;
}

function toEvaluation(scoreRatio: number): 'A' | 'B' | 'C' | 'D' {
    if (scoreRatio >= 0.95) return 'A';
    if (scoreRatio >= 0.8) return 'B';
    if (scoreRatio >= 0.4) return 'C';
    return 'D';
}

export async function gradeStructuredAnswer(input: {
    studentAnswer: string;
    answerSpec: AnswerSpec;
    gradingConfig: GradingConfig;
    problemSummary: string;
}): Promise<StructuredGradeResult> {
    const normalizedAnswer = normalizeText(input.studentAnswer);
    const maxScore = input.gradingConfig.maxScore;

    switch (input.answerSpec.kind) {
        case 'exact': {
            const accepted = new Set([
                normalizeText(input.answerSpec.correctAnswer),
                ...input.answerSpec.acceptedAnswers.map(normalizeText),
            ]);
            const isCorrect = accepted.has(normalizedAnswer);
            return {
                score: isCorrect ? maxScore : 0,
                maxScore,
                evaluation: isCorrect ? 'A' : 'D',
                isCorrect,
                feedback: buildDeterministicFeedback(isCorrect, `正答は「${input.answerSpec.correctAnswer}」です。`),
                reason: `正答: ${input.answerSpec.correctAnswer}`,
                confidence: 1,
                graderType: 'DETERMINISTIC',
                promptVersion: 'structured-v1',
            };
        }
        case 'numeric': {
            const answerValue = numericValue(input.studentAnswer);
            const correctValue = numericValue(input.answerSpec.correctAnswer);
            const tolerance = input.answerSpec.tolerance ?? 0;
            const isCorrect =
                answerValue !== null &&
                correctValue !== null &&
                Math.abs(answerValue - correctValue) <= tolerance;

            return {
                score: isCorrect ? maxScore : 0,
                maxScore,
                evaluation: isCorrect ? 'A' : 'D',
                isCorrect,
                feedback: buildDeterministicFeedback(
                    isCorrect,
                    `正答は ${input.answerSpec.correctAnswer}${input.answerSpec.unit ? ` ${input.answerSpec.unit}` : ''} です。`,
                ),
                reason: `許容誤差: ±${tolerance}`,
                confidence: 1,
                graderType: 'DETERMINISTIC',
                promptVersion: 'structured-v1',
            };
        }
        case 'choice': {
            const isCorrect = normalizedAnswer === normalizeText(input.answerSpec.correctChoiceId);
            return {
                score: isCorrect ? maxScore : 0,
                maxScore,
                evaluation: isCorrect ? 'A' : 'D',
                isCorrect,
                feedback: buildDeterministicFeedback(isCorrect, `正答は ${input.answerSpec.correctChoiceId} です。`),
                reason: `正答選択肢: ${input.answerSpec.correctChoiceId}`,
                confidence: 1,
                graderType: 'DETERMINISTIC',
                promptVersion: 'structured-v1',
            };
        }
        case 'multiBlank': {
            const rawParts = input.studentAnswer
                .split(/\r?\n|,/)
                .map((part) => part.trim())
                .filter(Boolean);

            let matched = 0;
            for (let index = 0; index < input.answerSpec.blanks.length; index += 1) {
                const blank = input.answerSpec.blanks[index];
                const studentPart = rawParts[index] ?? '';
                const accepted = new Set([
                    normalizeText(blank.correctAnswer),
                    ...blank.acceptedAnswers.map(normalizeText),
                ]);
                if (accepted.has(normalizeText(studentPart))) {
                    matched += 1;
                }
            }

            const ratio = input.answerSpec.blanks.length === 0 ? 0 : matched / input.answerSpec.blanks.length;
            const score = Math.round(maxScore * ratio);
            const evaluation = toEvaluation(ratio);
            return {
                score,
                maxScore,
                evaluation,
                isCorrect: matched === input.answerSpec.blanks.length,
                feedback: matched === input.answerSpec.blanks.length
                    ? 'すべての空欄が正解です。'
                    : `${matched}/${input.answerSpec.blanks.length} 個の空欄が一致しました。`,
                reason: `一致数: ${matched}/${input.answerSpec.blanks.length}`,
                confidence: 1,
                graderType: 'DETERMINISTIC',
                promptVersion: 'structured-v1',
            };
        }
        case 'formula': {
            const accepted = new Set([
                normalizeText(input.answerSpec.correctAnswer).replace(/\s+/g, ''),
                ...input.answerSpec.acceptedAnswers.map((value) => normalizeText(value).replace(/\s+/g, '')),
            ]);
            const isCorrect = accepted.has(normalizedAnswer.replace(/\s+/g, ''));
            return {
                score: isCorrect ? maxScore : 0,
                maxScore,
                evaluation: isCorrect ? 'A' : 'D',
                isCorrect,
                feedback: buildDeterministicFeedback(isCorrect, `正答は ${input.answerSpec.correctAnswer} です。`),
                reason: `式比較`,
                confidence: 1,
                graderType: 'DETERMINISTIC',
                promptVersion: 'structured-v1',
            };
        }
        case 'rubric':
        case 'visionRubric':
            return gradeWithGemini({
                answerSpec: input.answerSpec,
                gradingConfig: input.gradingConfig,
                studentAnswer: input.studentAnswer,
                problemSummary: input.problemSummary,
            });
    }
}

async function gradeWithGemini(input: {
    studentAnswer: string;
    answerSpec: Extract<AnswerSpec, { kind: 'rubric' | 'visionRubric' }>;
    gradingConfig: GradingConfig;
    problemSummary: string;
}): Promise<StructuredGradeResult> {
    const modelName = process.env.GEMINI_MODEL || process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-pro-preview';
    const promptVersion = 'structured-rubric-v1';
    const criteriaText = input.answerSpec.criteria
        .map((criterion) => `- ${criterion.label} (${criterion.maxPoints}点): ${criterion.description}`)
        .join('\n');
    const prompt = [
        'あなたは中学校の理科・数学の採点者です。',
        '以下の問題要約、模範解答、採点基準、生徒解答を読み、100点満点換算の採点を行ってください。',
        `問題要約:\n${input.problemSummary || '(要約なし)'}`,
        `模範解答:\n${input.answerSpec.modelAnswer || '(未設定)'}`,
        `採点基準:\n${input.answerSpec.rubric}`,
        criteriaText ? `観点:\n${criteriaText}` : '',
        `生徒解答:\n${input.studentAnswer || '(空欄)'}`,
        'JSON で {"score": number, "confidence": number, "evaluation": "A"|"B"|"C"|"D", "feedback": string, "reason": string} を返してください。',
    ].filter(Boolean).join('\n\n');

    const response = await getGenAI().models.generateContent({
        model: modelName,
        contents: [{ text: prompt }],
        config: {
            responseMimeType: 'application/json',
            responseJsonSchema: {
                type: 'object',
                properties: {
                    score: { type: 'number' },
                    confidence: { type: 'number' },
                    evaluation: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                    feedback: { type: 'string' },
                    reason: { type: 'string' },
                },
                required: ['score', 'confidence', 'evaluation', 'feedback', 'reason'],
                additionalProperties: false,
            },
        },
    });

    const text = response.text || '{}';
    const digest = crypto.createHash('sha1').update(text).digest('hex');
    const parsed = JSON.parse(text) as {
        score: number;
        confidence: number;
        evaluation: 'A' | 'B' | 'C' | 'D';
        feedback: string;
        reason: string;
    };

    return {
        score: Math.max(0, Math.min(input.gradingConfig.maxScore, Number(parsed.score) || 0)),
        maxScore: input.gradingConfig.maxScore,
        evaluation: parsed.evaluation,
        isCorrect: parsed.evaluation === 'A' || parsed.evaluation === 'B',
        feedback: parsed.feedback,
        reason: parsed.reason,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        graderType: input.answerSpec.kind === 'visionRubric' ? 'AI_VISION' : 'AI',
        modelVersion: modelName,
        promptVersion,
        rawResponseDigest: digest,
    };
}

