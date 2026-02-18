import { prisma } from '../src/lib/prisma';

async function main() {
    console.log("Starting manual migration...");
    try {
        // 1. Check if column exists (optional, but good for safety)
        // We can just use "ADD COLUMN IF NOT EXISTS" in Postgres

        console.log("Executing ALTER TABLE...");
        await prisma.$executeRawUnsafe(`
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
    `);

        console.log("Migration command sent successfully.");

        // 2. Verify
        // We can't select 'metadata' via prisma client here if the client is old, 
        // but the previous 'prisma generate' should have updated the client types.
        // Let's try raw query verification
        const result = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='User' AND column_name='metadata';
    `;
        console.log("Verification result:", result);

    } catch (e) {
        console.error("Migration FAILED:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
