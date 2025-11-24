import { getNextProblem, submitEvaluation } from "@/app/actions";
import { LearningSession, ProblemData } from "@/components/learning-session";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session) redirect("/login");

    const userId = session.userId; // Use real user ID
    const { id: coreProblemId } = await params;

    const initialProblem = await getNextProblem(userId, coreProblemId);

    if (!initialProblem) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <h1 className="text-2xl font-bold mb-4">全て完了しました！</h1>
                <p className="text-slate-600 mb-8">このセクションの課題はすべて終了しました。</p>
                <a href="/" className="text-indigo-600 hover:underline">ダッシュボードに戻る</a>
            </div>
        );
    }

    async function handleEvaluate(problemId: string, evaluation: "A" | "B" | "C" | "D"): Promise<ProblemData | null> {
        "use server";
        await submitEvaluation(userId, problemId, evaluation);
        return await getNextProblem(userId, coreProblemId);
    }

    return (
        <div className="min-h-screen bg-slate-50 py-12">
            <div className="container mx-auto px-4">
                <LearningSession
                    initialProblem={initialProblem}
                    onEvaluate={handleEvaluate}
                />
            </div>
        </div>
    );
}
