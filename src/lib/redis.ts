/**
 * 共通Redisクライアント
 * 複数モジュールで使い回すことで設定変更時の漏れを防ぐ
 */
import { Redis } from '@upstash/redis';

export const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
