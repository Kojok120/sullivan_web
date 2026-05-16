import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);

export const baseEnvSchema = z.object({
    DATABASE_URL: nonEmptyString,
    DIRECT_URL: nonEmptyString.optional(),
    NEXT_PUBLIC_SUPABASE_URL: nonEmptyString,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmptyString,
    SUPABASE_SERVICE_ROLE_KEY: nonEmptyString.optional(),
    GEMINI_API_KEY: nonEmptyString.optional(),
    GEMINI_MODEL: nonEmptyString.optional(),
    GEMINI_CHAT_MODEL: nonEmptyString.optional(),
    DRIVE_FOLDER_ID: nonEmptyString.optional(),
    INTERNAL_API_SECRET: nonEmptyString.optional(),
    GOOGLE_CLOUD_PROJECT_ID: nonEmptyString.optional(),
    CLOUD_TASKS_LOCATION: nonEmptyString.optional(),
    GRADING_WORKER_URL: nonEmptyString.optional(),
    GRADING_TASK_QUEUE: nonEmptyString.optional(),
}).passthrough();

export const productEnvSchema = baseEnvSchema.extend({
    PRODUCT_ID: z.enum(['sullivan-jp', 'nihongo', 'sullivan-bd']).default('sullivan-jp'),
    CONTENT_PACK_ID: nonEmptyString.default('jp-juken'),
    LOCALE: nonEmptyString.default('ja-JP'),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type ProductEnv = z.infer<typeof productEnvSchema>;
type EnvSource = Record<string, string | undefined>;

export function parseBaseEnv(env: EnvSource = process.env): BaseEnv {
    return baseEnvSchema.parse(env);
}

export function parseProductEnv(env: EnvSource = process.env): ProductEnv {
    return productEnvSchema.parse(env);
}
