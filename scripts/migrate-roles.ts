
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

async function migrateRoles() {
    console.log('Starting role migration...');

    let page = 1;
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error || !users) {
        console.error('Failed to list users:', error);
        return;
    }

    console.log(`Found ${users.length} users.`);

    for (const user of users) {
        const userMeta = user.user_metadata || {};
        const appMeta = user.app_metadata || {};

        // Check if migration is needed
        // We want to move 'role', 'prismaUserId', 'name' from user_metadata to app_metadata if missing or different
        const updates: any = {};

        // Role
        if (userMeta.role && appMeta.role !== userMeta.role) {
            updates.role = userMeta.role;
        }

        // Prisma ID
        if (userMeta.prismaUserId && appMeta.prismaUserId !== userMeta.prismaUserId) {
            updates.prismaUserId = userMeta.prismaUserId;
        }

        // Name (Optional, but good to have in secure meta too)
        if (userMeta.name && appMeta.name !== userMeta.name) {
            updates.name = userMeta.name;
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
