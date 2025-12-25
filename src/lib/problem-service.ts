/**
 * Problem CRUD 共通サービス
 * 問題管理とカリキュラム管理で共通のロジックを提供
 */

import { prisma } from '@/lib/prisma';
import { getNextCustomId } from '@/lib/curriculum-service';

export interface CreateProblemData {
    question: string;
    answer: string;
    acceptedAnswers?: string[];
    grade?: string;
    videoUrl?: string;
    coreProblemIds: string[];
    order?: number;
    subjectId?: string; // customId生成に使用
}

/**
 * 問題作成の共通ロジック
 * @param data 問題データ
 * @param tx Prismaトランザクション（オプション）
 */
export async function createProblemCore(
    data: CreateProblemData,
    tx: any = prisma
) {
    // customId生成
    let customId: string | undefined;

    // subjectIdが明示的に指定されている場合はそれを使用
    if (data.subjectId) {
        customId = await getNextCustomId(data.subjectId, tx);
    }
    // そうでなければ、最初のCoreProblemからsubjectIdを取得
    else if (data.coreProblemIds.length > 0) {
        const firstCP = await tx.coreProblem.findUnique({
            where: { id: data.coreProblemIds[0] },
            include: { subject: true }
        });
        if (firstCP) {
            customId = await getNextCustomId(firstCP.subjectId, tx);
        }
    }

    // order取得（指定がない場合は自動採番）
    let order = data.order;
    if (order === undefined || order === 0) {
        const lastProblem = await tx.problem.findFirst({
            orderBy: { order: 'desc' },
            select: { order: true }
        });
        order = (lastProblem?.order ?? 0) + 1;
    }

    return tx.problem.create({
        data: {
            question: data.question,
            answer: data.answer,
            acceptedAnswers: data.acceptedAnswers || [],
            grade: data.grade,
            videoUrl: data.videoUrl,
            customId,
            order,
            coreProblems: {
                connect: data.coreProblemIds.map(id => ({ id }))
            }
        }
    });
}

/**
 * 問題の重複チェック
 * @param questions 問題文の配列
 * @param tx Prismaトランザクション（オプション）
 */
export async function checkDuplicateQuestions(
    questions: string[],
    tx: any = prisma
): Promise<Set<string>> {
    const existingProblems = await tx.problem.findMany({
        where: { question: { in: questions } },
        select: { question: true }
    });
    return new Set(existingProblems.map((p: { question: string }) => p.question));
}

/**
 * CoreProblem情報を一括取得
 * @param coreProblemIds CoreProblem IDの配列
 * @param tx Prismaトランザクション（オプション）
 */
export async function fetchCoreProblemMap(
    coreProblemIds: string[],
    tx: any = prisma
): Promise<Map<string, { id: string; subjectId: string; subject: { name: string } }>> {
    if (coreProblemIds.length === 0) {
        return new Map();
    }

    const coreProblems = await tx.coreProblem.findMany({
        where: { id: { in: coreProblemIds } },
        include: { subject: true }
    });

    return new Map(coreProblems.map((cp: any) => [cp.id, cp]));
}
