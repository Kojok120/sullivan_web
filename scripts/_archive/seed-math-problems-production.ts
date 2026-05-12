/**
 * 数学問題を本番 DB に DRAFT で投入するためのラッパースクリプト。
 *
 * 実体は `scripts/seed-math-problems-dev.ts` を再利用しつつ、`--env production` を強制注入する。
 * 接続先は `.env.PRODUCTION` から読み込まれる。本番投入は冪等ではない（CoreProblem / Problem を
 * 新規作成する）ため、必ず以下の順で実行すること。
 *
 *   npm run seed:math-prod -- --dry-run                  # 投入予定の確認
 *   npm run seed:math-prod -- --yes --skip-delete        # 既存データを残したまま投入
 *
 * 本番では既存 Problem を消す `--skip-delete` を外した実行は推奨しない。
 * 既存数学データが 0 件であることを事前に DB で確認したうえで実行する。
 */

const argv = process.argv.slice(2);
if (!argv.includes('--env')) {
    process.argv.push('--env', 'production');
}

// dev スクリプト本体を読み込む。--env production がセットされた状態で初期化される。
import('./seed-math-problems-dev').catch((err) => {
    console.error('seed-math-problems-production の起動に失敗しました:', err);
    process.exitCode = 1;
});
