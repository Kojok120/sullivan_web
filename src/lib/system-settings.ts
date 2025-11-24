import { prisma } from "@/lib/prisma";
import { PriorityConfig, DEFAULT_CONFIG } from "./priority-config";

import { SystemSettings } from "@prisma/client";

export function toPriorityConfig(settings: SystemSettings | null): PriorityConfig {
    if (!settings) {
        return DEFAULT_CONFIG;
    }
    return {
        priorityAdjustmentA: settings.priorityAdjustmentA,
        priorityAdjustmentB: settings.priorityAdjustmentB,
        priorityAdjustmentC: settings.priorityAdjustmentC,
        priorityAdjustmentD: settings.priorityAdjustmentD,
        forgettingCurveRate: settings.forgettingCurveRate,
    };
}

export async function getSystemConfig(): Promise<PriorityConfig> {
    const settings = await prisma.systemSettings.findFirst();
    return toPriorityConfig(settings);
}
