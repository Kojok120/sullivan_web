'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Prisma } from '@prisma/client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getProblemsByCoreProblem } from '../actions';
import { LinkIcon, GraduationCap, Hash, KeyRound, BookOpen, Pencil } from 'lucide-react';

interface ProblemEditorProps {
    coreProblemId: string;
    editHrefBuilder?: (problemId: string) => string;
}

type ProblemEditorProblem = Prisma.ProblemGetPayload<{
    select: {
        id: true;
        question: true;
        answer: true;
        customId: true;
        grade: true;
        masterNumber: true;
        videoUrl: true;
        coreProblems: {
            select: {
                id: true;
                name: true;
                subject: {
                    select: {
                        name: true;
                    };
                };
            };
        };
    };
}>;

function MetaField({
    icon,
    label,
    children,
    className = '',
}: {
    icon: ReactNode;
    label: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={`rounded-md border bg-muted/20 p-2 ${className}`}>
            <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                {icon}
                <span>{label}</span>
            </div>
            <div className="text-xs">{children}</div>
        </div>
    );
}

function getSafeExternalHref(rawUrl: string | null | undefined) {
    if (!rawUrl) {
        return null;
    }

    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString();
        }
    } catch {
        return null;
    }

    return null;
}

function ProblemItem({ problem, editHref }: { problem: ProblemEditorProblem; editHref?: string }) {
    const safeVideoUrl = getSafeExternalHref(problem.videoUrl);

    return (
        <div className="group flex items-start gap-2 p-2 px-3 border-b bg-background hover:bg-muted/30 transition-colors">
            <div className="flex-1 grid gap-2">
                <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                    <div className="flex-1 p-2 text-sm font-medium whitespace-pre-wrap border rounded-md bg-transparent">
                        {problem.question}
                    </div>
                    <div className="w-full p-2 text-sm whitespace-pre-wrap border rounded-md bg-transparent sm:w-1/3">
                        {problem.answer || '-'}
                    </div>
                    {editHref ? (
                        <div className="flex sm:items-start">
                            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                                <Link href={editHref}>
                                    <Pencil className="mr-1 h-3.5 w-3.5" />
                                    編集
                                </Link>
                            </Button>
                        </div>
                    ) : null}
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                    <MetaField
                        icon={<Hash className="h-3 w-3" />}
                        label="マスタNo"
                    >
                        <span className="font-mono">{problem.masterNumber ?? '-'}</span>
                    </MetaField>

                    <MetaField
                        icon={<KeyRound className="h-3 w-3" />}
                        label="ID"
                    >
                        <span className="font-mono">{problem.customId}</span>
                    </MetaField>

                    <MetaField
                        icon={<GraduationCap className="h-3 w-3" />}
                        label="学年"
                    >
                        {problem.grade || '-'}
                    </MetaField>

                    <MetaField
                        icon={<BookOpen className="h-3 w-3" />}
                        label="紐付けCoreProblem"
                        className="sm:col-span-2 xl:col-span-2"
                    >
                        {problem.coreProblems.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                                {problem.coreProblems.map((coreProblem) => (
                                    <Badge key={coreProblem.id} variant="secondary" className="text-[11px]">
                                        {coreProblem.subject.name} &gt; {coreProblem.name}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            '-'
                        )}
                    </MetaField>

                    <MetaField
                        icon={<LinkIcon className="h-3 w-3" />}
                        label="解説動画URL"
                        className="sm:col-span-2 xl:col-span-3"
                    >
                        {safeVideoUrl ? (
                            <a
                                href={safeVideoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all text-blue-600 underline underline-offset-2"
                            >
                                {problem.videoUrl}
                            </a>
                        ) : problem.videoUrl ? (
                            <span className="break-all">{problem.videoUrl}</span>
                        ) : (
                            '-'
                        )}
                    </MetaField>
                </div>
            </div>
        </div>
    );
}

export function ProblemEditor({ coreProblemId, editHrefBuilder }: ProblemEditorProps) {
    const [problems, setProblems] = useState<ProblemEditorProblem[]>([]);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const requestIdRef = useRef(0);

    useEffect(() => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        setErrorMessage('');
        setProblems([]);
        setLoading(true);

        const fetchProblems = async () => {
            try {
                const res = await getProblemsByCoreProblem(coreProblemId);
                if (requestIdRef.current !== requestId) {
                    return;
                }

                if (res.success && res.problems) {
                    setProblems(res.problems);
                    return;
                }

                setErrorMessage(res.error ?? '問題の取得に失敗しました。');
                setProblems([]);
            } catch {
                if (requestIdRef.current !== requestId) {
                    return;
                }

                setErrorMessage('問題の取得に失敗しました。');
                setProblems([]);
            } finally {
                if (requestIdRef.current === requestId) {
                    setLoading(false);
                }
            }
        };

        void fetchProblems();
    }, [coreProblemId]);

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Header */}
            <div className="sticky top-0 z-10 flex flex-col items-start justify-between gap-2 border-b bg-card p-2 px-4 sm:flex-row sm:items-center">
                <h3 className="text-sm font-semibold">問題一覧 ({problems.length})</h3>
                {!editHrefBuilder ? (
                    <div className="rounded border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-muted-foreground text-yellow-700">
                        ※ここでの編集はできません。「問題管理」を使用してください
                    </div>
                ) : null}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto pb-4">
                {errorMessage ? (
                    <div className="p-8 text-center text-sm text-red-600">
                        {errorMessage}
                    </div>
                ) : loading ? (
                    <div className="p-4 text-muted-foreground text-sm">読み込み中...</div>
                ) : problems.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        問題がありません。
                    </div>
                ) : (
                    problems.map((problem) => (
                        <ProblemItem
                            key={problem.id}
                            problem={problem}
                            editHref={editHrefBuilder?.(problem.id)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
