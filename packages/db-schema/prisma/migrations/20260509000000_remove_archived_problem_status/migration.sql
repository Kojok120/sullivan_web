-- ProblemStatus enum から ARCHIVED 値を廃止する。
-- 事前条件: scripts/migrate-archived-problems-to-draft.ts を実行し、
--           Problem.status = 'ARCHIVED' のレコードが 0 件であること。
-- ProblemRevisionStatus.ARCHIVED は別概念のため触らない。

-- 旧 enum を rename
ALTER TYPE "ProblemStatus" RENAME TO "ProblemStatus_old";

-- 新 enum を作成（ARCHIVED を含まない）
CREATE TYPE "ProblemStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SENT_BACK');

-- Problem.status カラムを新 enum に切り替え
ALTER TABLE "Problem"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ProblemStatus" USING "status"::text::"ProblemStatus",
  ALTER COLUMN "status" SET DEFAULT 'PUBLISHED';

-- 旧 enum を削除
DROP TYPE "ProblemStatus_old";
