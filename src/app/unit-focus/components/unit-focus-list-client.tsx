"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Unlock, PlayCircle, BookOpen } from "lucide-react";
import { getSubjectConfig } from "@/lib/subject-config";
import type { LectureVideo } from "@/lib/lecture-videos";

interface CoreProblemData {
    id: string;
    name: string;
    lectureVideos: LectureVideo[];
    isUnlocked: boolean;
}

interface SubjectData {
    id: string;
    name: string;
    coreProblems: CoreProblemData[];
}

interface UnitFocusListClientProps {
    subjects: SubjectData[];
}

export function UnitFocusListClient({ subjects }: UnitFocusListClientProps) {
    // Default to the first subject if available
    const initialSubjectId = subjects.length > 0 ? subjects[0].id : "";

    return (
        <div className="w-full">
            <Tabs defaultValue={initialSubjectId} className="w-full space-y-6">
                <TabsList className="w-full flex justify-start h-auto flex-wrap gap-2 bg-transparent p-0">
                    {subjects.map((subject) => {
                        // 共通モジュールから色を取得
                        const config = getSubjectConfig(subject.name);
                        const colorClass = config.bgColor;

                        return (
                            <TabsTrigger
                                key={subject.id}
                                value={subject.id}
                                className="px-6 py-3 text-base data-[state=active]:bg-background border border-transparent data-[state=active]:border-border rounded-md transition-all gap-2"
                            >
                                <span className={`flex items-center justify-center w-6 h-6 rounded text-xs text-white font-bold ${colorClass}`}>
                                    {subject.name.charAt(0)}
                                </span>
                                {subject.name}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>

                {subjects.map((subject) => (
                    <TabsContent key={subject.id} value={subject.id} className="mt-0 focus-visible:outline-none focus-visible:ring-0">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animation-fade-in">
                            {subject.coreProblems.map((coreProblem) => {
                                const isUnlocked = coreProblem.isUnlocked;

                                return (
                                    <Link
                                        key={coreProblem.id}
                                        href={`/unit-focus/${coreProblem.id}`}
                                        className={`group block h-full transition-all duration-200 ${!isUnlocked ? 'opacity-70' : 'hover:-translate-y-1'}`}
                                    >
                                        <Card className={`h-full border-l-4 overflow-hidden transition-shadow ${isUnlocked ? 'border-l-green-500' : 'border-l-border bg-muted/30'}`}>
                                            <CardHeader className="pb-3">
                                                <div className="flex justify-between items-start gap-2">
                                                    <Badge variant={isUnlocked ? "secondary" : "outline"} className="mb-2">
                                                        {isUnlocked ? "学習可能" : "ロック中"}
                                                    </Badge>
                                                    {isUnlocked ? (
                                                        <Unlock className="w-5 h-5 text-green-500" />
                                                    ) : (
                                                        <Lock className="w-5 h-5 text-muted-foreground" />
                                                    )}
                                                </div>
                                                <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors">
                                                    {coreProblem.name}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                                    {coreProblem.lectureVideos.length > 0 ? (
                                                        <div className="flex items-center gap-1 text-blue-600">
                                                            <PlayCircle className="w-4 h-4" />
                                                            <span>動画あり</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1">
                                                            <BookOpen className="w-4 h-4" />
                                                            <span>演習のみ</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                );
                            })}
                        </div>
                        {subject.coreProblems.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                                この科目の単元はまだ登録されていません。
                            </div>
                        )}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
