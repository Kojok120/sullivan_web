'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Plus, Trash2, Calendar } from 'lucide-react';
import { addGuidanceRecord, deleteGuidanceRecord } from './actions';
import { toast } from 'sonner';
import { GuidanceRecord, GuidanceType } from '@prisma/client';
import { DateDisplay } from '@/components/ui/date-display';

interface GuidanceListProps {
    userId: string;
    records: (GuidanceRecord & { teacher: { name: string | null } })[];
}

export function GuidanceList({ userId, records }: GuidanceListProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    async function handleAdd(formData: FormData) {
        setIsSaving(true);
        const result = await addGuidanceRecord(userId, formData);
        setIsSaving(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('記録を追加しました');
            setIsAdding(false);
        }
    }

    async function handleDelete(recordId: string) {
        if (!confirm('本当に削除しますか？')) return;

        const result = await deleteGuidanceRecord(recordId, userId);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('記録を削除しました');
        }
    }

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
                <Button size="sm" onClick={() => setIsAdding(!isAdding)}>
                    <Plus className="h-4 w-4 mr-1" />
                    新規記録
                </Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
                {isAdding && (
                    <div className="bg-muted/30 p-4 rounded-lg border space-y-4">
                        <form action={handleAdd} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
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
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={() => setIsAdding(false)}>
                                    キャンセル
                                </Button>
                                <Button type="submit" size="sm" disabled={isSaving}>
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
                                            onClick={() => handleDelete(record.id)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="text-sm whitespace-pre-wrap pl-1">
                                    {record.content}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            記録はまだありません
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
