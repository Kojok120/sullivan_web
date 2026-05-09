import type { Page } from '@playwright/test';

export type EnvCreds = {
    loginId: string;
    password: string;
};

/**
 * 環境変数 (E2E_PROD_LOGIN_ID / E2E_PROD_PASSWORD) を優先し、
 * 無ければ DEV 既定値 (A0001 / password123) を返す。
 */
export function adminCreds(): EnvCreds {
    return {
        loginId: process.env.E2E_PROD_LOGIN_ID ?? 'A0001',
        password: process.env.E2E_PROD_PASSWORD ?? 'password123',
    };
}

export async function loginAs(page: Page, loginId: string, password: string) {
    await page.goto('/login');
    await page.locator('input[name="loginId"]').fill(loginId);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page
        .waitForURL((url) => url.pathname !== '/login', { timeout: 15_000 })
        .catch(() => undefined);
}
