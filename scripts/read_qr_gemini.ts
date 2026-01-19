
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const IMG_PATH = path.join(process.cwd(), 'tmp', 'debug_image_second.jpg');

async function main() {
    if (!API_KEY) throw new Error('GEMINI_API_KEY is missing');

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' }); // Use model from .env

    const imageBuffer = fs.readFileSync(IMG_PATH);
    const imageBase64 = imageBuffer.toString('base64');

    const result = await model.generateContent([
        `This image contains a printed worksheet with a QR code in the bottom right corner.
        
TASK: Decode the QR code and return ONLY its raw content.

The QR code contains a JSON string like: {"s":"S0001","c":"E|1-3,5"} or {"s":"S0001","p":"E-1,E-2"}

CRITICAL RULES:
1. You MUST actually decode the QR code pattern, do NOT guess or fabricate the content
2. The "s" field contains the student Login ID (e.g. "S0001")
3. If you cannot read the QR code, respond with: {"error": "cannot_read_qr"}
4. Return ONLY the JSON, no explanation

What is the exact content of the QR code?`,
        {
            inlineData: {
                data: imageBase64,
                mimeType: 'image/jpeg'
            }
        }
    ]);

    console.log(result.response.text());
}

main().catch(console.error);
