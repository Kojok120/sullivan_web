-- 印刷生成と問題一覧で頻出する (subjectId, status='PUBLISHED') の絞り込みを高速化
CREATE INDEX "Problem_subjectId_status_idx"
ON "Problem"("subjectId", "status");

-- 教師ビュー（教室別の生徒一覧、集計）でのフィルタを高速化
CREATE INDEX "User_classroomId_role_idx"
ON "User"("classroomId", "role");

-- ダッシュボード／getUnwatchedLectures などの「アンロック済 × 講義未視聴」抽出を高速化
CREATE INDEX "UserCoreProblemState_userId_isUnlocked_isLectureWatched_idx"
ON "UserCoreProblemState"("userId", "isUnlocked", "isLectureWatched");
