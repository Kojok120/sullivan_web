import { randomUUID } from 'crypto';

import { Prisma } from '@prisma/client';

import { prisma } from '@sullivan/db-schema';

const SCAN_LOCK_KEY = 'sullivan:grading:scan:lock';
const SCAN_LOCK_TTL_SECONDS = 60;
const FILE_LOCK_PREFIX = 'sullivan:grading:file:';
const FILE_LOCK_TTL_SECONDS = 15 * 60;

export type GradingLease = {
    key: string;
    ownerId: string;
    expiresAt: Date;
};

type LockRow = {
    key: string;
    ownerId: string;
    expiresAt: Date;
};

function fileLockKey(fileId: string) {
    return `${FILE_LOCK_PREFIX}${fileId}`;
}

async function acquireLease(key: string, ttlSeconds: number): Promise<GradingLease | null> {
    const ownerId = randomUUID();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const rows = await prisma.$queryRaw<LockRow[]>(Prisma.sql`
        INSERT INTO "distributed_locks" ("key", "owner_id", "expires_at", "created_at", "updated_at")
        VALUES (${key}, ${ownerId}, ${expiresAt}, NOW(), NOW())
        ON CONFLICT ("key") DO UPDATE
        SET
            "owner_id" = EXCLUDED."owner_id",
            "expires_at" = EXCLUDED."expires_at",
            "updated_at" = NOW()
        WHERE "distributed_locks"."expires_at" <= NOW()
        RETURNING
            "key",
            "owner_id" AS "ownerId",
            "expires_at" AS "expiresAt"
    `);

    return rows[0] ?? null;
}

async function releaseLease(lease: GradingLease): Promise<void> {
    await prisma.distributedLock.deleteMany({
        where: {
            key: lease.key,
            ownerId: lease.ownerId,
        },
    });
}

async function isLeaseActive(key: string): Promise<boolean> {
    const lock = await prisma.distributedLock.findUnique({
        where: { key },
        select: { expiresAt: true },
    });

    return Boolean(lock && lock.expiresAt.getTime() > Date.now());
}

/**
 * Drive ポーリング全体を直列化するグローバルロック。
 */
export async function acquireGradingLock(): Promise<GradingLease | null> {
    return acquireLease(SCAN_LOCK_KEY, SCAN_LOCK_TTL_SECONDS);
}

/**
 * グローバルロックを解放する。
 */
export async function releaseGradingLock(lease: GradingLease): Promise<void> {
    await releaseLease(lease);
}

/**
 * 1ファイル単位の採点ロック。
 */
export async function acquireGradingFileLock(fileId: string): Promise<GradingLease | null> {
    return acquireLease(fileLockKey(fileId), FILE_LOCK_TTL_SECONDS);
}

/**
 * ファイル単位ロックを解放する。
 */
export async function releaseGradingFileLock(lease: GradingLease): Promise<void> {
    await releaseLease(lease);
}

/**
 * 現在有効なファイルロックが存在するかを返す。
 */
export async function isGradingFileLocked(fileId: string): Promise<boolean> {
    return isLeaseActive(fileLockKey(fileId));
}
