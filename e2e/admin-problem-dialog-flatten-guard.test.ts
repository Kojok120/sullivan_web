import { expect, test } from '@playwright/test';
import { adminCreds, loginAs } from './helpers/auth';

/**
 * Phase C: 構造化ブロック (figure / table / choices / directive など) を含む問題は
 * `/admin/problems` の標準ダイアログ (problem-dialog) から編集すると
 * paragraph テキストへ平坦化されて構造を失うため、Server Action 側でガードして
 * トーストで弾く実装になっている。
 *
 * このテストは DEV 環境に存在する known fixture
 *   - M-965 (geometry directive を含む数学問題)
 *   - M-1907 (solid directive を含む数学問題)
 * のいずれかを使ってガードが動作することを確認する。
 *
 * PROD 実行時は fixture が無い／変わる可能性があるためスキップ。
 */

const FLATTEN_FIXTURES = ['M-965', 'M-1907'] as const;
const EXPECTED_ERROR_PREFIX = '構造化ブロックを含む問題はこの画面から編集できません';

test.describe('Phase C: structured-content flatten guard', () => {
    test('admin がダイアログから figure 入り問題を編集しようとするとガードされる', async ({ page }) => {
        test.skip(
            !!process.env.E2E_PROD_BASE_URL,
            'PROD には fixture (M-965 / M-1907) が無いためスキップ',
        );
        test.skip(
            test.info().project.name !== 'chromium',
            'ガード自体は単一ブラウザで十分なので chromium のみ実行',
        );

        const admin = adminCreds();
        await loginAs(page, admin.loginId, admin.password);

        if (page.url().includes('/login')) {
            test.skip(true, '管理者のテストログインに失敗したためスキップ');
        }
        if (page.url().includes('/force-password-change')) {
            test.skip(true, '初期パスワード変更画面に遷移する環境ではスキップ');
        }

        let usedFixture: string | null = null;
        for (const customId of FLATTEN_FIXTURES) {
            await page.goto(`/admin/problems?q=${customId}`);
            await page.waitForLoadState('networkidle').catch(() => undefined);
            const found = await page
                .getByText(customId, { exact: true })
                .first()
                .isVisible()
                .catch(() => false);
            if (found) {
                usedFixture = customId;
                break;
            }
        }

        if (!usedFixture) {
            test.skip(true, `DEV DB に fixture (${FLATTEN_FIXTURES.join(', ')}) が見つからない`);
        }

        // 検索結果の編集ボタンを押してダイアログを開く。
        // モバイル/デスクトップ両方で同じ「編集」ラベルの button が出る。
        const editButton = page.getByRole('button', { name: '編集' }).first();
        await expect(editButton).toBeVisible();
        await editButton.click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText('問題の編集')).toBeVisible();

        // 問題文 textarea を 1 文字だけ書き換えて「変更があった」状態にする
        const questionTextarea = dialog.locator('textarea').first();
        await expect(questionTextarea).toBeVisible();
        const original = (await questionTextarea.inputValue()).trim();
        // 必ず変化が出るように先頭にマーカーを足す
        await questionTextarea.fill(`${original} (e2e-flatten-guard)`);

        // 保存ボタンを押す
        const saveButton = dialog.getByRole('button', { name: '保存' });
        await saveButton.click();

        // sonner トーストにガードメッセージが出ることを確認
        // (Toaster は body 直下のポータルにレンダリングされるので page.getByText で取る)
        const toastMessage = page.getByText(EXPECTED_ERROR_PREFIX);
        await expect(toastMessage).toBeVisible({ timeout: 10_000 });

        // ガードが効いた場合ダイアログは閉じない (onSuccess 経由でないと閉じない)
        await expect(dialog).toBeVisible();
    });
});
