import { expect, test } from '@playwright/test';
import { adminCreds, loginAs } from './helpers/auth';

/**
 * PR #155 で導入した [[solid kind=...]] DSL が PROD で実際に SVG として
 * 描画されているかを確認するスモーク（読み取り専用）。
 *
 * 対象問題（PROD で 立体 DSL を当てた代表 4 件）:
 *   M-1907 rect-prism / M-1908 cube / M-696 cylinder / M-706 sphere
 *
 * customId は PROD 側で一意なので環境変数で差し替えはせず、
 * scripts/find-customid-cuids.ts で取得した cuid をハードコードする。
 */

const SOLID_TARGETS: { customId: string; cuid: string; expected: string }[] = [
  { customId: 'M-1907', cuid: 'cmovk2v4r029m2bjamq9nm6j0', expected: 'rect-prism' },
  { customId: 'M-1908', cuid: 'cmovk2v6v029o2bjam0bshr0k', expected: 'cube' },
  { customId: 'M-696',  cuid: 'cmovk0iu600ec2bjadltsrx02', expected: 'cylinder' },
  { customId: 'M-706',  cuid: 'cmovk0jhh00ew2bja8lfin8xo', expected: 'sphere' },
];

test.describe('PROD: 立体 DSL レンダリング (admin editor)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop chromium のみ実行');
    // 本テストの cuid は PROD DB のもの (header 参照)。DEV DB には存在せず
    // 編集ページが 404 になるので、E2E_PROD_BASE_URL 未設定の実行は skip する。
    test.skip(!process.env.E2E_PROD_BASE_URL, 'PROD-only: cuid は PROD DB 由来');
    const admin = adminCreds();
    await loginAs(page, admin.loginId, admin.password);
    if (page.url().includes('/login')) {
      test.skip(true, 'PROD admin login に失敗したためスキップ');
    }
    if (page.url().includes('/force-password-change')) {
      test.skip(true, '初期パスワード変更画面に遷移する環境では検証をスキップ');
    }
  });

  for (const target of SOLID_TARGETS) {
    test(`${target.customId} (${target.expected}) の編集画面で svg.solid が描画される`, async ({ page }) => {
      const response = await page.goto(`/admin/problems/${target.cuid}`, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBeLessThan(400);

      // ページ読み込み完了を待つ（SSR で svg は最初から DOM にある想定）
      // /admin/problems/<id> は variant='admin' (デフォルト) で開くので h1 は「構造化問題エディタ」
      await expect(page.getByRole('heading', { name: '構造化問題エディタ' }).first()).toBeVisible({ timeout: 15_000 });

      // svg.solid が 1 個以上、かつ .solid-error が無いこと
      const solidSvg = page.locator('svg.solid').first();
      await expect(solidSvg).toBeVisible({ timeout: 10_000 });

      const errorCount = await page.locator('.solid-error').count();
      expect(errorCount, '.solid-error が残っている → DSL parse 失敗').toBe(0);
    });
  }
});
