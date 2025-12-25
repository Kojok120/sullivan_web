'use client';

import { Problem } from '@prisma/client';
import { useState, useEffect } from 'react';
import { getProblemsByCoreProblem } from '../actions';
import { LinkIcon, GraduationCap } from 'lucide-react';




interface ProblemEditorProps {
    coreProblemId: string;
}

function ProblemItem({ problem }: { problem: Problem }) {
    return (
        <div className="group flex items-start gap-2 p-2 px-3 border-b bg-background hover:bg-muted/30 transition-colors">
            {/* Inputs Grid */}
            <div className="flex-1 grid gap-2">
                {/* Row 1: Question & Answer */}
                <div className="flex gap-2 items-stretch">
                    <div className="flex-1 p-2 text-sm font-medium whitespace-pre-wrap border rounded-md bg-transparent">
                        {problem.question}
                    </div>
                    <div className="w-1/3 p-2 text-sm whitespace-pre-wrap border rounded-md bg-transparent">
                        {problem.answer}
                    </div>
                </div>

                {/* Row 2: Secondary Info */}
                <div className="flex gap-2 items-center">
                    {problem.videoUrl && (
                        <div className="relative flex-1">
                            <LinkIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <div className="h-7 text-xs pl-7 bg-muted/20 border rounded-md flex items-center overflow-hidden whitespace-nowrap">
                                {problem.videoUrl}
                            </div>
                        </div>
                    )}
                    {problem.grade && (
                        <div className="relative w-24">
                            <GraduationCap className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <div className="h-7 text-xs pl-7 bg-muted/20 border rounded-md flex items-center">
                                {problem.grade}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function ProblemEditor({ coreProblemId }: ProblemEditorProps) {
    const [problems, setProblems] = useState<Problem[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchProblems = async () => {
            setLoading(true);
            const res = await getProblemsByCoreProblem(coreProblemId);
            if (res.success && res.problems) {
                setProblems(res.problems);
            }
            setLoading(false);
        };
        fetchProblems();
    }, [coreProblemId]);

    if (loading && problems.length === 0) return <div className="p-4 text-muted-foreground text-sm">読み込み中...</div>;

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Header */}
            <div className="p-2 px-4 border-b bg-white flex justify-between items-center sticky top-0 z-10 shadow-sm gap-2">
                <h3 className="font-semibold text-sm">問題一覧 ({problems.length})</h3>
                <div className="text-xs text-muted-foreground bg-yellow-50 text-yellow-700 px-2 py-1 rounded border border-yellow-200">
                    ※ここでの編集はできません。「問題管理」を使用してください
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto pb-4">
                {problems.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        問題がありません。
                    </div>
                ) : (
                    problems.map((problem) => (
                        <ProblemItem
                            key={problem.id}
                            problem={problem}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
