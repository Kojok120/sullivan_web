import { getSessionDetails, markSessionAsReviewed } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoPlayerDialog } from "@/components/video-player-dialog";
import { LectureVideoButton } from "@/components/lecture-video-button";
import { DateDisplay } from "@/components/ui/date-display";
import fs from 'fs';
import path from 'path';
import { PhoneTutorButton } from "@/components/voice/phone-tutor-button";
import { ChatTutorButton } from "@/components/voice/chat-tutor-button";
import { checkSurveyEligibility } from "@/actions/survey";
import { SurveyModal } from "@/components/survey/SurveyModal";

type SessionDetailProps = {
    groupId: string;
    userId: string;
    isTeacherView?: boolean;
    backUrl?: string; // 戻るボタンのリンク先
};

export async function SessionDetail({
    groupId,
    userId,
    isTeacherView = false,
    backUrl = "/"
}: SessionDetailProps) {
    const details = await getSessionDetails(groupId, userId);

    if (!details || details.length === 0) {
        return <div className="text-center py-8 text-muted-foreground">履歴が見つかりません</div>;
    }

    if (!isTeacherView) {
        await markSessionAsReviewed(groupId, userId);
    }

    // Check for survey eligibility
    let showSurvey = false;
    if (!isTeacherView) {
        showSurvey = await checkSurveyEligibility(userId);
    }

    const promptPath = path.join(process.cwd(), 'src/prompts/phone-tutor.md');
    const systemPrompt = fs.readFileSync(promptPath, 'utf-8');
    const chatPromptPath = path.join(process.cwd(), 'src/prompts/chat-tutor.md');
    const chatSystemPrompt = fs.readFileSync(chatPromptPath, 'utf-8');

    const firstItem = details[0];
    const subjectName = firstItem.problem.coreProblems[0]?.subject.name || '教科不明';

    const requiredVideos = details
        .filter(d => (d.evaluation === 'C' || d.evaluation === 'D') && d.problem.videoUrl)
        .map(d => ({
            historyId: d.id,
            videoUrl: d.problem.videoUrl!,
            question: d.problem.question
        }));

    return (
        <div className="container mx-auto py-8 px-4 max-w-4xl">
            {showSurvey && <SurveyModal userId={userId} />}
            <div className="mb-6 flex items-center space-x-4">
                <Link href={backUrl}>
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">{subjectName} 採点結果</h1>
                    <p className="text-muted-foreground text-sm"><DateDisplay date={firstItem.answeredAt} showTime /></p>
                </div>
            </div>

            <div className="space-y-6">
                {details.map((item, index) => {
                    const isCorrect = item.evaluation === 'A' || item.evaluation === 'B';
                    const videoUrl = item.problem.videoUrl;

                    const coreProblem = item.problem.coreProblems[0];
                    const lectureVideos = (coreProblem?.lectureVideos as { title: string; url: string }[] | null) || [];
                    const coreProblemName = coreProblem?.name || '単元不明';

                    return (
                        <Card key={item.id} className={!isCorrect ? "border-l-4 border-l-red-500" : ""}>
                            <CardHeader className="flex flex-row items-start justify-between pb-2">
                                <div className="space-y-1">
                                    <div className="flex items-center space-x-2">
                                        <Badge variant={isCorrect ? "default" : "destructive"}>
                                            {item.evaluation}
                                        </Badge>
                                        <span className="text-sm font-bold text-muted-foreground">
                                            {item.problem.customId ? item.problem.customId : `問${index + 1}`}
                                        </span>
                                    </div>
                                    <CardTitle className="text-lg leading-relaxed pt-2 whitespace-pre-wrap">
                                        {item.problem.question}
                                    </CardTitle>
                                </div>
                                <div className="flex items-center gap-1">
                                    <ChatTutorButton
                                        problemContext={{
                                            question: item.problem.question,
                                            answer: item.problem.answer || '',
                                            userAnswer: item.userAnswer || '',
                                            explanation: item.feedback || ''
                                        }}
                                        systemPrompt={chatSystemPrompt}
                                    />
                                    <PhoneTutorButton
                                        problemContext={{
                                            question: item.problem.question,
                                            answer: item.problem.answer || '',
                                            userAnswer: item.userAnswer || '',
                                            explanation: item.feedback || ''
                                        }}
                                        systemPrompt={systemPrompt}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-md">
                                    <div>
                                        <span className="font-semibold block mb-1">あなたの解答:</span>
                                        <div className="bg-white p-2 rounded border font-handwriting text-lg text-blue-900 min-h-[40px]">
                                            {item.userAnswer}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="font-semibold block mb-1">正解:</span>
                                        <div className="bg-white p-2 rounded border text-lg min-h-[40px] text-green-700">
                                            {item.problem.answer || '（正答なし）'}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
                                    <h4 className="font-bold text-blue-800 mb-2 flex items-center">
                                        <CheckCircle className="h-4 w-4 mr-2" />
                                        AIフィードバック
                                    </h4>
                                    <p className="text-blue-900 text-sm whitespace-pre-wrap">
                                        {item.feedback}
                                    </p>
                                </div>

                                {/* Video Actions - 講義動画（左）と復習動画（右）*/}
                                <div className="flex justify-between items-center pt-2">
                                    <div>
                                        {lectureVideos.length > 0 && (
                                            <LectureVideoButton
                                                videos={lectureVideos}
                                                coreProblemName={coreProblemName}
                                            />
                                        )}
                                    </div>
                                    <div>
                                        {videoUrl && (
                                            <VideoPlayerDialog
                                                videoUrl={videoUrl}
                                                historyId={item.id}
                                                isWatched={item.isVideoWatched}
                                                isRequired={!isCorrect}
                                                playlist={!isCorrect ? requiredVideos : undefined}
                                            />
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
