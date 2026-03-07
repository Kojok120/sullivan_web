import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { GoogleGenAI, createPartFromUri } from '@google/genai';
import { z } from 'zod';

import { getSession } from '@/lib/auth';
import { canAccessUserWithinClassroomScope, isTeacherOrAdminRole } from '@/lib/authorization';
import { loadInstructionPrompt } from '@/lib/instruction-prompt';
import { prisma } from '@/lib/prisma';

const ACCEPTED_AUDIO_MIME = 'audio/ogg';
const INLINE_AUDIO_SIZE_LIMIT_BYTES = 20 * 1024 * 1024;
const MAX_AUDIO_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;

const payloadSchema = z.object({
    startedAtIso: z.string().datetime().optional(),
    endedAtIso: z.string().datetime().optional(),
    timeZone: z.string().optional(),
});

type InterviewSummary = {
    summary: string;
    decisions: string[];
    nextActions: string[];
};

function normalizeMimeType(value: string | null | undefined): string {
    return value?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function formatDateTimeForPrompt(date: Date, timeZone: string | undefined): string {
    try {
        return new Intl.DateTimeFormat('ja-JP', {
            timeZone,
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date);
    } catch {
        return new Intl.DateTimeFormat('ja-JP', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date);
    }
}

function parseSummaryResponse(rawText: string): InterviewSummary {
    const normalized = rawText
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

    const parsed = JSON.parse(normalized) as {
        summary?: unknown;
        decisions?: unknown;
        nextActions?: unknown;
    };

    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const decisions = Array.isArray(parsed.decisions)
        ? parsed.decisions.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
        : [];
    const nextActions = Array.isArray(parsed.nextActions)
        ? parsed.nextActions.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
        : [];

    if (!summary) {
        throw new Error('summary is empty');
    }

    return {
        summary,
        decisions,
        nextActions,
    };
}

function toGuidanceContent(summary: InterviewSummary): string {
    const decisionsText = summary.decisions.length > 0
        ? summary.decisions.map((item) => `- ${item}`).join('\n')
        : '- なし';
    const nextActionsText = summary.nextActions.length > 0
        ? summary.nextActions.map((item) => `- ${item}`).join('\n')
        : '- なし';

    return [
        '## 要約',
        summary.summary,
        '',
        '## 決定事項',
        decisionsText,
        '',
        '## 次回アクション',
        nextActionsText,
    ].join('\n');
}

async function generateInterviewSummary(params: {
    audioFile: File;
    prompt: string;
}): Promise<InterviewSummary> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set');
    }

    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-pro-preview';

    const responseSchema = {
        type: 'object',
        properties: {
            summary: { type: 'string' },
            decisions: {
                type: 'array',
                items: { type: 'string' },
            },
            nextActions: {
                type: 'array',
                items: { type: 'string' },
            },
        },
        required: ['summary', 'decisions', 'nextActions'],
        additionalProperties: false,
    };

    let uploadedFileName: string | null = null;

    try {
        let parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } } | ReturnType<typeof createPartFromUri>>;

        if (params.audioFile.size <= INLINE_AUDIO_SIZE_LIMIT_BYTES) {
            const audioBuffer = await params.audioFile.arrayBuffer();
            const base64 = Buffer.from(audioBuffer).toString('base64');
            parts = [
                { text: params.prompt },
                {
                    inlineData: {
                        mimeType: ACCEPTED_AUDIO_MIME,
                        data: base64,
                    },
                },
            ];
        } else {
            const uploaded = await ai.files.upload({
                file: params.audioFile,
                config: {
                    mimeType: ACCEPTED_AUDIO_MIME,
                    displayName: `guidance-audio-${Date.now()}.ogg`,
                },
            });

            if (!uploaded.name || !uploaded.uri) {
                throw new Error('failed to upload audio file');
            }

            uploadedFileName = uploaded.name;
            parts = [
                { text: params.prompt },
                createPartFromUri(uploaded.uri, ACCEPTED_AUDIO_MIME),
            ];
        }

        const response = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts }],
            config: {
                responseMimeType: 'application/json',
                responseJsonSchema: responseSchema,
                maxOutputTokens: 2048,
            },
        });

        const rawText = response.text?.trim();
        if (!rawText) {
            throw new Error('empty response text');
        }

        return parseSummaryResponse(rawText);
    } finally {
        if (uploadedFileName) {
            await ai.files.delete({ name: uploadedFileName }).catch((error) => {
                console.warn('[guidance-summary] failed to delete uploaded file:', error);
            });
        }
    }
}

export const runtime = 'nodejs';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    if (!isTeacherOrAdminRole(session.role)) {
        return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { userId } = await params;

    if (session.role !== 'ADMIN') {
        const canAccess = await canAccessUserWithinClassroomScope({
            actorUserId: session.userId,
            actorRole: session.role,
            targetUserId: userId,
        });
        if (!canAccess) {
            return NextResponse.json({ error: '担当教室外の生徒にはアクセスできません' }, { status: 403 });
        }
    }

    const formData = await request.formData();
    const parsedPayload = payloadSchema.safeParse({
        startedAtIso: formData.get('startedAtIso')?.toString(),
        endedAtIso: formData.get('endedAtIso')?.toString(),
        timeZone: formData.get('timeZone')?.toString(),
    });

    if (!parsedPayload.success) {
        return NextResponse.json({ error: parsedPayload.error.errors[0]?.message ?? '入力値が不正です' }, { status: 400 });
    }

    const audio = formData.get('audio');
    if (!(audio instanceof File)) {
        return NextResponse.json({ error: '音声ファイルが必要です' }, { status: 400 });
    }

    const mimeType = normalizeMimeType(audio.type);
    if (mimeType !== ACCEPTED_AUDIO_MIME) {
        return NextResponse.json({ error: 'audio/ogg 形式の音声のみ対応しています' }, { status: 400 });
    }

    if (audio.size <= 0 || audio.size > MAX_AUDIO_SIZE_LIMIT_BYTES) {
        return NextResponse.json({ error: '音声サイズが上限を超えています' }, { status: 400 });
    }

    const endedAt = parsedPayload.data.endedAtIso ? new Date(parsedPayload.data.endedAtIso) : new Date();
    const startedAt = parsedPayload.data.startedAtIso ? new Date(parsedPayload.data.startedAtIso) : null;
    const durationMinutes = startedAt
        ? Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / (1000 * 60)))
        : null;

    const [student, teacher] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                role: true,
                name: true,
                loginId: true,
            },
        }),
        prisma.user.findUnique({
            where: { id: session.userId },
            select: {
                name: true,
                loginId: true,
            },
        }),
    ]);

    if (!student || student.role !== 'STUDENT') {
        return NextResponse.json({ error: '生徒が見つかりません' }, { status: 404 });
    }

    const studentName = student.name || student.loginId;
    const teacherName = teacher?.name || teacher?.loginId || '担当講師';

    const prompt = loadInstructionPrompt('interview-summary-prompt.md', {
        studentName,
        teacherName,
        recordedAt: formatDateTimeForPrompt(endedAt, parsedPayload.data.timeZone),
        durationMinutes: durationMinutes ?? '不明',
    });

    try {
        const summary = await generateInterviewSummary({
            audioFile: audio,
            prompt,
        });

        const record = await prisma.guidanceRecord.create({
            data: {
                studentId: userId,
                teacherId: session.userId,
                date: endedAt,
                type: 'INTERVIEW',
                content: toGuidanceContent(summary),
            },
        });

        revalidatePath(`/teacher/students/${userId}`);

        return NextResponse.json({
            success: true,
            recordId: record.id,
            content: record.content,
        });
    } catch (error) {
        console.error('[guidance-summary] failed:', {
            studentId: userId,
            teacherId: session.userId,
            audioBytes: audio.size,
            message: error instanceof Error ? error.message : String(error),
        });

        return NextResponse.json({ error: 'AI要約に失敗しました。手動入力で保存してください。' }, { status: 500 });
    }
}
