'use server';

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const settingsSchema = z.object({
    priorityInitial: z.number().int(),
    priorityAdjustmentA: z.number().int(),
    priorityAdjustmentB: z.number().int(),
    priorityAdjustmentC: z.number().int(),
    priorityAdjustmentD: z.number().int(),
    forgettingCurveRate: z.number(),
    aiGradingEnabled: z.boolean(),
});

export type SettingsData = z.infer<typeof settingsSchema>;

import { getSession } from '@/lib/auth';

async function requireAdmin() {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        throw new Error('Unauthorized');
    }
}

export async function getSystemSettings() {
    await requireAdmin();
    const settings = await prisma.systemSettings.findFirst();
    if (!settings) {
        return await prisma.systemSettings.create({
            data: {
                // Defaults are already defined in schema, but explicit here for clarity
                priorityInitial: 50,
                priorityAdjustmentA: -30,
                priorityAdjustmentB: -10,
                priorityAdjustmentC: 10,
                priorityAdjustmentD: 30,
                forgettingCurveRate: 5.0,
                aiGradingEnabled: false,
            },
        });
    }
    return settings;
}

export async function updateSystemSettings(data: SettingsData) {
    await requireAdmin();
    const parsed = settingsSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: "Invalid data" };
    }

    try {
        // We assume there is only one settings record. 
        // We can findFirst and update, or upsert with a known ID if we had one.
        // Since we don't enforce a singleton ID, we'll find first.
        const existing = await prisma.systemSettings.findFirst();

        if (existing) {
            await prisma.systemSettings.update({
                where: { id: existing.id },
                data: parsed.data,
            });
        } else {
            await prisma.systemSettings.create({
                data: parsed.data,
            });
        }

        revalidatePath('/admin/settings');
        return { success: true };
    } catch (error) {
        console.error("Failed to update settings:", error);
        return { success: false, error: "Failed to update settings" };
    }
}
