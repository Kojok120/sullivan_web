import { createUser } from '../src/lib/user-service';
import { prisma } from '../src/lib/prisma';

// Force load .env.production into process.env BEFORE other imports if possible, 
// but imports are cached. 
// We might need to rely on the fact that we run this with `dotenv_config_path=.env.production` 
// or manually set env vars.
// Since `src/lib/prisma` initializes `prisma` client using `process.env`, we must set it before requiring that file.
// But `import` creates strict order. 
// Function `main` wrapper won't help if top-level imports read env.
// `src/lib/prisma.ts` usually does `const prisma = new PrismaClient()`.
// This reads env at instantiation.
// So if we set env before this script runs (via CLI), it works.

async function main() {
    console.log("Mocking User Creation on PROD...");

    // We will try to create a user "TestUser_Debug"
    try {
        const testPayload = {
            name: "TestUser_Debug",
            role: "STUDENT" as const,
            group: "DebugGroup",
            password: "testpassword123"
        };

        console.log("Attempting to create user:", testPayload);
        const newUser = await createUser(testPayload);
        console.log("User created successfully:", newUser);

        // Clean up
        await prisma.user.delete({ where: { id: newUser.id } });
        console.log("Cleaned up test user.");

    } catch (e) {
        console.error("User Creation FAILED:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
