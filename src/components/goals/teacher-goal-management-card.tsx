'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { GoalDailyViewPayload } from '@/lib/types/student-goal';

import { GoalDailyTab } from './goal-daily-tab';
import { GoalDefinitionTab } from './goal-definition-tab';
import { GoalDraftDialog } from './goal-draft-dialog';
import { MAX_ACTIVE_GOALS, type SubjectOption } from './goal-view-utils';
import { useGoalManagement } from './use-goal-management';

type TeacherGoalManagementCardProps = {
    studentId: string;
    subjects: SubjectOption[];
    initialData: GoalDailyViewPayload;
};

export function TeacherGoalManagementCard({ studentId, subjects, initialData }: TeacherGoalManagementCardProps) {
    const state = useGoalManagement({
        studentId,
        subjects,
        initialData,
    });

    return (
        <div className="space-y-4">
            <Card className="border-primary/30 bg-gradient-to-r from-primary/[0.08] to-background">
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <CardTitle className="text-base">目標管理ダッシュボード</CardTitle>
                            <p className="mt-1 text-xs text-muted-foreground">目標設計と日次編集を分けて操作できます</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline">TZ: {state.timeZone}</Badge>
                            <Badge variant="outline">有効目標 {state.goals.length}/{MAX_ACTIVE_GOALS}</Badge>
                            <Badge variant="outline">今日 {state.todayEntries.length}件</Badge>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {state.todayEntries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">今日の目標は未設定です</p>
                    ) : (
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {state.todayEntries.map((entry) => (
                                <div key={`${entry.goalId}-${entry.dueDateKey}`} className="rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm">
                                    <p className="font-semibold">{entry.subjectName || entry.goalName}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {entry.targetCount !== null ? `${entry.targetCount}問` : '-'}
                                        {entry.targetText ? ` / ${entry.targetText}` : ''}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                    {state.refreshing ? <p className="mt-2 text-xs text-muted-foreground">ブラウザTZに同期中...</p> : null}
                </CardContent>
            </Card>

            <Tabs value={state.goalTabValue} onValueChange={(value) => state.setGoalTabValue(value as 'definition' | 'daily')} className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="definition">1. 目標設計</TabsTrigger>
                    <TabsTrigger value="daily">2. 日次編集</TabsTrigger>
                </TabsList>

                <GoalDefinitionTab
                    goals={state.goals}
                    subjects={subjects}
                    timeZone={state.timeZone}
                    todayKey={state.data.todayKey}
                    calendarOpenByGoalId={state.calendarOpenByGoalId}
                    savingAll={state.savingAll}
                    onAddProblemGoal={() => state.handleAddGoal('PROBLEM_COUNT')}
                    onAddCustomGoal={() => state.handleAddGoal('CUSTOM')}
                    onSaveGoals={state.handleSaveGoals}
                    onToggleCalendar={state.toggleCalendar}
                    onUpdateGoal={state.updateGoal}
                    onRenameGoal={state.handleRenameGoal}
                    onDeleteGoal={state.handleDeleteGoal}
                    onGenerateDraft={state.handleGenerateDraft}
                />

                <GoalDailyTab
                    timeZone={state.timeZone}
                    todayKey={state.data.todayKey}
                    tomorrowKey={state.data.tomorrowKey}
                    rows={state.data.rows}
                    selectedDateKey={state.selectedDateKey}
                    selectedRelativeLabel={state.selectedRelativeLabel}
                    selectedDateEntries={state.selectedDateEntries}
                    selectedDateStats={state.selectedDateStats}
                    persistedGoals={state.persistedGoals}
                    dayDraft={state.dayDraft}
                    savingDay={state.savingDay}
                    timelineRef={state.timelineRef}
                    todayRef={state.todayRef}
                    onSelectDate={state.setSelectedDateKey}
                    onSaveDay={state.handleSaveSelectedDay}
                    onSetDayDraft={state.setDayDraft}
                    onScrollToToday={state.scrollToToday}
                />
            </Tabs>

            <GoalDraftDialog
                draftDialog={state.draftDialog}
                goals={state.goals}
                timeZone={state.timeZone}
                onChange={state.setDraftDialog}
                onApply={state.applyDraft}
            />
        </div>
    );
}
