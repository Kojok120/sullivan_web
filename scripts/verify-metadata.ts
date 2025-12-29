import { prisma } from '../src/lib/prisma';

async function main() {
    try {
        // Try to select metadata from a user (even if none exists, the query validity checks schema)
        // We use raw query to check actual DB schema, bypassing Prisma Client validation if possible,
        // but Prisma Client is easier. If Client throws "Unknown field", it's a client issue.
        // If Client works but DB fails, it helps us know DB state.

        console.log("Checking User model...");
        // Just find first user
        const user = await prisma.user.findFirst({
            select: { id: true, metadata: true }
        });
        console.log("Query successful. User found:", !!user);
        if (user) {
            console.log("Metadata value:", user.metadata);
        }
        console.log("Verification PASSED: metadata column exists and is accessible.");
    } catch (e) {
        console.error("Verification FAILED:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
