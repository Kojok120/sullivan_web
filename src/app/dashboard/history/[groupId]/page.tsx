
import { getSessionDetails, markSessionAsReviewed } from "@/lib/analytics";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { ArrowLeft, PlayCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoPlayerDialog } from "@/components/video-player-dialog"; // Client component we need to make

export default async function SessionDetailsPage({ params }: { params: Promise<{ groupId: string }> }) {
    const session = await getSession();
    if (!session) redirect('/login');

    const { groupId } = await params;
    // SECURITY: Pass userId to restrict access to own history only
    const details = await getSessionDetails(groupId, session.userId);
    if (!details || details.length === 0) {
        return <div>履歴が見つかりません</div>;
    }

    // Mark as reviewed (Server Side Effect)
    await markSessionAsReviewed(groupId, session.userId);

    const firstItem = details[0];
    const subjectName = firstItem.problem.coreProblems[0]?.subject.name || '教科不明';
    const date = firstItem.answeredAt.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) + ' ' + firstItem.answeredAt.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' });

    const requiredVideos = details
        .filter(d => (d.evaluation === 'C' || d.evaluation === 'D') && d.problem.videoUrl) // C/D are mapped to "destructive" badge usually, or checking !A/B
        .map(d => ({
            historyId: d.id,
            videoUrl: d.problem.videoUrl!,
            question: d.problem.question
        }));

    return (
        <div className="container mx-auto py-8 px-4 max-w-4xl">
            <div className="mb-6 flex items-center space-x-4">
                <Link href="/">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">{subjectName} 採点結果</h1>
                    <p className="text-muted-foreground text-sm">{date}</p>
                </div>
            </div>

            <div className="space-y-6">
                {details.map((item, index) => {
                    const isCorrect = item.evaluation === 'A' || item.evaluation === 'B';
                    const videoUrl = item.problem.videoUrl;

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
                                            {item.problem.answer}
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

                                {/* Video Action */}
                                {videoUrl && (
                                    <div className="flex justify-end pt-2">
                                        <VideoPlayerDialog
                                            videoUrl={videoUrl}
                                            historyId={item.id}
                                            isWatched={item.isVideoWatched}
                                            isRequired={!isCorrect}
                                            playlist={!isCorrect ? requiredVideos : undefined}
                                        />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
