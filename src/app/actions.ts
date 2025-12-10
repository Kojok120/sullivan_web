"use server";

import { getSession, logout } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";


export async function logoutAction() {
    await logout();
    redirect("/login");
}

export async function getSubjects() {
    const { fetchSubjects } = await import('@/lib/curriculum-service');
    return await fetchSubjects();
}

export async function getSubject(id: string) {
    return await prisma.subject.findUnique({
        where: { id },
        include: {
            coreProblems: {
                orderBy: { order: 'asc' },
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });
}

export async function markVideoWatched(historyId: string) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    // Verify ownership
    const record = await prisma.learningHistory.findUnique({
        where: { id: historyId },
    });

    if (!record || record.userId !== session.userId) {
        throw new Error("Not found or access denied");
    }

    await prisma.learningHistory.update({
        where: { id: historyId },
        data: { isVideoWatched: true },
    });

    // Revalidate relevant paths if needed, e.g. dashboard
    // revalidatePath('/dashboard');
}
