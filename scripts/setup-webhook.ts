import { watchDriveFolder } from '../src/lib/drive-webhook-manager';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const url = process.argv[2];

if (!url) {
    console.error("Usage: ts-node scripts/setup-webhook.ts <PUBLIC_WEBHOOK_URL>");
    console.error("Example: ts-node scripts/setup-webhook.ts https://api.mysite.com/api/grading/webhook");
    process.exit(1);
}

async function main() {
    try {
        console.log(`Setting up webhook for URL: ${url}`);
        const result = await watchDriveFolder(url);
        console.log("SUCCESS! Webhook registered.");
        console.log("----------------------------------------");
        console.log("Channel ID:", result.channelId);
        console.log("Resource ID:", result.resourceId);
        console.log("Expiration:", new Date(Number(result.expiration)).toLocaleString());
        console.log("----------------------------------------");
        console.log("SAVE THESE IDs! You will need them to stop the webhook later.");
    } catch (error) {
        console.error("Failed to setup webhook:", error);
    }
}

main();
