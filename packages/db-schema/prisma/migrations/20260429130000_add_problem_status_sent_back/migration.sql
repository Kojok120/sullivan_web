-- 「差し戻し」ステータスを ProblemStatus enum に追加
ALTER TYPE "ProblemStatus" ADD VALUE IF NOT EXISTS 'SENT_BACK';
