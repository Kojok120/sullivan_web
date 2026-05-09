import type { Page } from '@playwright/test';

export type EnvCreds = {
    loginId: string;
    password: string;
};

/**
 * E2E_PROD_BASE_URL が設定されている＝PROD 実行時は、
 * E2E_PROD_LOGIN_ID と E2E_PROD_PASSWORD が両方ある事を要求する
 * （DEV 既定値 (A0001 / password123) で誤って PROD ログインを試みて
 *   無駄に失敗トレースを生むのを防ぐため）。
 *
 * E2E_PROD_BASE_URL が無い＝ローカル DEV 実行は、従来通り A0001 / password123 を返す。
 */
export function adminCreds(): EnvCreds {
    const isProd = !!process.env.E2E_PROD_BASE_URL;
    if (isProd) {
        const loginId = process.env.E2E_PROD_LOGIN_ID;
        const password = process.env.E2E_PROD_PASSWORD;
        if (!loginId || !password) {
            const missing = [
                !loginId ? 'E2E_PROD_LOGIN_ID' : null,
                !password ? 'E2E_PROD_PASSWORD' : null,
            ]
                .filter(Boolean)
                .join(', ');
            throw new Error(
                `PROD 実行 (E2E_PROD_BASE_URL あり) では admin クレデンシャルが必須です。未設定: ${missing}`,
            );
        }
        return { loginId, password };
    }
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
