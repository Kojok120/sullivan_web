import { prisma } from '@/lib/prisma';
import { getSurveyQuestions, shouldShowSurvey, submitSurveyResponse } from '@/lib/survey-service';

/**
 * Performs an end-to-end verification of the survey flow and seed data.
 *
 * Runs checks against the question bank seed (expects 100 questions), retrieves survey questions (expects 20), verifies category diversity, creates a temporary test user to validate eligibility before and after submitting a generated set of answers, submits those answers, and cleans up the temporary user and their responses. Logs pass/error/warn messages for each step and attempts cleanup on failures.
 */
async function main() {
    console.log('--- Starting Survey Logic Verification ---');

    // 1. Verify Questions Seeding
    const questions = await prisma.questionBank.findMany();
    console.log(`Total questions in bank: ${questions.length}`);
    if (questions.length !== 100) {
        console.error('ERROR: Expected 100 questions.');
    } else {
        console.log('PASS: Question bank seeded correctly.');
    }

    // 2. Test getSurveyQuestions
    const surveyQuestions = await getSurveyQuestions();
    console.log(`Retrieved survey questions: ${surveyQuestions.length}`);
    if (surveyQuestions.length !== 20) {
        console.error('ERROR: Expected 20 questions.');
    } else {
        console.log('PASS: Retrieved 20 questions.');
    }

    // Check randomness/categories (basic check)
    const categories = new Set(surveyQuestions.map(q => q.category));
    console.log(`Categories found: ${Array.from(categories).join(', ')}`);
    if (categories.size !== 5) {
        console.warn('WARN: Not all 5 categories represented (might happen by chance but unlikely with 4 each logic).');
    }

    // 3. Test User Flow
    // Create a dummy user for testing or use an existing one
    // Let's create a temp user to be safe
    const testUser = await prisma.user.create({
        data: {
            loginId: `test_survey_${Date.now()}`,
            role: 'STUDENT'
        }
    });
    console.log(`Created test user: ${testUser.id}`);

    try {
        // Check eligibility (should be true)
        const eligibleBefore = await shouldShowSurvey(testUser.id);
        console.log(`Eligible before submission: ${eligibleBefore}`);
        if (!eligibleBefore) console.error('ERROR: User should be eligible.');

        // Submit response
        const answers = surveyQuestions.map(q => ({
            questionId: q.id,
            value: Math.floor(Math.random() * 5) + 1
        }));

        await submitSurveyResponse(testUser.id, answers);
        console.log('Submitted survey response.');

        // Check eligibility again (should be false)
        const eligibleAfter = await shouldShowSurvey(testUser.id);
        console.log(`Eligible after submission: ${eligibleAfter}`);
        if (eligibleAfter) console.error('ERROR: User should NOT be eligible immediately after submission.');
        else console.log('PASS: Eligibility logic works.');

        // Clean up
        await prisma.surveyResponse.deleteMany({ where: { userId: testUser.id } });
        await prisma.user.delete({ where: { id: testUser.id } });
        console.log('Cleaned up test user.');

    } catch (e) {
        console.error('Test failed:', e);
        // Try cleanup
        await prisma.user.delete({ where: { id: testUser.id } }).catch(() => { });
    }

    console.log('--- Verification Finished ---');
}

main();