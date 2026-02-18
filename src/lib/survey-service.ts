import { prisma } from '@/lib/prisma';
import { QuestionBank, SurveyResponse } from '@prisma/client';

export type SurveyCategory = 'GRIT' | 'SELF_EFFICACY' | 'SELF_REGULATION' | 'GROWTH_MINDSET' | 'EMOTIONAL_REGULATION';

export const SURVEY_CATEGORIES: SurveyCategory[] = [
    'GRIT',
    'SELF_EFFICACY',
    'SELF_REGULATION',
    'GROWTH_MINDSET',
    'EMOTIONAL_REGULATION'
];

export const SURVEY_INTERVAL_DAYS = 90; // 3 months

export type SurveyQuestion = {
    id: string;
    category: string;
    question: string;
};

/**
 * Determine whether a user should be shown the survey.
 *
 * @param userId - The ID of the user to check
 * @returns `true` if the user has never submitted a survey response or if their most recent response was answered at least 90 days ago, `false` otherwise
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
 * Selects 20 survey questions by choosing 4 random questions from each survey category and returning them shuffled.
 *
 * @returns An array of 20 `SurveyQuestion` objects (4 per category) in randomized order
 */
export async function getSurveyQuestions(): Promise<SurveyQuestion[]> {
    const questions: SurveyQuestion[] = [];

    // Ideally we would use raw SQL for random selection, but for simplicity and portability in Prisma:
    // We fetch all IDs first (or a reasonable subset) and then pick random ones in JS.
    // Given the question bank is small (100 questions), fetching all is fine.

    const allQuestions = await prisma.questionBank.findMany();

    // Group by category
    const byCategory: Record<string, QuestionBank[]> = {};
    for (const q of allQuestions) {
        if (!byCategory[q.category]) {
            byCategory[q.category] = [];
        }
        byCategory[q.category].push(q);
    }

    // Pick 4 from each category
    for (const category of SURVEY_CATEGORIES) {
        const candidates = byCategory[category] || [];
        const picked = pickRandom(candidates, 4);
        questions.push(...picked);
    }

    // Shuffle final list
    return shuffleArray(questions);
}

/**
 * Persist a user's survey response and compute per-category average scores.
 *
 * Builds detailed answer entries from the provided answers and their corresponding questions,
 * ignores answers whose question cannot be found, computes the average score for each category
 * (rounded to two decimal places), and creates a SurveyResponse record with `details`, `scores`,
 * `userId`, and `answeredAt`.
 *
 * @param userId - Identifier of the user submitting the survey
 * @param answers - Array of answer objects with `questionId` and numeric `value`; entries whose `questionId` is not found in the question bank are skipped
 * @returns The created SurveyResponse record containing the saved details, computed scores, `userId`, and `answeredAt`
 */
export async function submitSurveyResponse(userId: string, answers: { questionId: string; value: number }[]) {
    // 1. Fetch related questions to get categories
    const questionIds = answers.map(a => a.questionId);
    const questions = await prisma.questionBank.findMany({
        where: { id: { in: questionIds } }
    });

    const questionMap = new Map(questions.map(q => [q.id, q]));

    // 2. Calculate scores
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

    // 3. Save to DB
    return await prisma.surveyResponse.create({
        data: {
            userId,
            details: detailedAnswers,
            scores: finalScores,
            answeredAt: new Date()
        }
    });
}

/**
 * Selects up to `count` random elements from an input array.
 *
 * @param arr - Source array to pick elements from
 * @param count - Maximum number of elements to return
 * @returns A new array containing up to `count` elements chosen at random from `arr`; the original array is not modified
 */
function pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

/**
 * Randomly shuffles the elements of an array in place.
 *
 * @param array - The array to shuffle; the input is mutated and the same reference is returned
 * @returns The shuffled array (same reference as `array`)
 */
function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}