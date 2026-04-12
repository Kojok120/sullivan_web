import crypto from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_BUCKET = 'problem-assets';

export function getProblemAssetBucketName(): string {
    return (process.env.SUPABASE_PROBLEM_ASSET_BUCKET || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;
}

export function buildProblemAssetStorageKey(input: {
    problemId: string;
    revisionId: string;
    fileName: string;
}): string {
    const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
    return `problems/${input.problemId}/${input.revisionId}/${Date.now()}-${safeFileName}`;
}

async function ensureProblemAssetBucketExists() {
    const admin = createAdminClient();
    const bucket = getProblemAssetBucketName();
    const { data: buckets, error: listError } = await admin.storage.listBuckets();

    if (listError) {
        throw new Error(`Supabase Storage のバケット一覧取得に失敗しました: ${listError.message}`);
    }

    if (buckets.some((item) => item.name === bucket)) {
        return {
            admin,
            bucket,
        };
    }

    const { error: createError } = await admin.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: '20MB',
    });

    if (createError && !createError.message.includes('already exists')) {
        throw new Error(`Supabase Storage のバケット作成に失敗しました: ${createError.message}`);
    }

    return {
        admin,
        bucket,
    };
}

async function uploadProblemAssetBufferToStorage(input: {
    problemId: string;
    revisionId: string;
    fileName: string;
    contentType: string;
    buffer: Buffer;
}): Promise<{
    storageKey: string;
    checksum: string;
    mimeType: string;
}> {
    const checksum = crypto.createHash('sha1').update(input.buffer).digest('hex');
    const storageKey = buildProblemAssetStorageKey({
        problemId: input.problemId,
        revisionId: input.revisionId,
        fileName: input.fileName,
    });

    const { admin, bucket } = await ensureProblemAssetBucketExists();
    const { error } = await admin.storage.from(bucket).upload(storageKey, input.buffer, {
        contentType: input.contentType || 'application/octet-stream',
        upsert: true,
    });

    if (error) {
        throw new Error(`Supabase Storage へのアップロードに失敗しました: ${error.message}`);
    }

    return {
        storageKey,
        checksum,
        mimeType: input.contentType || 'application/octet-stream',
    };
}

export async function uploadProblemAssetToStorage(input: {
    problemId: string;
    revisionId: string;
    file: File;
}): Promise<{
    storageKey: string;
    checksum: string;
    mimeType: string;
}> {
    const buffer = Buffer.from(await input.file.arrayBuffer());
    return uploadProblemAssetBufferToStorage({
        problemId: input.problemId,
        revisionId: input.revisionId,
        fileName: input.file.name,
        contentType: input.file.type || 'application/octet-stream',
        buffer,
    });
}

export async function removeProblemAssetFromStorage(storageKey: string | null | undefined) {
    if (!storageKey) return;

    const admin = createAdminClient();
    const bucket = getProblemAssetBucketName();
    const { error } = await admin.storage.from(bucket).remove([storageKey]);
    if (error) {
        console.warn('[problem-assets] Storage 削除に失敗しました', {
            storageKey,
            message: error.message,
        });
    }
}

export async function createProblemAssetSignedUrl(storageKey: string, expiresIn = 60 * 60): Promise<string | null> {
    const admin = createAdminClient();
    const bucket = getProblemAssetBucketName();
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(storageKey, expiresIn);

    if (error) {
        console.warn('[problem-assets] Signed URL の生成に失敗しました', {
            storageKey,
            message: error.message,
        });
        return null;
    }

    return data.signedUrl;
}

export async function downloadProblemAssetFromStorage(storageKey: string): Promise<Buffer | null> {
    const admin = createAdminClient();
    const bucket = getProblemAssetBucketName();
    const { data, error } = await admin.storage.from(bucket).download(storageKey);

    if (error) {
        console.warn('[problem-assets] Storage ダウンロードに失敗しました', {
            storageKey,
            message: error.message,
        });
        return null;
    }

    return Buffer.from(await data.arrayBuffer());
}
