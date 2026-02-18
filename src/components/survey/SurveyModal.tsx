'use client';

import { useState, useEffect } from 'react';
import { fetchSurveyQuestions, submitSurvey } from '@/actions/survey';
import { useRouter } from 'next/navigation';

type Question = {
    id: string;
    question: string;
    category: string; // Not shown to user, but good to have
};

interface SurveyModalProps {
    userId: string;
    onComplete?: () => void;
}

/**
 * Renders a survey modal that fetches questions on mount, collects a 1–5 response for each question, and submits the answers.
 *
 * @param userId - ID of the user whose survey responses will be submitted
 * @param onComplete - Optional callback invoked after a successful submission
 * @returns The modal element when questions are available; `null` while loading or if no questions were fetched
 */
export function SurveyModal({ userId, onComplete }: SurveyModalProps) {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const router = useRouter();

    useEffect(() => {
        async function load() {
            try {
                const qs = await fetchSurveyQuestions();
                setQuestions(qs);
            } catch (error) {
                console.error('Failed to load survey questions', error);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const handleAnswer = (questionId: string, value: number) => {
        setAnswers(prev => ({ ...prev, [questionId]: value }));
    };

    const handleSubmit = async () => {
        if (Object.keys(answers).length < questions.length) return;
        setSubmitting(true);
        try {
            const formattedAnswers = Object.entries(answers).map(([qid, val]) => ({
                questionId: qid,
                value: val
            }));
            await submitSurvey(userId, formattedAnswers);
            if (onComplete) onComplete();
            router.refresh(); // Refresh to update server components if needed
        } catch (error) {
            console.error('Failed to submit survey', error);
            alert('送信に失敗しました。もう一度お試しください。');
        } finally {
            setSubmitting(false);
        }
    };

    const isComplete = questions.length > 0 && Object.keys(answers).length === questions.length;

    if (loading) return null; // Or a spinner
    if (questions.length === 0) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-200">
                    <h2 className="text-xl font-bold text-gray-900">定期振り返りアンケート</h2>
                    <p className="mt-2 text-sm text-gray-600">
                        日頃の学習についての振り返りをお願いします。<br />
                        直感で「とてもあてはまる（5）」〜「まったくあてはまらない（1）」を選んでください。
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {questions.map((q, index) => (
                        <div key={q.id} className="space-y-3">
                            <p className="font-medium text-gray-800">
                                <span className="text-gray-500 mr-2">Q{index + 1}.</span>
                                {q.question}
                            </p>
                            <div className="flex justify-between items-center sm:justify-start sm:space-x-8 px-2">
                                {[1, 2, 3, 4, 5].map((val) => (
                                    <label key={val} className="flex flex-col items-center cursor-pointer group">
                                        <input
                                            type="radio"
                                            name={q.id}
                                            value={val}
                                            checked={answers[q.id] === val}
                                            onChange={() => handleAnswer(q.id, val)}
                                            className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500 mb-1"
                                        />
                                        <span className={`text-xs ${answers[q.id] === val ? 'font-bold text-blue-600' : 'text-gray-500 group-hover:text-gray-700'}`}>
                                            {val}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 px-2 sm:w-[300px]">
                                <span>まったく<br />あてはまらない</span>
                                <span className="text-right">とても<br />あてはまる</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg flex justify-end">
                    <button
                        onClick={handleSubmit}
                        disabled={!isComplete || submitting}
                        className={`px-6 py-2.5 rounded-lg text-white font-medium transition-all
                            ${isComplete && !submitting
                                ? 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl'
                                : 'bg-gray-400 cursor-not-allowed'}`}
                    >
                        {submitting ? '送信中...' : '回答を送信して結果を見る'}
                    </button>
                    {!isComplete && (
                        <p className="text-xs text-red-500 mt-2 absolute left-6 bottom-8">
                            ※ すべての質問に回答してください
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}