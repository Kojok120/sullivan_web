
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.production
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase credentials in .env.production');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

type SupportedRole = 'STUDENT' | 'TEACHER' | 'PARENT' | 'ADMIN';
type MigratableMetadata = {
    role?: SupportedRole;
    prismaUserId?: string;
    name?: string;
};

const SUPPORTED_ROLES = new Set<SupportedRole>(['STUDENT', 'TEACHER', 'PARENT', 'ADMIN']);

function toRecord(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null) {
        return value as Record<string, unknown>;
    }
    return {};
}

function toNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function toSupportedRole(value: unknown): SupportedRole | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    return SUPPORTED_ROLES.has(value as SupportedRole) ? (value as SupportedRole) : undefined;
}

async function migrateRoles() {
    console.log('Starting role migration...');

    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error || !users) {
        console.error('Failed to list users:', error);
        return;
    }

    console.log(`Found ${users.length} users.`);

    for (const user of users) {
        const userMeta = toRecord(user.user_metadata);
        const appMeta = toRecord(user.app_metadata);

        // Check if migration is needed
        // We want to move 'role', 'prismaUserId', 'name' from user_metadata to app_metadata if missing or different
        const updates: Partial<MigratableMetadata> = {};

        const userRole = toSupportedRole(userMeta.role);
        const appRole = toSupportedRole(appMeta.role);
        const userPrismaUserId = toNonEmptyString(userMeta.prismaUserId);
        const appPrismaUserId = toNonEmptyString(appMeta.prismaUserId);
        const userName = toNonEmptyString(userMeta.name);
        const appName = toNonEmptyString(appMeta.name);

        // Role
        if (userRole && appRole !== userRole) {
            updates.role = userRole;
        }

        // Prisma ID
        if (userPrismaUserId && appPrismaUserId !== userPrismaUserId) {
            updates.prismaUserId = userPrismaUserId;
        }

        // Name (Optional, but good to have in secure meta too)
        if (userName && appName !== userName) {
            updates.name = userName;
        }

        if (Object.keys(updates).length > 0) {
            console.log(`Updating user ${user.email} (${user.id}):`, updates);
            const { error: updateError } = await supabase.auth.admin.updateUserById(
                user.id,
                { app_metadata: updates }
            );

            if (updateError) {
                console.error(`Failed to update user ${user.email}:`, updateError);
            } else {
                console.log(`Successfully updated ${user.email}`);
            }
        } else {
            console.log(`User ${user.email} already up to date.`);
        }
    }

    console.log('Migration complete.');
}

migrateRoles();
