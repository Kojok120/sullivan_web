import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface GradingResult {
    evaluation: "A" | "B" | "C" | "D";
    feedback: string;
}

export async function gradeAnswer(
    question: string,
    correctAnswer: string,
    userAnswer: string
): Promise<GradingResult> {
    if (!genAI) {
        console.warn("Gemini API key not found. Falling back to manual grading (simulated).");
        return {
            evaluation: "C",
            feedback: "AI grading is not configured. Please check your settings.",
        };
    }

    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
You are an expert teacher grading a student's answer.
Question: "${question}"
Correct Answer: "${correctAnswer}"
Student Answer: "${userAnswer}"

Evaluate the student's answer based on the following criteria:
- A: Perfect understanding, correct answer.
- B: Good understanding, minor mistakes or slightly incomplete.
- C: Partial understanding, significant mistakes.
- D: No understanding, incorrect or irrelevant.

Provide the evaluation (A, B, C, or D) and a brief, encouraging feedback message in Japanese.
Format your response exactly as follows:
Evaluation: [Grade]
Feedback: [Message]
`;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        const evaluationMatch = text.match(/Evaluation:\s*([ABCD])/i);
        const feedbackMatch = text.match(/Feedback:\s*(.*)/s);

        const evaluation = (evaluationMatch ? evaluationMatch[1].toUpperCase() : "C") as "A" | "B" | "C" | "D";
        const feedback = feedbackMatch ? feedbackMatch[1].trim() : "フィードバックを取得できませんでした。";

        return { evaluation, feedback };
    } catch (error) {
        console.error("Gemini grading failed:", error);
        return {
            evaluation: "C",
            feedback: "AI採点中にエラーが発生しました。",
        };
    }
}
