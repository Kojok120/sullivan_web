'use client';

import { CalendarClock, PencilLine, Plus, Save, Sparkles, Trash2 } from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SimpleCalendar } from '@/components/ui/simple-calendar';
import { TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { DraftGranularity } from '@/lib/types/student-goal';

import {
    formatDateKeyLabel,
    getGoalTypeLabel,
    getRemainingDays,
    type EditableGoal,
    type SubjectOption,
} from './goal-view-utils';

type GoalDefinitionTabProps = {
    goals: EditableGoal[];
    subjects: SubjectOption[];
    timeZone: string;
    todayKey: string;
    calendarOpenByGoalId: Record<string, boolean>;
    savingAll: boolean;
    onAddProblemGoal: () => void;
    onAddCustomGoal: () => void;
    onSaveGoals: () => void;
    onToggleCalendar: (goalId: string) => void;
    onUpdateGoal: (goalId: string, updater: (goal: EditableGoal) => EditableGoal) => void;
    onRenameGoal: (goalId: string) => void;
    onDeleteGoal: (goalId: string) => void;
    onGenerateDraft: (goal: EditableGoal) => void;
};

export function GoalDefinitionTab(props: GoalDefinitionTabProps) {
    const {
        goals,
        subjects,
        timeZone,
        todayKey,
        calendarOpenByGoalId,
        savingAll,
        onAddProblemGoal,
        onAddCustomGoal,
        onSaveGoals,
        onToggleCalendar,
        onUpdateGoal,
        onRenameGoal,
        onDeleteGoal,
        onGenerateDraft,
    } = props;

    return (
        <TabsContent value="definition" className="space-y-4">
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-base">目標一覧（期限・目標値・AI下書き）</CardTitle>
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={onAddProblemGoal}>
                                <Plus className="mr-1 h-4 w-4" />
                                問題数目標を追加
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={onAddCustomGoal}>
                                <Plus className="mr-1 h-4 w-4" />
                                任意目標を追加
                            </Button>
                            <Button type="button" size="sm" onClick={onSaveGoals} disabled={savingAll}>
                                <Save className="mr-1 h-4 w-4" />
                                {savingAll ? '保存中...' : '目標を保存'}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {goals.length === 0 ? (
                        <p className="rounded-lg border border-dashed px-3 py-8 text-sm text-muted-foreground">有効な目標はありません</p>
                    ) : (
                        <Accordion type="multiple" className="rounded-lg border">
                            {goals.map((goal) => {
                                const remainingDays = getRemainingDays(todayKey, goal.dueDateKey);

                                return (
                                    <AccordionItem key={goal.id} value={goal.id} className="px-4">
                                        <AccordionTrigger className="hover:no-underline">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="truncate text-sm font-semibold">{goal.name}</span>
                                                    <Badge variant="outline" className="text-[11px]">{getGoalTypeLabel(goal.type)}</Badge>
                                                    <Badge variant="outline" className="text-[11px]">{formatDateKeyLabel(goal.dueDateKey, timeZone)}まで</Badge>
                                                    <Badge variant="secondary" className="text-[11px]">残り{Math.max(0, remainingDays)}日</Badge>
                                                    {!goal.persisted ? <Badge className="text-[11px]" variant="secondary">未保存</Badge> : null}
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="space-y-4 pb-5">
                                            <div className="grid gap-3 xl:grid-cols-12">
                                                <div className="space-y-1.5 xl:col-span-5">
                                                    <label className="text-xs text-muted-foreground">目標名</label>
                                                    <Input
                                                        value={goal.name}
                                                        onChange={(event) => {
                                                            const nextName = event.target.value;
                                                            onUpdateGoal(goal.id, (current) => ({ ...current, name: nextName }));
                                                        }}
                                                    />
                                                </div>

                                                <div className="space-y-1.5 xl:col-span-3">
                                                    <label className="text-xs text-muted-foreground">期限</label>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="w-full justify-start"
                                                        onClick={() => onToggleCalendar(goal.id)}
                                                    >
                                                        <CalendarClock className="mr-2 h-4 w-4" />
                                                        {formatDateKeyLabel(goal.dueDateKey, timeZone)}
                                                    </Button>
                                                    {calendarOpenByGoalId[goal.id] ? (
                                                        <SimpleCalendar
                                                            value={goal.dueDateKey}
                                                            minDateKey={todayKey}
                                                            onChange={(nextDateKey) => {
                                                                onUpdateGoal(goal.id, (current) => ({ ...current, dueDateKey: nextDateKey }));
                                                            }}
                                                        />
                                                    ) : null}
                                                </div>

                                                <div className="space-y-1.5 xl:col-span-2">
                                                    <label className="text-xs text-muted-foreground">種別</label>
                                                    <Input value={getGoalTypeLabel(goal.type)} disabled />
                                                </div>

                                                <div className="flex items-end gap-2 xl:col-span-2">
                                                    {goal.persisted ? (
                                                        <Button type="button" variant="outline" size="sm" onClick={() => onRenameGoal(goal.id)}>
                                                            <PencilLine className="mr-1 h-4 w-4" />
                                                            改名を即時反映
                                                        </Button>
                                                    ) : null}
                                                    <Button type="button" variant="destructive" size="sm" onClick={() => onDeleteGoal(goal.id)}>
                                                        <Trash2 className="mr-1 h-4 w-4" />
                                                        削除
                                                    </Button>
                                                </div>
                                            </div>

                                            {goal.type === 'PROBLEM_COUNT' ? (
                                                <div className="grid gap-3 lg:grid-cols-2">
                                                    <div className="space-y-1.5">
                                                        <label className="text-xs text-muted-foreground">科目</label>
                                                        <Select
                                                            value={goal.subjectId ?? ''}
                                                            onValueChange={(value) => {
                                                                const selectedSubject = subjects.find((subject) => subject.id === value);
                                                                onUpdateGoal(goal.id, (current) => ({
                                                                    ...current,
                                                                    subjectId: value,
                                                                    subjectName: selectedSubject?.name ?? null,
                                                                    name: selectedSubject ? `${selectedSubject.name}の問題数` : current.name,
                                                                }));
                                                            }}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="科目を選択" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {subjects.map((subject) => (
                                                                    <SelectItem key={subject.id} value={subject.id}>
                                                                        {subject.name}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <label className="text-xs text-muted-foreground">期限までの目安問題数</label>
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={goal.periodTargetCount ?? ''}
                                                            onChange={(event) => {
                                                                const raw = event.target.value;
                                                                onUpdateGoal(goal.id, (current) => ({
                                                                    ...current,
                                                                    periodTargetCount: raw.trim().length === 0 ? null : Math.max(0, Math.floor(Number(raw))),
                                                                }));
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    <label className="text-xs text-muted-foreground">期限までの目標内容</label>
                                                    <Textarea
                                                        value={goal.periodTargetText}
                                                        onChange={(event) => {
                                                            const nextText = event.target.value;
                                                            onUpdateGoal(goal.id, (current) => ({
                                                                ...current,
                                                                periodTargetText: nextText,
                                                            }));
                                                        }}
                                                    />
                                                </div>
                                            )}

                                            <div className="rounded-lg border border-border/70 bg-muted/25 p-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge variant="outline">AI下書き</Badge>
                                                    <Select
                                                        value={goal.draftGranularity}
                                                        onValueChange={(value) => {
                                                            onUpdateGoal(goal.id, (current) => ({
                                                                ...current,
                                                                draftGranularity: value as DraftGranularity,
                                                            }));
                                                        }}
                                                    >
                                                        <SelectTrigger className="w-[190px]">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="HALF">半分</SelectItem>
                                                            <SelectItem value="WEEKLY">1週間ごと</SelectItem>
                                                            <SelectItem value="DAILY">毎日</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Button type="button" size="sm" onClick={() => onGenerateDraft(goal)}>
                                                        <Sparkles className="mr-1 h-4 w-4" />
                                                        下書き生成
                                                    </Button>
                                                </div>
                                                <p className="mt-2 text-xs text-muted-foreground">
                                                    下書きは未保存です。比較ダイアログで適用後に「目標を保存」を押してください。
                                                </p>
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
    );
}
