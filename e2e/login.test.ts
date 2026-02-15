import { test, expect } from '@playwright/test'

test.describe('ログインページ', () => {
    test('ログインページが表示される', async ({ page }) => {
        await page.goto('/')
        // ログインページにリダイレクトされることを確認
        await expect(page).toHaveURL(/login|auth/)
    })

    test('ログインフォームの要素が存在する', async ({ page }) => {
        await page.goto('/login')
        // ログインIDの入力フィールドが存在する
        const loginInput = page.locator('input[type="text"], input[name="loginId"]').first()
        await expect(loginInput).toBeVisible()

        // パスワードの入力フィールドが存在する
        const passwordInput = page.locator('input[type="password"]').first()
        await expect(passwordInput).toBeVisible()

        // ログインボタンが存在する
        const loginButton = page.locator('button[type="submit"]').first()
        await expect(loginButton).toBeVisible()
    })
})
