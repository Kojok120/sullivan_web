import fs from 'node:fs';
import puppeteer, { Browser } from 'puppeteer-core';

let browserPromise: Promise<Browser> | null = null;

const CHROMIUM_CANDIDATE_PATHS = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
].filter((path): path is string => Boolean(path));

async function resolveExecutablePath(): Promise<string> {
    for (const candidate of CHROMIUM_CANDIDATE_PATHS) {
        if (fs.existsSync(candidate)) return candidate;
    }

    // 開発環境では devDependency の puppeteer が入っている場合があるため、存在すれば再利用する。
    try {
        const puppeteerPackage = await import('puppeteer');
        const executablePath = puppeteerPackage.default.executablePath();
        if (executablePath && fs.existsSync(executablePath)) {
            return executablePath;
        }
    } catch {
        // puppeteer が存在しない場合は何もしない
    }

    throw new Error('Chromium executable not found. Set PUPPETEER_EXECUTABLE_PATH or install chromium.');
}

async function launchBrowser(): Promise<Browser> {
    const executablePath = await resolveExecutablePath();
    const chromiumConfigDir = '/tmp/.chromium-config';
    const chromiumCacheDir = '/tmp/.chromium-cache';
    const chromiumDataDir = '/tmp/.chromium-data';
    const chromiumUserDataDir = '/tmp/.chromium-user-data';
    const chromiumCrashpadDir = '/tmp/.chromium-crashpad';

    for (const dirPath of [
        chromiumConfigDir,
        chromiumCacheDir,
        chromiumDataDir,
        chromiumUserDataDir,
        chromiumCrashpadDir,
    ]) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    return await puppeteer.launch({
        executablePath,
        headless: true,
        env: {
            ...process.env,
            HOME: process.env.HOME || '/tmp',
            XDG_CONFIG_HOME: chromiumConfigDir,
            XDG_CACHE_HOME: chromiumCacheDir,
            XDG_DATA_HOME: chromiumDataDir,
            CHROME_CRASHPAD_DATABASE: chromiumCrashpadDir,
        },
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--disable-crash-reporter',
            '--disable-breakpad',
            '--disable-features=Crashpad',
            `--user-data-dir=${chromiumUserDataDir}`,
            `--crash-dumps-dir=${chromiumCrashpadDir}`,
            '--font-render-hinting=none',
        ],
        // Cloud Run での安定稼働を優先し、既定のシグナルハンドリングを維持する。
        handleSIGINT: true,
        handleSIGTERM: true,
        handleSIGHUP: true,
        defaultViewport: {
            width: 1240,
            height: 1754,
            deviceScaleFactor: 1,
        },
        timeout: 30_000,
        dumpio: false,
    });
}

export async function getPdfBrowser(): Promise<Browser> {
    if (!browserPromise) {
        browserPromise = launchBrowser().then((browser) => {
            browser.on('disconnected', () => {
                browserPromise = null;
            });
            return browser;
        }).catch((error) => {
            browserPromise = null;
            throw error;
        });
    }

    return await browserPromise;
}
