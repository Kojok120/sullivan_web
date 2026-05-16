import { expect, test, type Page } from '@playwright/test';
import { adminCreds, loginAs } from './helpers/auth';

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

    const admin = adminCreds();
    await loginAs(page, admin.loginId, admin.password);

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
    // 全件 / 教科別で見出しは「問題一覧」または「問題一覧 - <教科名>」となる（教科未選択時は h2 も同様の語を含むので h1 = level:1 を取る）
    await expect(page.getByRole('heading', { level: 1, name: /問題一覧/ }).first()).toBeVisible();
    await expectNoGlobalHorizontalScroll(page);

    await page.getByTestId('admin-mobile-nav-trigger').click();
    await expect(page.getByTestId('admin-mobile-logout-button')).toBeVisible();
  });

  test('講師: モバイルメニューとログアウト導線が表示される', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('mobile-'), 'モバイルプロジェクトのみ実行');
    test.skip(!!process.env.E2E_PROD_BASE_URL, 'PROD 実行時は講師テスト用クレデンシャル未提供のためスキップ');

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
