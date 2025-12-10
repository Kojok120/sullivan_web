
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    // Using a lower level way to list models if SDK supports it?
    // Actually the SDK doesn't expose listModels directly on the main class easily in some versions.
    // Let's try to use rest API via fetch if SDK fails, but SDK usually works.
    // Wait, SDK has `getGenerativeModel` but maybe not list?
    // Using `fetch` to be sure.
    const key = process.env.GEMINI_API_KEY;
    console.log("Env GEMINI_MODEL:", process.env.GEMINI_MODEL);
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    const res = await fetch(url);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
main();
