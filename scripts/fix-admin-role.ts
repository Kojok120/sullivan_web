
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function main() {
    // List of likely admin emails to check and fix
    const targets = ['a0002@sullivan-internal.local', 'admin@test.com'];
    console.log(`Searching for users: ${targets.join(', ')}`);

    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });

    if (error) {
        console.error('Error listing users:', error);
        return;
    }

    for (const email of targets) {
        const user = users.find(u => u.email === email);
        if (!user) {
            console.log(`User ${email} not found. Skipping.`);
            continue;
        }

        console.log(`Found user ${user.id} (${email}). Updating app_metadata...`);

        const updates: {
            role: 'ADMIN';
            name: string;
            prismaUserId: string;
            loginId?: string;
        } = {
            role: 'ADMIN',
            name: user.user_metadata?.name || 'Admin User',
            prismaUserId: user.id
        };

        if (user.user_metadata?.loginId) {
            updates.loginId = user.user_metadata.loginId;
        } else if (email.startsWith('a')) {
            updates.loginId = email.split('@')[0].toUpperCase();
        }

        const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
            user.id,
            {
                app_metadata: {
                    ...user.app_metadata,
                    ...updates
                }
            }
        );

        if (updateError) {
            console.error(`Failed to update ${email}:`, updateError);
        } else {
            console.log(`Success! Updated ${email}:`, updated.user.app_metadata);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
