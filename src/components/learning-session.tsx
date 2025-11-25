"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, PlayCircle, ArrowRight, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { submitAnswerWithAI } from "@/app/actions";

export interface ProblemData {
    id: string;
    question: string;
    answer?: string;
    videoUrl?: string | null;
    coreProblemId?: string;
    difficulty?: number;
    aiGradingEnabled?: boolean;
    coreProblemName: string;
    unitName: string;
};

interface LearningSessionProps {
    initialProblem: ProblemData;
    onEvaluate: (problemId: string, evaluation: "A" | "B" | "C" | "D") => Promise<ProblemData | null>;
}

import YouTube, { YouTubeEvent } from 'react-youtube';

// Helper to extract YouTube ID
function getYouTubeId(url: string): string | null {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

export function LearningSession({ initialProblem, onEvaluate }: LearningSessionProps) {
    const [problem, setProblem] = useState<ProblemData | null>(initialProblem);
    const [showAnswer, setShowAnswer] = useState(false);
    const [showVideo, setShowVideo] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [isVideoCompleted, setIsVideoCompleted] = useState(false);

    // AI Grading State
    const [userAnswer, setUserAnswer] = useState("");
    const [aiFeedback, setAiFeedback] = useState<string | null>(null);
    const [aiEvaluation, setAiEvaluation] = useState<"A" | "B" | "C" | "D" | null>(null);
    const [isGrading, setIsGrading] = useState(false);

    // Refactored state for pending evaluation
    const [pendingEval, setPendingEval] = useState<"C" | "D" | null>(null);

    const proceedToNext = async (evaluation: "A" | "B" | "C" | "D") => {
        if (!problem) return;
        setLoading(true);
        try {
            const nextProblem = await onEvaluate(problem.id, evaluation);
            if (nextProblem) {
                setProblem(nextProblem);
                // Reset states
                setShowAnswer(false);
                setShowVideo(false);
                setUserAnswer("");
                setAiFeedback(null);
                setAiEvaluation(null);
                setIsVideoCompleted(false);
            } else {
                setIsFinished(true);
            }
        } catch (error) {
            console.error("Failed to fetch next problem", error);
        } finally {
            setLoading(false);
        }
    };

    const handleEvaluateClick = (evaluation: "A" | "B" | "C" | "D") => {
        if (evaluation === "C" || evaluation === "D") {
            setPendingEval(evaluation);
            setShowVideo(true);
            setIsVideoCompleted(false); // Reset for new video view
        } else {
            proceedToNext(evaluation);
        }
    };

    const handleVideoDone = () => {
        if (pendingEval) {
            proceedToNext(pendingEval);
            setPendingEval(null);
        }
    };

    const onPlayerStateChange = (event: YouTubeEvent) => {
        // 0 is YT.PlayerState.ENDED
        if (event.data === 0) {
            setIsVideoCompleted(true);
        }
    };

    const handleAiSubmit = async () => {
        if (!problem || !userAnswer.trim()) return;
        setIsGrading(true);
        try {
            const result = await submitAnswerWithAI(problem.id, userAnswer);
            if (result.aiGraded) {
                setAiFeedback(result.feedback || "フィードバックがありません");
                setAiEvaluation(result.evaluation as "A" | "B" | "C" | "D");
            } else {
                // Fallback if AI grading was disabled/skipped
                setShowAnswer(true);
            }
        } catch (error) {
            console.error("AI grading failed", error);
            // Fallback to manual
            setShowAnswer(true);
        } finally {
            setIsGrading(false);
        }
    };

    if (isFinished) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                <div className="rounded-full bg-green-100 p-6">
                    <CheckCircle2 className="h-16 w-16 text-green-600" />
                </div>
                <h2 className="text-3xl font-bold">セッション完了！</h2>
                <p className="text-muted-foreground text-lg">
                    お疲れ様でした。本日の学習目標を達成しました。
                </p>
                <Button size="lg" onClick={() => window.location.href = '/'}>
                    ホームに戻る
                </Button>
            </div>
        );
    }

    if (!problem) return null;

    const videoId = problem.videoUrl ? getYouTubeId(problem.videoUrl) : null;

    return (
        <div className="max-w-2xl mx-auto p-4 space-y-6">
            {/* Header Info */}
            <div className="flex justify-between items-center text-sm text-slate-500">
                <span>{problem.unitName}</span>
                <Badge variant="outline" className="gap-1">
                    <Sparkles className="h-3 w-3 text-yellow-500" />
                    {problem.coreProblemName}
                </Badge>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={problem.id}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <Card className="overflow-hidden border-none shadow-lg ring-1 ring-black/5">
                        <CardHeader className="bg-muted/30 border-b pb-6">
                            <CardTitle className="text-lg font-medium text-muted-foreground flex justify-between items-center">
                                <span>問題</span>
                                <span className="text-sm font-normal bg-background px-3 py-1 rounded-full border shadow-sm">
                                    {problem.unitName}
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-12 pb-12 min-h-[240px] flex flex-col items-center justify-center gap-6">
                            <p className="text-3xl md:text-4xl text-center font-medium leading-relaxed text-foreground max-w-2xl mx-auto">
                                {problem.question}
                            </p>

                            {/* Always show input unless answer is shown */}
                            {!showAnswer && !aiFeedback && (
                                <div className="w-full max-w-lg space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                    <Textarea
                                        placeholder="回答を入力してください..."
                                        value={userAnswer}
                                        onChange={(e) => setUserAnswer(e.target.value)}
                                        className="min-h-[100px] text-lg"
                                    />
                                    <Button
                                        onClick={handleAiSubmit}
                                        disabled={isGrading || !userAnswer.trim()}
                                        className="w-full h-12 text-lg"
                                    >
                                        {isGrading ? (
                                            <>
                                                <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                                                AIが採点中...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="mr-2 h-4 w-4" />
                                                回答して採点
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}
                        </CardContent>

                        {/* Answer Section */}
                        <AnimatePresence>
                            {(showAnswer || aiFeedback) && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="bg-primary/5 border-t border-primary/10"
                                >
                                    <CardContent className="pt-8 pb-8 text-center space-y-6">
                                        <div>
                                            <p className="text-sm text-primary font-bold mb-3 uppercase tracking-widest">ANSWER</p>
                                            <p className="text-4xl font-bold text-primary">{problem.answer}</p>
                                        </div>

                                        {aiFeedback && (
                                            <div className="bg-white/80 p-4 rounded-lg border border-primary/20 max-w-lg mx-auto text-left shadow-sm">
                                                <div className="flex items-center gap-2 mb-2 text-primary font-bold border-b pb-2">
                                                    <Sparkles className="h-5 w-5" />
                                                    AIフィードバック
                                                    <Badge variant={aiEvaluation === "A" ? "default" : "secondary"} className="ml-auto">
                                                        判定: {aiEvaluation}
                                                    </Badge>
                                                </div>
                                                <p className="text-slate-700 leading-relaxed">{aiFeedback}</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <CardFooter className="flex flex-col gap-4 p-6 bg-muted/30">
                            {(showAnswer || aiFeedback) && (
                                <div className="w-full space-y-6">
                                    <p className="text-center text-muted-foreground text-sm font-medium">自己評価を選択して次へ</p>
                                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                        <EvaluationButton
                                            grade="A"
                                            label="完璧"
                                            color="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 ring-emerald-500/20"
                                            onClick={() => handleEvaluateClick("A")}
                                            disabled={loading}
                                            highlight={aiEvaluation === "A"}
                                        />
                                        <EvaluationButton
                                            grade="B"
                                            label="できた"
                                            color="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300 ring-blue-500/20"
                                            onClick={() => handleEvaluateClick("B")}
                                            disabled={loading}
                                            highlight={aiEvaluation === "B"}
                                        />
                                        <EvaluationButton
                                            grade="C"
                                            label="不安"
                                            color="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-300 ring-amber-500/20"
                                            onClick={() => handleEvaluateClick("C")}
                                            disabled={loading}
                                            highlight={aiEvaluation === "C"}
                                        />
                                        <EvaluationButton
                                            grade="D"
                                            label="不明"
                                            color="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:border-red-300 ring-red-500/20"
                                            onClick={() => handleEvaluateClick("D")}
                                            disabled={loading}
                                            highlight={aiEvaluation === "D"}
                                        />
                                    </div>
                                </div>
                            )}
                        </CardFooter>
                    </Card>
                </motion.div>
            </AnimatePresence>

            {/* Video Dialog */}
            <Dialog open={showVideo} onOpenChange={setShowVideo}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>解説動画で復習しましょう</DialogTitle>
                    </DialogHeader>
                    <div className="aspect-video bg-slate-900 rounded-lg flex items-center justify-center relative overflow-hidden group">
                        {videoId ? (
                            <YouTube
                                videoId={videoId}
                                className="w-full h-full"
                                iframeClassName="w-full h-full"
                                onStateChange={onPlayerStateChange}
                                opts={{
                                    width: '100%',
                                    height: '100%',
                                    playerVars: {
                                        autoplay: 1,
                                    },
                                }}
                            />
                        ) : (
                            <div className="text-white flex flex-col items-center">
                                <PlayCircle size={48} className="mb-2 opacity-80" />
                                <p>動画プレースホルダー</p>
                                <p className="text-xs text-slate-400">(URLが設定されていません)</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={handleVideoDone}
                            className="w-full sm:w-auto"
                            disabled={videoId ? !isVideoCompleted : false} // Disable if video exists and not completed
                        >
                            {videoId && !isVideoCompleted ? "動画を最後まで視聴してください" : "視聴しました"}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function EvaluationButton({
    grade,
    label,
    color,
    onClick,
    disabled,
    highlight
}: {
    grade: string,
    label: string,
    color: string,
    onClick: () => void,
    disabled: boolean,
    highlight?: boolean
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
                flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200
                ${color}
                ${highlight ? 'ring-4 ring-offset-2 scale-105 shadow-lg' : 'hover:shadow-md'}
                focus:outline-none focus:ring-2 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                active:scale-95
            `}
        >
            <span className="text-2xl font-bold mb-1">{grade}</span>
            <span className="text-xs font-medium opacity-80">{label}</span>
        </button>
    );
}
