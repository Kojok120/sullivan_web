import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    const key = process.env.GEMINI_API_KEY;
    console.log("Env GEMINI_MODEL:", process.env.GEMINI_MODEL);
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    const res = await fetch(url);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
main();
