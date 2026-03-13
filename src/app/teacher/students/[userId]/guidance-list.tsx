'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GuidanceRecord } from '@prisma/client';
import {
    Calendar,
    Loader2,
    MessageSquare,
    Mic,
    Pause,
    Play,
    Plus,
    SquarePen,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { addGuidanceRecord, deleteGuidanceRecord } from './actions';
import { DateDisplay } from '@/components/ui/date-display';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
    getGuidanceAudioFileExtension,
    GuidanceRecordingFormat,
    isSupportedGuidanceAudioMimeType,
    normalizeGuidanceAudioMimeType,
    pickGuidanceRecordingFormat,
} from '@/lib/guidance-recording';

interface GuidanceListProps {
    userId: string;
    records: (GuidanceRecord & { teacher: { name: string | null } })[];
}

const MAX_RECORDING_MS = 60 * 60 * 1000;

type RecordingSessionState = {
    startedAtMs: number;
    accumulatedPausedMs: number;
    pausedAtMs: number | null;
};

function formatElapsedTime(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const hours = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSec % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

export function GuidanceList({ userId, records }: GuidanceListProps) {
    const router = useRouter();

    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'paused' | 'summarizing'>('idle');
    const [elapsedMs, setElapsedMs] = useState(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sessionRef = useRef<RecordingSessionState | null>(null);
    const recordingFormatRef = useRef<GuidanceRecordingFormat | null>(null);

    const supportedRecordingFormat = useMemo<GuidanceRecordingFormat | null>(() => {
        if (typeof window === 'undefined') return null;
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
        if (typeof MediaRecorder === 'undefined') return null;
        if (typeof MediaRecorder.isTypeSupported !== 'function') return null;
        return pickGuidanceRecordingFormat((mimeType) => MediaRecorder.isTypeSupported(mimeType));
    }, []);

    function getCurrentElapsedMs(): number {
        if (!sessionRef.current) return 0;

        const now = Date.now();
        const baseElapsed = now - sessionRef.current.startedAtMs - sessionRef.current.accumulatedPausedMs;
        if (sessionRef.current.pausedAtMs) {
            return Math.max(0, baseElapsed - (now - sessionRef.current.pausedAtMs));
        }
        return Math.max(0, baseElapsed);
    }

    function clearTimer() {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }

    function cleanupMediaResources() {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        mediaRecorderRef.current = null;
        recordingFormatRef.current = null;
        sessionRef.current = null;
        chunksRef.current = [];
    }

    async function handleAdd(formData: FormData) {
        setIsSaving(true);
        const result = await addGuidanceRecord(userId, formData);
        setIsSaving(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('記録を追加しました');
            setIsAdding(false);
            router.refresh();
        }
    }

    async function handleDelete(recordId: string) {
        if (!confirm('本当に削除しますか？')) return;

        const result = await deleteGuidanceRecord(recordId, userId);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('記録を削除しました');
            router.refresh();
        }
    }

    async function startRecording() {
        const preferredFormat = supportedRecordingFormat || null;
        if (!preferredFormat) {
            setIsAdding(true);
            toast.error('このブラウザでは録音に対応していません。手動入力をご利用ください。');
            return;
        }

        if (recordingStatus !== 'idle') {
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            const recorder = new MediaRecorder(stream, { mimeType: preferredFormat.mediaRecorderMimeType });
            const actualMimeType = normalizeGuidanceAudioMimeType(recorder.mimeType);
            const uploadMimeType = isSupportedGuidanceAudioMimeType(actualMimeType)
                ? actualMimeType
                : preferredFormat.uploadMimeType;

            chunksRef.current = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.start(1000);
            mediaRecorderRef.current = recorder;
            streamRef.current = stream;
            recordingFormatRef.current = {
                mediaRecorderMimeType: recorder.mimeType || preferredFormat.mediaRecorderMimeType,
                uploadMimeType,
                fileExtension: getGuidanceAudioFileExtension(uploadMimeType),
            };
            sessionRef.current = {
                startedAtMs: Date.now(),
                accumulatedPausedMs: 0,
                pausedAtMs: null,
            };
            setElapsedMs(0);
            setRecordingStatus('recording');
        } catch (error) {
            console.error('[guidance-list] startRecording failed:', error);
            cleanupMediaResources();
            setRecordingStatus('idle');
            setIsAdding(true);
            toast.error('マイクの利用に失敗しました。権限設定をご確認ください。');
        }
    }

    function togglePauseResumeRecording() {
        const recorder = mediaRecorderRef.current;
        if (!recorder || !sessionRef.current) {
            return;
        }

        if (recordingStatus === 'recording') {
            try {
                recorder.pause();
                sessionRef.current.pausedAtMs = Date.now();
                setRecordingStatus('paused');
            } catch (error) {
                console.error('[guidance-list] pause failed:', error);
                toast.error('録音の一時停止に失敗しました');
            }
            return;
        }

        if (recordingStatus === 'paused') {
            try {
                if (sessionRef.current.pausedAtMs) {
                    sessionRef.current.accumulatedPausedMs += Date.now() - sessionRef.current.pausedAtMs;
                    sessionRef.current.pausedAtMs = null;
                }
                recorder.resume();
                setRecordingStatus('recording');
            } catch (error) {
                console.error('[guidance-list] resume failed:', error);
                toast.error('録音の再開に失敗しました');
            }
        }
    }

    async function stopRecorderAndCollectBlob(): Promise<Blob> {
        const recorder = mediaRecorderRef.current;
        if (!recorder) {
            throw new Error('recorder not found');
        }

        return new Promise<Blob>((resolve, reject) => {
            recorder.onerror = () => {
                reject(new Error('recording error'));
            };

            recorder.onstop = () => {
                const uploadMimeType = recordingFormatRef.current?.uploadMimeType ?? 'audio/webm';
                const blob = new Blob(chunksRef.current, { type: uploadMimeType });
                resolve(blob);
            };

            if (recorder.state !== 'inactive') {
                recorder.requestData();
                recorder.stop();
            } else {
                const uploadMimeType = recordingFormatRef.current?.uploadMimeType ?? 'audio/webm';
                const blob = new Blob(chunksRef.current, { type: uploadMimeType });
                resolve(blob);
            }
        });
    }

    async function stopAndSummarize(forceByLimit = false) {
        if (recordingStatus === 'idle' || recordingStatus === 'summarizing') {
            return;
        }

        const session = sessionRef.current;
        if (!session) {
            toast.error('録音状態の取得に失敗しました');
            cleanupMediaResources();
            setRecordingStatus('idle');
            return;
        }

        const endedAtMs = Date.now();

        // 一時停止中に終了した場合も、停止時間を計測に反映する。
        if (session.pausedAtMs) {
            session.accumulatedPausedMs += endedAtMs - session.pausedAtMs;
            session.pausedAtMs = null;
        }

        setRecordingStatus('summarizing');
        clearTimer();

        try {
            const blob = await stopRecorderAndCollectBlob();
            if (blob.size === 0) {
                throw new Error('empty audio blob');
            }

            const recordingFormat = recordingFormatRef.current;
            if (!recordingFormat) {
                throw new Error('recording format not found');
            }

            const file = new File(
                [blob],
                `guidance-${Date.now()}.${recordingFormat.fileExtension}`,
                { type: recordingFormat.uploadMimeType },
            );
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';

            const formData = new FormData();
            formData.append('audio', file);
            formData.append('startedAtIso', new Date(session.startedAtMs).toISOString());
            formData.append('endedAtIso', new Date(endedAtMs).toISOString());
            formData.append('timeZone', timeZone);

            const response = await fetch(`/api/teacher/students/${userId}/guidance-summary`, {
                method: 'POST',
                body: formData,
            });
            const payload = (await response.json()) as { success?: boolean; error?: string };

            if (!response.ok || !payload.success) {
                throw new Error(payload.error || 'AI要約に失敗しました');
            }

            toast.success(forceByLimit ? '録音上限に到達したため要約を保存しました' : 'AI要約を保存しました');
            router.refresh();
            setIsAdding(false);
            setElapsedMs(0);
            setRecordingStatus('idle');
        } catch (error) {
            console.error('[guidance-list] summarize failed:', error);
            toast.error('AI要約に失敗しました。手動入力フォームを開きます。');
            setIsAdding(true);
            setRecordingStatus('idle');
        } finally {
            cleanupMediaResources();
        }
    }

    useEffect(() => {
        clearTimer();

        if (recordingStatus === 'recording' || recordingStatus === 'paused') {
            timerRef.current = setInterval(() => {
                const nextElapsed = getCurrentElapsedMs();
                setElapsedMs(nextElapsed);

                if (nextElapsed >= MAX_RECORDING_MS) {
                    clearTimer();
                    void stopAndSummarize(true);
                }
            }, 500);
        }

        return () => {
            clearTimer();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recordingStatus]);

    useEffect(() => {
        return () => {
            clearTimer();
            try {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                    mediaRecorderRef.current.stop();
                }
            } catch {
                // no-op
            }
            cleanupMediaResources();
        };
    }, []);

    return (
        <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        面談・指導記録
                    </CardTitle>
                    <CardDescription>生徒との面談や指導の記録</CardDescription>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="icon"
                        variant="outline"
                        aria-label="新規記録"
                        title="新規記録"
                        onClick={() => setIsAdding((prev) => !prev)}
                        disabled={recordingStatus === 'summarizing'}
                    >
                        <span className="relative block h-4 w-4">
                            <Plus className="h-4 w-4" />
                            <SquarePen className="absolute -right-1 -bottom-1 h-3 w-3" />
                        </span>
                    </Button>

                    <Button
                        size="icon"
                        variant={recordingStatus === 'idle' ? 'outline' : 'default'}
                        aria-label="録音開始"
                        title={supportedRecordingFormat ? '録音開始' : 'このブラウザでは録音を利用できません'}
                        onClick={() => void startRecording()}
                        disabled={recordingStatus !== 'idle'}
                    >
                        <Mic className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-4">
                {!supportedRecordingFormat ? (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                        このブラウザでは録音に対応していません。右上の新規記録から手動入力するか、録音対応ブラウザをご利用ください。
                    </div>
                ) : null}

                {recordingStatus !== 'idle' ? (
                    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium">
                                {recordingStatus === 'summarizing'
                                    ? 'AI要約を生成中...'
                                    : recordingStatus === 'paused'
                                        ? '録音一時停止中'
                                        : '録音中'}
                            </div>
                            <div className="font-mono text-sm">{formatElapsedTime(elapsedMs)}</div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {recordingStatus === 'recording' || recordingStatus === 'paused' ? (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    aria-label={recordingStatus === 'recording' ? '一時停止' : '再開'}
                                    title={recordingStatus === 'recording' ? '一時停止' : '再開'}
                                    onClick={togglePauseResumeRecording}
                                >
                                    {recordingStatus === 'recording' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                </Button>
                            ) : null}

                            <Button
                                type="button"
                                onClick={() => void stopAndSummarize(false)}
                                disabled={recordingStatus === 'summarizing'}
                            >
                                {recordingStatus === 'summarizing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                終了→AI要約
                            </Button>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            録音上限は60分です。上限到達時は自動で録音を終了して要約します。
                        </p>
                    </div>
                ) : null}

                {isAdding && (
                    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                        <form action={handleAdd} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">日付</label>
                                    <Input
                                        type="date"
                                        name="date"
                                        required
                                        defaultValue={new Date().toISOString().split('T')[0]}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">種類</label>
                                    <Select name="type" defaultValue="GUIDANCE">
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="INTERVIEW">面談</SelectItem>
                                            <SelectItem value="GUIDANCE">指導</SelectItem>
                                            <SelectItem value="OTHER">その他</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">内容</label>
                                <Textarea
                                    name="content"
                                    required
                                    placeholder="指導内容や面談の記録を入力..."
                                    className="min-h-[100px]"
                                />
                            </div>
                            <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                                <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-10" onClick={() => setIsAdding(false)}>
                                    キャンセル
                                </Button>
                                <Button type="submit" size="sm" className="min-h-11 sm:min-h-10" disabled={isSaving}>
                                    {isSaving ? '保存中...' : '保存'}
                                </Button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="space-y-4">
                    {records.length > 0 ? (
                        records.map((record) => (
                            <div key={record.id} className="flex flex-col space-y-2 border-b pb-4 last:border-0">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full border ${record.type === 'INTERVIEW' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            record.type === 'GUIDANCE' ? 'bg-green-50 text-green-700 border-green-200' :
                                                'bg-gray-50 text-gray-700 border-gray-200'
                                            }`}>
                                            {record.type === 'INTERVIEW' ? '面談' :
                                                record.type === 'GUIDANCE' ? '指導' : 'その他'}
                                        </span>
                                        <span className="text-sm font-medium flex items-center gap-1 text-muted-foreground">
                                            <Calendar className="h-3 w-3" />
                                            <DateDisplay date={record.date} />
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            記入者: {record.teacher.name || '不明'}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                            onClick={() => void handleDelete(record.id)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="whitespace-pre-wrap pl-1 text-sm">
                                    {record.content}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            記録はまだありません
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
