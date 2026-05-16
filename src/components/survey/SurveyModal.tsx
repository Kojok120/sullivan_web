'use client';

import { useState, useEffect } from 'react';
import { fetchSurveyQuestions, submitSurvey } from '@/actions/survey';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

type Question = {
    id: string;
    question: string;
    category: string; // Not shown to user, but good to have
};

interface SurveyModalProps {
    userId: string;
    onComplete?: () => void;
}

export function SurveyModal({ userId, onComplete }: SurveyModalProps) {
    const t = useTranslations('SurveyModal');
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
            alert(t('submitFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    const isComplete = questions.length > 0 && Object.keys(answers).length === questions.length;

    if (loading) return null; // Or a spinner
    if (questions.length === 0) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border">
                    <h2 className="text-xl font-bold text-foreground">{t('title')}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {t('descriptionLine1')}<br />
                        {t('descriptionLine2')}
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {questions.map((q, index) => (
                        <div key={q.id} className="space-y-3">
                            <p className="font-medium text-foreground">
                                <span className="text-muted-foreground mr-2">Q{index + 1}.</span>
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
                                            className="w-5 h-5 text-primary border focus:ring-ring mb-1"
                                        />
                                        <span className={`text-xs ${answers[q.id] === val ? 'font-bold text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                            {val}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground px-2 sm:w-[300px]">
                                <span>{t('scaleMinLine1')}<br />{t('scaleMinLine2')}</span>
                                <span className="text-right">{t('scaleMaxLine1')}<br />{t('scaleMaxLine2')}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 border-t border bg-muted rounded-b-lg flex justify-end">
                    <button
                        onClick={handleSubmit}
                        disabled={!isComplete || submitting}
                        className={`px-6 py-2.5 rounded-lg text-white font-medium transition-all
                            ${isComplete && !submitting
                                ? 'bg-primary hover:bg-primary/90'
                                : 'bg-muted-foreground cursor-not-allowed'}`}
                    >
                        {submitting ? t('submitting') : t('submit')}
                    </button>
                    {!isComplete && (
                        <p className="text-xs text-red-500 mt-2 absolute left-6 bottom-8">
                            {t('incompleteNotice')}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
