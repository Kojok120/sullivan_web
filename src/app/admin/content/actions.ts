'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { ProblemType } from '@prisma/client';
import { getSession } from '@/lib/auth';

async function requireAdmin() {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        throw new Error('Unauthorized');
    }
}



export async function updateProblemType(id: string, type: ProblemType) {
    await requireAdmin();
    try {
        await prisma.problem.update({
            where: { id },
            data: { type },
        });
        revalidatePath('/admin/content');
        return { success: true };
    } catch (error) {
        console.error('Failed to update problem type:', error);
        return { success: false, error: '問題タイプの更新に失敗しました' };
    }
}
