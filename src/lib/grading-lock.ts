import { redis } from '@/lib/redis';

const SCAN_LOCK_KEY = 'sullivan:grading:scan:lock';
const SCAN_LOCK_TTL_SECONDS = 60;
const FILE_LOCK_PREFIX = 'sullivan:grading:file:';
const FILE_LOCK_TTL_SECONDS = 15 * 60;

function fileLockKey(fileId: string) {
  return `${FILE_LOCK_PREFIX}${fileId}`;
}

/**
 * Attempts to acquire the global scan lock (for Drive polling).
 */
export async function acquireGradingLock(): Promise<boolean> {
  const result = await redis.set(SCAN_LOCK_KEY, '1', {
    nx: true,
    ex: SCAN_LOCK_TTL_SECONDS,
  });
  return result === 'OK';
}

/**
 * Releases the global scan lock.
 */
export async function releaseGradingLock(): Promise<void> {
  await redis.del(SCAN_LOCK_KEY);
}

/**
 * Attempts to acquire a file-level lock for grading.
 */
export async function acquireGradingFileLock(fileId: string): Promise<boolean> {
  const result = await redis.set(fileLockKey(fileId), '1', {
    nx: true,
    ex: FILE_LOCK_TTL_SECONDS,
  });
  return result === 'OK';
}

/**
 * Releases the file-level grading lock.
 */
export async function releaseGradingFileLock(fileId: string): Promise<void> {
  await redis.del(fileLockKey(fileId));
}
