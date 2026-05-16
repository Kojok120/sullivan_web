import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import path from 'path';

loadEnv({ path: path.resolve(process.cwd(), '.env.E2E_PROD') });

const baseURL = process.env.E2E_PROD_BASE_URL;
if (!baseURL) {
    throw new Error(
        'E2E_PROD_BASE_URL is not set. Configure it in .env.E2E_PROD before running prod tests.',
    );
}

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 1,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-prod' }]],
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        navigationTimeout: 30_000,
        actionTimeout: 15_000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 7'] },
        },
        {
            name: 'mobile-safari',
            use: { ...devices['iPhone 13'] },
        },
    ],
});
