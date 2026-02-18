'use server';

import { getSurveyQuestions, shouldShowSurvey, submitSurveyResponse } from '@/lib/survey-service';
import { revalidatePath } from 'next/cache';

export async function checkSurveyEligibility(userId: string) {
    if (!userId) return false;
    return await shouldShowSurvey(userId);
}

export async function fetchSurveyQuestions() {
    return await getSurveyQuestions();
}

export async function submitSurvey(userId: string, answers: { questionId: string; value: number }[]) {
    if (!userId) throw new Error('User ID is required');

    await submitSurveyResponse(userId, answers);

    // Revalidate paths where survey status might affect UI
    revalidatePath('/student/dashboard'); // Example path
    revalidatePath(`/history/[id]`, 'page'); // Grading result page pattern
}
