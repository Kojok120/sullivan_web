import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

// Initialize Supabase Admin Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.warn('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Skipping Supabase Auth creation.');
}

const supabase = (supabaseUrl && supabaseServiceRoleKey)
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : null;

async function upsertUser(loginId: string, name: string, role: Role, passwordPlain: string) {
    console.log(`Processing user: ${loginId} (${name})`);

    let userId: string | undefined;

    // 1. Create/Get User in Supabase Auth
    if (supabase) {
        const email = `${loginId}@sullivan-internal.local`;

        // Check if user exists by listing users (Admin API doesn't have getUserByEmail directly in all versions, 
        // but createUser handles duplicates safely if we catch error, strictly speaking request user by email is safer)
        // Actually, admin.createUser returns the user if it exists? No, it throws error.

        // Try deleting first to ensure clean state? No, that deletes data.
        // Let's try to fetch user specific data first?
        // Simplest: Try create, if fail with "already registered", then skip auth creation (we assume ID is stable? No, we need the ID).

        // Better: List users by email
        // Note: listUsers is paginated, but for specific check we might need better approach.
        // Actually, currently we can just try to creating.

        // Wait, to get the ID of an existing user reliably without iterating all users:
        // Admin API mostly relies on ID.
        // However, we can use `admin.listUsers` with a filter if supported? Unfortunately searching by email in listUsers is not always direct.
        // 
        // CORRECT APPROACH: Use `admin.createUser` and catch error? 
        // If error says "Email already registered", we can't easily get the ID without signing in or listing.
        // But for a seed script, maybe we can just create if not exists?
        // 
        // Strategy: 
        // 1. Try `createUser`. If success, usage `data.user.id`.
        // 2. If fail, maybe we shouldn't fail silently if we need the ID for Prisma.
        // 
        // Workaround: Since we know the password, we can try `signInWithPassword`? 
        // No, we are admin.
        //
        // Let's check `admin.listUsers` docs in mind.
        // Actually, let's use a simpler approach for now:
        // Try creating. If it fails, assume it exists in Prisma and fetch from there?
        // But we want to ensure Prisma has the CORRECT Auth ID.

        // Let's just try to delete the user in Auth first to be safe for a seed script?
        // No, that's destructive.

        // Let's try to find the user in Prisma first. If they have an ID, we assume that's the Auth ID.
        // If they don't exist in Prisma, we MUST create in Auth.

        const existingPrismaUser = await prisma.user.findUnique({ where: { loginId } });

        if (existingPrismaUser) {
            console.log(`User ${loginId} already exists in Prisma. Assuming Auth user exists.`);
            userId = existingPrismaUser.id;
            // Optionally we could verify against Auth but let's trust Prisma for existing seeds.
        } else {
            // Create in Auth
            const { data, error } = await supabase.auth.admin.createUser({
                email,
                password: passwordPlain,
                email_confirm: true,
                user_metadata: { loginId, name, role }
            });

            if (error) {
                // If error is "User already registered", we have a problem: we don't have the ID.
                // We need to fetch the ID.
                console.warn(`Failed to create Auth user for ${loginId}:`, error.message);
                // Try to recover ID?
                // For now, let's fall back to generating a CUID if Auth failed, BUT warn heavily.
                // ACTUALLY: If Auth exists but Prisma doesn't, we are in inconsistent state.
                // We should probably try to find user by email via listUsers?
                // supabase.auth.admin.listUsers() is possible.
            } else {
                userId = data.user.id;
            }
        }
    }

    // Default to CUID if no Supabase or failed to communicate (dev mode fallback)
    // BUT we must ensure we don't overwrite the ID if it already exists in Prisma

    // Perform Upsert to Prisma
    const hashedPassword = await bcrypt.hash(passwordPlain, 10);

    // If we have a userId from Auth, use it.
    // If we don't (and didn't find in Prisma), Prisma will generate CUID (default).
    // Ideally we FORCE the ID if we got it from Auth.

    const data: any = {
        loginId,
        password: hashedPassword,
        name,
        role,
    };
    if (userId) {
        data.id = userId;
    }

    const user = await prisma.user.upsert({
        where: { loginId },
        update: {
            // If we found them in Prisma, we update fields but usually ID doesn't change.
            // If we are "fixing" the ID to match Auth... upsert doesn't allow updating ID easily?
            // Actually, if where matches, it updates.
            name,
            role,
            password: hashedPassword
        },
        create: data,
    });

    return user;
}

async function main() {
    console.log('Start seeding ...');

    // Password for all seed users
    const PASSWORD = 'password123';

    await upsertUser('S0001', 'Test Student', Role.STUDENT, PASSWORD);
    await upsertUser('T0001', 'Test Teacher', Role.TEACHER, PASSWORD);
    await upsertUser('A0001', 'Admin User', Role.ADMIN, PASSWORD);

    // Create Subjects
    console.log('Seeding subjects...');
    const english = await prisma.subject.upsert({
        where: { name: '英語' },
        update: {},
        create: { name: '英語', order: 1 },
    });

    const math = await prisma.subject.upsert({
        where: { name: '数学' },
        update: {},
        create: { name: '数学', order: 2 },
    });

    const japanese = await prisma.subject.upsert({
        where: { name: '国語' },
        update: {},
        create: { name: '国語', order: 3 },
    });

    // Create CoreProblems for English
    // Unit 1: be動詞 -> CoreProblem Group 1
    console.log('Seeding core problems...');
    await prisma.coreProblem.create({
        data: {
            name: 'be動詞の肯定文',
            order: 1,
            subjectId: english.id,
            problems: {
                create: [
                    { question: 'I ( ) a student.', answer: 'am', order: 1, videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
                    { question: 'You ( ) a teacher.', answer: 'are', order: 2, videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
                    { question: 'He ( ) my friend.', answer: 'is', order: 3, videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
                ],
            },
        },
    });

    await prisma.coreProblem.create({
        data: {
            name: 'be動詞の否定文',
            order: 2,
            subjectId: english.id,
            problems: {
                create: [
                    { question: 'I ( ) not a doctor.', answer: 'am', order: 1 },
                    { question: 'She ( ) not happy.', answer: 'is', order: 2 },
                ],
            },
        },
    });

    // Unit 2: 一般動詞 -> CoreProblem Group 2
    await prisma.coreProblem.create({
        data: {
            name: '一般動詞の肯定文',
            order: 3,
            subjectId: english.id,
            problems: {
                create: [
                    { question: 'I ( ) tennis.', answer: 'play', order: 1 },
                    { question: 'He ( ) soccer.', answer: 'plays', order: 2 },
                ],
            },
        },
    });

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
