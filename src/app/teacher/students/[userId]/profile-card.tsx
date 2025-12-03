'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Calendar, MapPin, School, Phone, Mail, Users } from 'lucide-react';
import { updateStudentProfile } from './actions';
import { toast } from 'sonner';

interface Classroom {
    id: string;
    name: string;
}

interface Group {
    id: string;
    name: string;
}

interface ProfileCardProps {
    userId: string;
    initialBio: string | null;
    initialNotes: string | null;
    initialBirthday: Date | null;
    initialClassroomId: string | null;
    initialGroupId: string | null;
    initialSchool: string | null;
    initialPhoneNumber: string | null;
    initialEmail: string | null;
    classrooms: Classroom[];
    groups: Group[];
}

export function ProfileCard({
    userId,
    initialBio,
    initialNotes,
    initialBirthday,
    initialClassroomId,
    initialGroupId,
    initialSchool,
    initialPhoneNumber,
    initialEmail,
    classrooms,
    groups
}: ProfileCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    async function handleSubmit(formData: FormData) {
        setIsSaving(true);
        const result = await updateStudentProfile(userId, formData);
        setIsSaving(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('プロフィールを更新しました');
            setIsEditing(false);
        }
    }

    const currentClassroomName = classrooms.find(c => c.id === initialClassroomId)?.name || '未設定';
    const currentGroupName = groups.find(g => g.id === initialGroupId)?.name || '未設定';

    if (isEditing) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        プロフィール編集
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form action={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">生年月日</label>
                                <Input
                                    type="date"
                                    name="birthday"
                                    defaultValue={initialBirthday ? new Date(initialBirthday).toISOString().split('T')[0] : ''}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">教室</label>
                                <Select name="classroomId" defaultValue={initialClassroomId || ''}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="教室を選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unselected">未設定</SelectItem>
                                        {classrooms.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">グループ</label>
                                <Select name="groupId" defaultValue={initialGroupId || ''}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="グループを選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unselected">未設定</SelectItem>
                                        {groups.map((g) => (
                                            <SelectItem key={g.id} value={g.id}>
                                                {g.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">学校</label>
                                <Input
                                    name="school"
                                    defaultValue={initialSchool || ''}
                                    placeholder="例: 〇〇中学校"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">電話番号</label>
                                <Input
                                    name="phoneNumber"
                                    defaultValue={initialPhoneNumber || ''}
                                    placeholder="例: 090-1234-5678"
                                />
                            </div>
                            <div className="space-y-2 col-span-2">
                                <label className="text-sm font-medium">メールアドレス</label>
                                <Input
                                    name="email"
                                    type="email"
                                    defaultValue={initialEmail || ''}
                                    placeholder="例: student@example.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">生徒プロフィール (部活、志望校など)</label>
                            <Textarea
                                name="bio"
                                defaultValue={initialBio || ''}
                                placeholder="例: サッカー部、〇〇高校志望"
                                className="min-h-[100px]"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">講師用メモ (性格、特記事項など)</label>
                            <Textarea
                                name="notes"
                                defaultValue={initialNotes || ''}
                                placeholder="例: 英語が苦手、計算ミスが多い"
                                className="min-h-[100px]"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                                キャンセル
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? '保存中...' : '保存'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        プロフィール & メモ
                    </CardTitle>
                    <CardDescription>生徒の情報と講師用メモ</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    編集
                </Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">生年月日:</span>
                        <span>{initialBirthday ? new Date(initialBirthday).toLocaleDateString() : '未設定'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">教室:</span>
                        <span>{currentClassroomName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">グループ:</span>
                        <span>{currentGroupName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <School className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">学校:</span>
                        <span>{initialSchool || '未設定'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">電話:</span>
                        <span>{initialPhoneNumber || '未設定'}</span>
                    </div>
                    <div className="flex items-center gap-2 col-span-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Email:</span>
                        <span>{initialEmail || '未設定'}</span>
                    </div>
                </div>

                <div className="space-y-1">
                    <h4 className="text-sm font-medium text-muted-foreground">生徒プロフィール</h4>
                    <div className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md min-h-[60px]">
                        {initialBio || '未設定'}
                    </div>
                </div>
                <div className="space-y-1">
                    <h4 className="text-sm font-medium text-muted-foreground">講師用メモ</h4>
                    <div className="text-sm whitespace-pre-wrap bg-yellow-50/50 p-3 rounded-md min-h-[60px] border border-yellow-100">
                        {initialNotes || '未設定'}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
