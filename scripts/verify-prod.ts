import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Manually load .env.production
const envPath = path.resolve(process.cwd(), '.env.production');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
    console.log("Loaded .env.production");
} else {
    console.error(".env.production not found");
    process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
    console.log("Connecting to Production DB...");
    console.log("URL:", process.env.DATABASE_URL?.replace(/:[^:]+@/, ':***@'));

    try {
        // Check for metadata column by checking a user (or schema info if possible)
        // Start with raw query to info schema which works on Postgres
        const result = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='User' AND column_name='metadata';
    `;
        console.log("Column check result:", result);

        if (Array.isArray(result) && result.length > 0) {
            console.log("SUCCESS: 'metadata' column exists in Production DB.");
        } else {
            console.log("FAILURE: 'metadata' column MISSING in Production DB.");
        }

    } catch (e) {
        console.error("Verification Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
