---
description: main/dev を origin に同期し、それ以外のローカルブランチを削除
allowed-tools: Bash(git status:*), Bash(git checkout:*), Bash(git fetch:*), Bash(git reset --hard origin/*), Bash(git branch:*), Bash(xargs git branch -D)
---

`.agent/workflows/sync-clean.md` の手順に従って、リポジトリを掃除する。

> [!CAUTION]
> このコマンドは `git reset --hard` と `git branch -D` を含む破壊的操作を行います。`main`, `dev` 以外のローカルブランチは全て削除されます。リモートブランチには触りません。

## 手順

以下を順番に実行する。途中で失敗したら止めて、原因をユーザーに報告する。

### 1. 未コミット変更がないか確認

```bash
git status --porcelain
```

出力が空でなければ、ここで停止して「未コミット変更があるのでコミットかスタッシュしてください」とユーザーに伝える。スタッシュやコミットを勝手に実行しないこと。

### 2. main を origin/main に同期

```bash
git checkout main
git fetch origin main
git reset --hard origin/main
```

### 3. dev を origin/dev に同期

```bash
git checkout dev
git fetch origin dev
git reset --hard origin/dev
```

### 4. main/dev 以外のローカルブランチを削除

```bash
git branch | grep -v "main" | grep -v "dev" | xargs git branch -D
```

削除対象が無い場合は `xargs` がエラーを返すことがあるが、その場合は無視して進めて良い。

### 5. リモートブランチの削除

`.agent/workflows/sync-clean.md` 上ではコメントアウトされている。**実行しない。** 必要であればユーザーが個別に判断する。

## 完了報告

最終的に以下を報告する:

- 残っているローカルブランチ
- 削除したブランチ
- main / dev の HEAD コミット
