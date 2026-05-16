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
import { DateDisplay } from '@/components/ui/date-display';
import { NONE_SELECTION_VALUE } from '@/lib/form-selection';
import type { ClassroomWithGroups } from '@/lib/types/classroom';
import { useTranslations } from 'next-intl';

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
    classrooms: ClassroomWithGroups[];
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
}: ProfileCardProps) {
    const t = useTranslations('TeacherProfileCard');
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [selectedClassroomId, setSelectedClassroomId] = useState<string>(initialClassroomId || NONE_SELECTION_VALUE);

    async function handleSubmit(formData: FormData) {
        setIsSaving(true);
        const result = await updateStudentProfile(userId, formData);
        setIsSaving(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success(t('updateSuccess'));
            setIsEditing(false);
        }
    }

    const currentClassroom = classrooms.find(c => c.id === initialClassroomId);
    const currentClassroomName = currentClassroom?.name || t('unset');
    const currentGroupName = initialGroupId || t('unset');

    // Get groups for the currently selected classroom in the form
    const selectedClassroom = classrooms.find(c => c.id === selectedClassroomId);
    const availableGroups = selectedClassroom?.groups || [];

    if (isEditing) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        {t('editTitle')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form action={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('birthdayLabel')}</label>
                                <Input
                                    type="date"
                                    name="birthday"
                                    defaultValue={initialBirthday ? new Date(initialBirthday).toISOString().split('T')[0] : ''}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('classroomLabel')}</label>
                                <Select
                                    name="classroomId"
                                    defaultValue={initialClassroomId || NONE_SELECTION_VALUE}
                                    onValueChange={(value) => setSelectedClassroomId(value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('classroomPlaceholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE_SELECTION_VALUE}>{t('unset')}</SelectItem>
                                        {classrooms.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('groupLabel')}</label>
                                <Select
                                    name="groupId"
                                    defaultValue={initialGroupId || NONE_SELECTION_VALUE}
                                    disabled={availableGroups.length === 0}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('groupPlaceholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE_SELECTION_VALUE}>{t('unset')}</SelectItem>
                                        {availableGroups.map((g) => (
                                            <SelectItem key={g} value={g}>
                                                {g}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('schoolLabel')}</label>
                                <Input
                                    name="school"
                                    defaultValue={initialSchool || ''}
                                    placeholder={t('schoolPlaceholder')}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('phoneLabel')}</label>
                                <Input
                                    name="phoneNumber"
                                    defaultValue={initialPhoneNumber || ''}
                                    placeholder={t('phonePlaceholder')}
                                />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <label className="text-sm font-medium">{t('emailLabel')}</label>
                                <Input
                                    name="email"
                                    type="email"
                                    defaultValue={initialEmail || ''}
                                    placeholder={t('emailPlaceholder')}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('bioLabel')}</label>
                            <Textarea
                                name="bio"
                                defaultValue={initialBio || ''}
                                placeholder={t('bioPlaceholder')}
                                className="min-h-[100px]"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('notesLabel')}</label>
                            <Textarea
                                name="notes"
                                defaultValue={initialNotes || ''}
                                placeholder={t('notesPlaceholder')}
                                className="min-h-[100px]"
                            />
                        </div>
                        <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                            <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving} className="min-h-11 sm:min-h-10">
                                {t('cancel')}
                            </Button>
                            <Button type="submit" disabled={isSaving} className="min-h-11 sm:min-h-10">
                                {isSaving ? t('saving') : t('save')}
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
                        {t('title')}
                    </CardTitle>
                    <CardDescription>{t('description')}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    {t('edit')}
                </Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 sm:gap-4">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{t('birthdayLabel')}:</span>
                        <span>{initialBirthday ? <DateDisplay date={initialBirthday} /> : t('unset')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{t('classroomLabel')}:</span>
                        <span>{currentClassroomName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{t('groupLabel')}:</span>
                        <span>{currentGroupName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <School className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{t('schoolLabel')}:</span>
                        <span>{initialSchool || t('unset')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{t('phoneDisplayLabel')}</span>
                        <span>{initialPhoneNumber || t('unset')}</span>
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{t('emailDisplayLabel')}</span>
                        <span>{initialEmail || t('unset')}</span>
                    </div>
                </div>

                <div className="space-y-1">
                    <h4 className="text-sm font-medium text-muted-foreground">{t('bioDisplayLabel')}</h4>
                    <div className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md min-h-[60px]">
                        {initialBio || t('unset')}
                    </div>
                </div>
                <div className="space-y-1">
                    <h4 className="text-sm font-medium text-muted-foreground">{t('notesDisplayLabel')}</h4>
                    <div className="text-sm whitespace-pre-wrap bg-yellow-50/50 p-3 rounded-md min-h-[60px] border border-yellow-100">
                        {initialNotes || t('unset')}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
