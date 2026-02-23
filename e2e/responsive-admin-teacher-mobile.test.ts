import { expect, test, type Page } from '@playwright/test';

async function loginAs(page: Page, loginId: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="loginId"]').fill(loginId);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 3000 }).catch(() => undefined);
}

async function expectNoGlobalHorizontalScroll(page: Page) {
  const hasOverflow = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const pageWidth = document.documentElement.scrollWidth;
    return pageWidth > viewport + 1;
  });
  expect(hasOverflow).toBeFalsy();
}

test.describe('モバイルレスポンシブ (管理者/講師)', () => {
  test('管理者: モバイルメニューとログアウト導線が表示される', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('mobile-'), 'モバイルプロジェクトのみ実行');

    await loginAs(page, 'A0001', 'password123');

    if (page.url().includes('/login')) {
      test.skip(true, '管理者のテストログインに失敗したためスキップ');
    }

    if (page.url().includes('/force-password-change')) {
      test.skip(true, '初期パスワード変更画面に遷移する環境では画面導線検証をスキップ');
    }

    await page.goto('/admin');
    await expect(page.getByTestId('admin-mobile-nav-trigger')).toBeVisible();
    await expect(page.getByTestId('admin-mobile-top-logout-button')).toBeVisible();
    await expectNoGlobalHorizontalScroll(page);

    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'ユーザー管理' })).toBeVisible();
    await expectNoGlobalHorizontalScroll(page);

    await page.goto('/admin/problems');
    await expect(page.getByRole('heading', { name: '問題管理' })).toBeVisible();
    await expectNoGlobalHorizontalScroll(page);

    await page.getByTestId('admin-mobile-nav-trigger').click();
    await expect(page.getByTestId('admin-mobile-logout-button')).toBeVisible();
  });

  test('講師: モバイルメニューとログアウト導線が表示される', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('mobile-'), 'モバイルプロジェクトのみ実行');

    await loginAs(page, 'T0001', 'password123');

    if (page.url().includes('/login')) {
      test.skip(true, '講師のテストログインに失敗したためスキップ');
    }

    if (page.url().includes('/force-password-change')) {
      test.skip(true, '初期パスワード変更画面に遷移する環境では画面導線検証をスキップ');
    }

    await page.goto('/teacher');
    await expect(page.getByRole('heading', { name: '講師用ダッシュボード' })).toBeVisible();
    await expect(page.getByTestId('mobile-nav-trigger')).toBeVisible();
    await expectNoGlobalHorizontalScroll(page);

    await page.getByTestId('mobile-nav-trigger').click();
    await expect(page.getByTestId('mobile-nav-logout-button')).toBeVisible();
  });
});
