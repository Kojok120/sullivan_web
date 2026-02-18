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
 * Checks if the user should be shown the survey.
 * Returns true if the user has never answered or if 90 days have passed since the last answer.
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
 * Retrieves 20 random questions from the QuestionBank (4 from each of the 5 categories).
 * The returned array is shuffled.
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
 * Saves a survey response and calculates scores.
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

// Helper functions
function pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
