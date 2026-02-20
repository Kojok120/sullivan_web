import { redis } from '@/lib/redis';

const SCAN_LOCK_KEY = 'sullivan:grading:scan:lock';
const SCAN_LOCK_TTL_SECONDS = 60;
const FILE_LOCK_PREFIX = 'sullivan:grading:file:';
const FILE_LOCK_TTL_SECONDS = 15 * 60;
const REDIS_RETRY_ATTEMPTS = 3;
const REDIS_RETRY_BASE_DELAY_MS = 100;

function fileLockKey(fileId: string) {
  return `${FILE_LOCK_PREFIX}${fileId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRedisRetry<T>(actionName: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= REDIS_RETRY_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < REDIS_RETRY_ATTEMPTS) {
        await sleep(REDIS_RETRY_BASE_DELAY_MS * attempt);
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`[GradingLock] ${actionName} failed after ${REDIS_RETRY_ATTEMPTS} attempts: ${message}`);
}

/**
 * Attempts to acquire the global scan lock (for Drive polling).
 */
export async function acquireGradingLock(): Promise<boolean> {
  const result = await withRedisRetry('acquireGradingLock', () => redis.set(SCAN_LOCK_KEY, '1', {
    nx: true,
    ex: SCAN_LOCK_TTL_SECONDS,
  }));
  return result === 'OK';
}

/**
 * Releases the global scan lock.
 */
export async function releaseGradingLock(): Promise<void> {
  await withRedisRetry('releaseGradingLock', () => redis.del(SCAN_LOCK_KEY));
}

/**
 * Attempts to acquire a file-level lock for grading.
 */
export async function acquireGradingFileLock(fileId: string): Promise<boolean> {
  const result = await withRedisRetry('acquireGradingFileLock', () => redis.set(fileLockKey(fileId), '1', {
    nx: true,
    ex: FILE_LOCK_TTL_SECONDS,
  }));
  return result === 'OK';
}

/**
 * Releases the file-level grading lock.
 */
export async function releaseGradingFileLock(fileId: string): Promise<void> {
  await withRedisRetry('releaseGradingFileLock', () => redis.del(fileLockKey(fileId)));
}

/**
 * Returns true when the file-level lock exists.
 */
export async function isGradingFileLocked(fileId: string): Promise<boolean> {
  const result = await withRedisRetry('isGradingFileLocked', () => redis.exists(fileLockKey(fileId)));
  return result === 1;
}
