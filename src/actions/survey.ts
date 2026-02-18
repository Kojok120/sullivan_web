'use server';

import { getSurveyQuestions, shouldShowSurvey, submitSurveyResponse } from '@/lib/survey-service';
import { revalidatePath } from 'next/cache';

/**
 * Determine whether the survey should be shown to a user.
 *
 * @param userId - The identifier of the user to check eligibility for
 * @returns `true` if the survey should be shown to the specified user, `false` otherwise (also `false` when `userId` is empty)
 */
export async function checkSurveyEligibility(userId: string) {
    if (!userId) return false;
    return await shouldShowSurvey(userId);
}

/**
 * Retrieves survey questions from the survey service.
 *
 * @returns The survey questions returned by the survey service.
 */
export async function fetchSurveyQuestions() {
    return await getSurveyQuestions();
}

/**
 * Submit a student's survey responses and revalidate UI pages affected by the survey.
 *
 * Validates that a `userId` is provided, records the supplied answers, and triggers cache revalidation for pages whose content depends on survey state.
 *
 * @param userId - The identifier of the user submitting the survey
 * @param answers - An array of answers; each item contains `questionId` and a numeric `value`
 * @throws Error if `userId` is empty
 */
export async function submitSurvey(userId: string, answers: { questionId: string; value: number }[]) {
    if (!userId) throw new Error('User ID is required');

    await submitSurveyResponse(userId, answers);

    // Revalidate paths where survey status might affect UI
    revalidatePath('/student/dashboard'); // Example path
    revalidatePath(`/history/[id]`, 'page'); // Grading result page pattern
}