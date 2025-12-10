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
