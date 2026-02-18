import { prisma } from '@/lib/prisma';
import { QuestionBank, SurveyCategory } from '@prisma/client';

export const SURVEY_CATEGORIES: SurveyCategory[] = [
    SurveyCategory.GRIT,
    SurveyCategory.SELF_EFFICACY,
    SurveyCategory.SELF_REGULATION,
    SurveyCategory.GROWTH_MINDSET,
    SurveyCategory.EMOTIONAL_REGULATION
];

export const SURVEY_INTERVAL_DAYS = 90; // 3ヶ月

export type SurveyQuestion = {
    id: string;
    category: SurveyCategory;
    question: string;
};

/**
 * ユーザーがアンケート対象かどうかをチェックします。
 * 未回答、または前回の回答から90日以上経過している場合に true を返します。
 */
export async function shouldShowSurvey(userId: string): Promise<boolean> {
    const lastResponse = await prisma.surveyResponse.findFirst({
        where: { userId },
        orderBy: { answeredAt: 'desc' },
        select: { answeredAt: true }
    });

    if (!lastResponse) {
        return true;
    }

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastResponse.answeredAt.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays >= SURVEY_INTERVAL_DAYS;
}

/**
 * QuestionBankからランダムに20問（5カテゴリ×4問）を取得します。
 * 結果はシャッフルされて返されます。
 */
export async function getSurveyQuestions(): Promise<SurveyQuestion[]> {
    const questions: SurveyQuestion[] = [];

    // 全ての質問IDを取得してから JS側でランダム抽出（質問数が少ないため全件取得で問題なし）
    const allQuestions = await prisma.questionBank.findMany();

    // カテゴリごとにグループ化
    const byCategory: Record<string, QuestionBank[]> = {};
    for (const q of allQuestions) {
        if (!byCategory[q.category]) {
            byCategory[q.category] = [];
        }
        byCategory[q.category].push(q);
    }

    // 各カテゴリから4問ずつ抽出
    for (const category of SURVEY_CATEGORIES) {
        const candidates = byCategory[category] || [];
        const picked = pickRandom(candidates, 4);
        questions.push(...picked);
    }

    // 最終リストをシャッフル
    return shuffleArray(questions);
}

/**
 * アンケート回答を保存し、スコアを計算します。
 */
export async function submitSurveyResponse(userId: string, answers: { questionId: string; value: number }[]) {
    // バリデーション
    if (!answers || answers.length === 0) {
        throw new Error('回答データが空です。');
    }

    // 重複チェック
    const questionIdsInput = answers.map(a => a.questionId);
    const uniqueQuestionIds = new Set(questionIdsInput);
    if (uniqueQuestionIds.size !== questionIdsInput.length) {
        throw new Error('重複した質問IDが含まれています。');
    }

    // 値の範囲チェック
    for (const ans of answers) {
        if (!Number.isInteger(ans.value) || ans.value < 1 || ans.value > 5) {
            throw new Error(`不正な回答値が含まれています: questionId=${ans.questionId}, value=${ans.value}`);
        }
    }

    // 1. 関連する質問を取得してカテゴリを確認
    const questions = await prisma.questionBank.findMany({
        where: { id: { in: questionIdsInput } }
    });

    const questionMap = new Map(questions.map(q => [q.id, q]));

    // 2. スコア計算
    const categoryScores: Record<string, { sum: number; count: number }> = {};
    const detailedAnswers = [];

    for (const ans of answers) {
        const q = questionMap.get(ans.questionId);
        if (!q) continue;

        if (!categoryScores[q.category]) {
            categoryScores[q.category] = { sum: 0, count: 0 };
        }
        categoryScores[q.category].sum += ans.value;
        categoryScores[q.category].count += 1;

        detailedAnswers.push({
            questionId: ans.questionId,
            question: q.question,
            category: q.category,
            value: ans.value
        });
    }

    const finalScores: Record<string, number> = {};
    for (const cat in categoryScores) {
        finalScores[cat] = parseFloat((categoryScores[cat].sum / categoryScores[cat].count).toFixed(2));
    }

    // 3. DB保存
    return await prisma.surveyResponse.create({
        data: {
            userId,
            details: detailedAnswers,
            scores: finalScores,
            answeredAt: new Date()
        }
    });
}

// ヘルパー関数
function pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = shuffleArray([...arr]);
    return shuffled.slice(0, count);
}

function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
