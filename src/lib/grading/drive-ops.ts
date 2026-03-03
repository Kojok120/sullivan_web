import path from 'path';

import { prisma } from '@/lib/prisma';

import { DRIVE_FOLDER_ID, getDrive } from './context';

const folderCache = new Map<string, string>();

export async function renameFile(fileId: string, newName: string) {
    try {
        const driveClient = getDrive();
        await driveClient.files.update({
            fileId,
            requestBody: { name: newName },
        });
    } catch (error) {
        console.error('Error renaming file:', error);
    }
}

export async function getFileName(fileId: string): Promise<string | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const driveClient = getDrive();
            const res = await driveClient.files.get({
                fileId,
                fields: 'name',
            });
            return res.data.name ?? null;
        } catch (error) {
            console.warn(`[Drive] Failed to fetch metadata (fileId=${fileId}, attempt=${attempt + 1}/3):`, error);
            if (attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
            }
        }
    }
    return null;
}

export async function archiveProcessedFile(
    fileId: string,
    studentId: string,
    problemId: string,
    date: Date,
    originalFileName: string = 'file.pdf',
) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: studentId },
            include: { classroom: true },
        });
        const classroomName = user?.classroom?.name || '未所属';
        const studentName = user?.name || user?.loginId || '不明な生徒';

        const problem = await prisma.problem.findUnique({
            where: { id: problemId },
            include: { coreProblems: { include: { subject: true } } },
        });

        let subjectName = '不明な教科';
        if (problem && problem.coreProblems.length > 0) {
            subjectName = problem.coreProblems[0].subject.name;
        }

        const ext = path.extname(originalFileName) || '.pdf';

        const jstDate = new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });

        const parts = jstDate.formatToParts(date);
        const getPart = (type: string) => parts.find((part) => part.type === type)?.value || '00';

        const y = getPart('year');
        const m = getPart('month');
        const d = getPart('day');
        const h = getPart('hour');
        const min = getPart('minute');
        const s = getPart('second');

        const timestamp = `${y}${m}${d}-${h}${min}${s}`;
        const newFileName = `${classroomName}_${studentName}_${subjectName}_${timestamp}${ext}`;

        const year = `${y}年`;
        const month = `${String(parseInt(m, 10))}月`;
        const day = `${String(parseInt(d, 10))}日`;

        const rootId = await ensureFolder('採点済', DRIVE_FOLDER_ID);
        const classId = await ensureFolder(classroomName, rootId);
        const yearId = await ensureFolder(year, classId);
        const monthId = await ensureFolder(month, yearId);
        const dayId = await ensureFolder(day, monthId);

        const driveClient = getDrive();
        const file = await driveClient.files.get({ fileId, fields: 'parents' });
        const previousParents = file.data.parents?.join(',') || '';

        await driveClient.files.update({
            fileId,
            addParents: dayId,
            removeParents: previousParents,
            requestBody: { name: newFileName },
            fields: 'id, parents, name',
        });
        console.log(`Moved and Renamed file to: ${newFileName}`);
    } catch (error) {
        console.error('Error archiving file:', error);
        await renameFile(fileId, '[PROCESSED] (Archive Failed)');
    }
}

export async function ensureFolder(name: string, parentId: string): Promise<string> {
    const cacheKey = `${name}:${parentId}`;
    if (folderCache.has(cacheKey)) {
        return folderCache.get(cacheKey)!;
    }

    try {
        const driveClient = getDrive();
        const q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`;
        const res = await driveClient.files.list({
            q,
            fields: 'files(id)',
            pageSize: 1,
        });

        if (res.data.files && res.data.files.length > 0) {
            const id = res.data.files[0].id!;
            folderCache.set(cacheKey, id);
            return id;
        }

        const file = await driveClient.files.create({
            requestBody: {
                name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId],
            },
            fields: 'id',
        });

        const id = file.data.id!;
        folderCache.set(cacheKey, id);
        return id;
    } catch (error) {
        console.error(`Error ensuring folder ${name}:`, error);
        throw error;
    }
}
