'use client';

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { updateSystemSettings, SettingsData } from "./actions";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
    priorityInitial: z.coerce.number().int(),
    priorityAdjustmentA: z.coerce.number().int(),
    priorityAdjustmentB: z.coerce.number().int(),
    priorityAdjustmentC: z.coerce.number().int(),
    priorityAdjustmentD: z.coerce.number().int(),
    forgettingCurveRate: z.coerce.number(),
    aiGradingEnabled: z.boolean(),
});

interface SettingsFormProps {
    initialSettings: SettingsData;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
    const [isPending, startTransition] = useTransition();

    const form = useForm<SettingsData>({
        resolver: zodResolver(formSchema),
        defaultValues: initialSettings,
    });

    const onSubmit = (data: SettingsData) => {
        startTransition(async () => {
            const result = await updateSystemSettings(data);
            if (result.success) {
                toast.success("設定を保存しました");
            } else {
                toast.error("エラーが発生しました", { description: result.error });
            }
        });
    };

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>優先度アルゴリズム設定</CardTitle>
                    <CardDescription>
                        学習者の理解度に応じた優先度調整のパラメータを設定します。
                        値が大きいほど優先度が高くなり、出題されやすくなります。
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="priorityInitial">初期優先度</Label>
                        <Input id="priorityInitial" type="number" {...form.register("priorityInitial")} />
                        <p className="text-xs text-muted-foreground">新規問題のデフォルト優先度</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="forgettingCurveRate">忘却曲線係数 (1日あたり)</Label>
                        <Input id="forgettingCurveRate" type="number" step="0.1" {...form.register("forgettingCurveRate")} />
                        <p className="text-xs text-muted-foreground">1日経過するごとに加算される優先度</p>
                    </div>

                    <div className="col-span-2 grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div className="space-y-2">
                            <Label htmlFor="priorityAdjustmentA">評価 A (完璧)</Label>
                            <Input id="priorityAdjustmentA" type="number" {...form.register("priorityAdjustmentA")} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="priorityAdjustmentB">評価 B (できた)</Label>
                            <Input id="priorityAdjustmentB" type="number" {...form.register("priorityAdjustmentB")} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="priorityAdjustmentC">評価 C (不安)</Label>
                            <Input id="priorityAdjustmentC" type="number" {...form.register("priorityAdjustmentC")} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="priorityAdjustmentD">評価 D (わからん)</Label>
                            <Input id="priorityAdjustmentD" type="number" {...form.register("priorityAdjustmentD")} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>機能設定</CardTitle>
                    <CardDescription>
                        システムの機能の有効/無効を切り替えます。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between space-x-2">
                        <div className="space-y-0.5">
                            <Label htmlFor="aiGradingEnabled">AI採点機能</Label>
                            <p className="text-sm text-muted-foreground">
                                記述式問題のAIによる自動採点を有効にします。
                            </p>
                        </div>
                        <Switch
                            id="aiGradingEnabled"
                            checked={form.watch("aiGradingEnabled")}
                            onCheckedChange={(checked) => form.setValue("aiGradingEnabled", checked)}
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button type="submit" disabled={isPending}>
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    設定を保存
                </Button>
            </div>
        </form>
    );
}
