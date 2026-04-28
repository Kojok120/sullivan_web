import crypto from 'node:crypto';

import { GoogleGenAI } from '@google/genai';
import { ZodError } from 'zod';

import {
    buildFigureGenerationPrompt,
    type FigureGenerationTarget,
    getSceneSpecJsonSchema,
    parseSceneSpecForTarget,
} from '@/lib/problem-figure-scene';

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

export async function generateProblemFigureScene(input: {
    targetTool: FigureGenerationTarget;
    problemType?: string;
    sourceProblemText: string;
    extraPrompt?: string;
}) {
    const modelName = process.env.GEMINI_MODEL || process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-pro-preview';
    const prompt = buildFigureGenerationPrompt(input);
    const response = await getGenAI().models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            responseMimeType: 'application/json',
            responseJsonSchema: getSceneSpecJsonSchema(input.targetTool),
            maxOutputTokens: 4096,
        },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
        throw new Error('Gemini から scene spec が返されませんでした');
    }

    let rawJson: unknown;
    try {
        rawJson = JSON.parse(rawText);
    } catch (error) {
        throw new Error(`Gemini の応答が JSON ではありません: ${error instanceof Error ? error.message : 'parse error'}`);
    }

    let sceneSpec;
    try {
        sceneSpec = parseSceneSpecForTarget(input.targetTool, rawJson);
    } catch (error) {
        if (error instanceof ZodError) {
            const details = error.issues
                .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
                .join(' / ');
            throw new Error(`図版生成結果の検証に失敗しました: ${details}`);
        }

        throw error;
    }

    const sceneSpecDigest = crypto
        .createHash('sha1')
        .update(JSON.stringify(sceneSpec))
        .digest('hex');

    return {
        sceneSpec,
        sceneSpecKind: sceneSpec.kind,
        modelName,
        promptVersion: 'figure-scene-v1',
        sceneSpecDigest,
    };
}
