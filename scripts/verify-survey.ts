import { PrismaClient, SurveyCategory } from '@prisma/client';
import { getSurveyQuestions, shouldShowSurvey, submitSurveyResponse } from '../src/lib/survey-service';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('--- アンケート機能の検証を開始します ---');

    // 1. 質問データのシード検証
    const questions = await prisma.questionBank.findMany();
    console.log(`質問バンクの総数: ${questions.length}`);
    if (questions.length !== 100) {
        console.error('エラー: 100問あるべきです。');
    } else {
        console.log('成功: 質問バンクは正しくシードされています。');
    }

    // 2. getSurveyQuestions のテスト
    const surveyQuestions = await getSurveyQuestions();
    console.log(`取得された質問数: ${surveyQuestions.length}`);
    if (surveyQuestions.length !== 20) {
        console.error('エラー: 20問取得されるべきです。');
    } else {
        console.log('成功: 20問取得されました。');
    }

    // カテゴリの網羅性チェック
    const categories = new Set(surveyQuestions.map(q => q.category));
    console.log(`含まれるカテゴリ: ${Array.from(categories).join(', ')}`);
    // SurveyCategory Enumの値をすべて含むか確認
    const allCategories = Object.values(SurveyCategory);
    if (categories.size !== allCategories.length) {
        console.warn('警告: 全5カテゴリが含まれていません（偶然の偏りの可能性がありますが、ロジックを確認してください）。');
    }

    // 3. ユーザーフローのテスト
    // テスト用ユーザーを作成
    const testUser = await prisma.user.create({
        data: {
            loginId: `test_survey_${Date.now()}`,
            role: 'STUDENT'
        }
    });
    console.log(`テストユーザーを作成しました: ${testUser.id}`);

    try {
        // 対象可否チェック (trueのはず)
        const eligibleBefore = await shouldShowSurvey(testUser.id);
        console.log(`回答前の対象可否: ${eligibleBefore}`);
        if (!eligibleBefore) console.error('エラー: ユーザーは対象であるべきです。');

        // 回答送信
        const answers = surveyQuestions.map(q => ({
            questionId: q.id,
            value: Math.floor(Math.random() * 5) + 1
        }));

        await submitSurveyResponse(testUser.id, answers);
        console.log('アンケート回答を送信しました。');

        // 再度対象可否チェック (falseのはず)
        const eligibleAfter = await shouldShowSurvey(testUser.id);
        console.log(`回答後の対象可否: ${eligibleAfter}`);
        if (eligibleAfter) console.error('エラー: 回答直後は対象外であるべきです。');
        else console.log('成功: 対象可否ロジックは正常です。');

        // 不正なデータの検証 (空配列)
        try {
            await submitSurveyResponse(testUser.id, []);
            console.error('エラー: 空の回答は拒否されるべきです。');
        } catch (e: any) {
            console.log(`成功: 空の回答は拒否されました - ${e.message}`);
        }

        // 不正なデータの検証 (範囲外の値)
        try {
            const invalidAnswers = [{ questionId: surveyQuestions[0].id, value: 6 }];
            await submitSurveyResponse(testUser.id, invalidAnswers);
            console.error('エラー: 不正な値(6)は拒否されるべきです。');
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.log(`成功: 不正な値は拒否されました - ${message}`);
        }
        }


        // クリーンアップ
        // 安全のため、このテストユーザーに関連するデータのみを削除します
        await prisma.surveyResponse.deleteMany({ where: { userId: testUser.id } });
        await prisma.user.delete({ where: { id: testUser.id } });
        console.log('テストユーザーと関連データを削除しました。');

    } catch (e) {
        console.error('テスト中にエラーが発生しました:', e);
        // エラー時のクリーンアップ試行
        await prisma.user.delete({ where: { id: testUser.id } }).catch(() => { });
    } finally {
        await prisma.$disconnect();
    }

    console.log('--- 検証終了 ---');
}

main();
