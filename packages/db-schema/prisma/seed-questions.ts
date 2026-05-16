import { PrismaClient, SurveyCategory } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

const questions = [
    // GRIT & PERSEVERANCE (やり抜く力・粘り強さ)
    { category: SurveyCategory.GRIT, question: '難しい問題にぶつかっても、あきらめずに解き続けようとする。' },
    { category: SurveyCategory.GRIT, question: '一度決めた目標は、最後までやり遂げる自信がある。' },
    { category: SurveyCategory.GRIT, question: '勉強で行き詰まっても、別の方法を試してみる。' },
    { category: SurveyCategory.GRIT, question: '失敗しても、それを学びに変えて次に活かそうとする。' },
    { category: SurveyCategory.GRIT, question: '長い期間かかる課題でも、コツコツと努力を続けられる。' },
    { category: SurveyCategory.GRIT, question: '最初の数回でうまくいかなくても、何度も挑戦する。' },
    { category: SurveyCategory.GRIT, question: '熱中して取り組んでいる時は、周りの邪魔が入っても集中し続けられる。' },
    { category: SurveyCategory.GRIT, question: '成果が出るのに時間がかかっても、焦らずに取り組める。' },
    { category: SurveyCategory.GRIT, question: '疲れていても、今日やると決めたことは最後までやる。' },
    { category: SurveyCategory.GRIT, question: '自分にとって重要なことは、どんなに困難でも達成しようとする。' },
    { category: SurveyCategory.GRIT, question: '途中で投げ出したくなるような時でも、自分を励まして続けることができる。' },
    { category: SurveyCategory.GRIT, question: '興味を持ったことは、数ヶ月あるいは数年単位で追い続けることができる。' },
    { category: SurveyCategory.GRIT, question: '一時的な失敗でやる気を失うことは少ない。' },
    { category: SurveyCategory.GRIT, question: '他の人よりも粘り強く課題に取り組むことができると思う。' },
    { category: SurveyCategory.GRIT, question: '始めたプロジェクトや課題は、完了させることにこだわりがある。' },
    { category: SurveyCategory.GRIT, question: '困難な状況こそ、自分が成長するチャンスだと捉えることができる。' },
    { category: SurveyCategory.GRIT, question: '目標達成のためなら、地道な作業も苦にならない。' },
    { category: SurveyCategory.GRIT, question: '過去に、あきらめそうになったけれど乗り越えた経験がある。' },
    { category: SurveyCategory.GRIT, question: '自分の限界だと思っても、そこからさらに一歩頑張ることができる。' },
    { category: SurveyCategory.GRIT, question: '周囲が無理だと言っても、自分が信じたことはやり続ける。' },

    // SELF_EFFICACY (自己効力感)
    { category: SurveyCategory.SELF_EFFICACY, question: '勉強すれば、必ず成績は上がると信じている。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '自分には、難しい問題を解く力があると思う。' },
    { category: SurveyCategory.SELF_EFFICACY, question: 'テストで良い点を取る自信がある。' },
    { category: SurveyCategory.SELF_EFFICACY, question: 'どんなに難しい授業でも、努力すれば理解できると思う。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '将来の夢や目標を達成できると信じている。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '自分は勉強が得意な方だと思う。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '新しいことでも、自分なら習得できるという感覚がある。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '失敗しても、次はうまくやれるという予感がある。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '周りの人と比べて、自分は能力が劣っていないと思う。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '先生や親に期待されていることに応えられる自信がある。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '自分の学習計画は、実行可能なものだと確信している。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '予期せぬ問題が起きても、冷静に対処できる自信がある。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '自分には学ぶ才能があると思う。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '過去の成功体験が、今の自信につながっている。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '難しい課題を与えられたとき、「自分ならできる」とワクワクする。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '自分の努力は、必ず報われると信じている。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '勉強以外のことでも、自分はうまくやれることが多い。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '自分の強みや長所を理解し、それを活かせていると思う。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '不安な時でも、自分を信じて行動することができる。' },
    { category: SurveyCategory.SELF_EFFICACY, question: '自分が立てた目標は、決して高すぎるものではないと思う。' },

    // SELF_REGULATION (自己調整学習方略)
    { category: SurveyCategory.SELF_REGULATION, question: '勉強を始める前に、何をどれくらいやるか計画を立てている。' },
    { category: SurveyCategory.SELF_REGULATION, question: 'テスト前には、逆算してスケジュールを考える。' },
    { category: SurveyCategory.SELF_REGULATION, question: '勉強の邪魔になるもの（スマホなど）を、自分から遠ざけることができる。' },
    { category: SurveyCategory.SELF_REGULATION, question: '集中力が切れたとき、自分なりのリフレッシュ方法を持っている。' },
    { category: SurveyCategory.SELF_REGULATION, question: '問題を間違えたとき、なぜ間違えたのか原因を分析している。' },
    { category: SurveyCategory.SELF_REGULATION, question: '自分の得意な部分と苦手な部分を把握している。' },
    { category: SurveyCategory.SELF_REGULATION, question: '勉強中、自分が今何を理解していて、何を理解していないか確認しながら進めている。' },
    { category: SurveyCategory.SELF_REGULATION, question: '期限を守るために、余裕を持って課題に取り掛かる。' },
    { category: SurveyCategory.SELF_REGULATION, question: 'ノートを取るとき、後で見返して復習しやすいように工夫している。' },
    { category: SurveyCategory.SELF_REGULATION, question: '分からないことがあったら、すぐに調べるか誰かに聞くようにしている。' },
    { category: SurveyCategory.SELF_REGULATION, question: '1日の終わりに、その日の学習を振り返る習慣がある。' },
    { category: SurveyCategory.SELF_REGULATION, question: '計画通りにいかないときは、柔軟に計画を修正できる。' },
    { category: SurveyCategory.SELF_REGULATION, question: '重要なポイントには色をつけたり、印をつけたりして工夫している。' },
    { category: SurveyCategory.SELF_REGULATION, question: '暗記するときは、ただ見るだけでなく、書いたり声に出したりしている。' },
    { category: SurveyCategory.SELF_REGULATION, question: '勉強時間を確保するために、他の時間を調整することができる。' },
    { category: SurveyCategory.SELF_REGULATION, question: 'テストの結果が悪くても、落ち込むだけでなく次の対策を考える。' },
    { category: SurveyCategory.SELF_REGULATION, question: '自分に合った勉強場所や時間帯を知っている。' },
    { category: SurveyCategory.SELF_REGULATION, question: '目標達成のために、小刻みな目標（マイルストーン）を設定している。' },
    { category: SurveyCategory.SELF_REGULATION, question: '自分の学習ペースを把握し、無理のない計画を立てている。' },
    { category: SurveyCategory.SELF_REGULATION, question: '先生のアドバイスを素直に聞き入れ、自分のやり方を改善できる。' },

    // GROWTH_MINDSET (成長マインドセット)
    { category: SurveyCategory.GROWTH_MINDSET, question: '人間の能力は生まれつき決まっているものではなく、努力で変えられると思う。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '難しい課題は、自分の頭を良くしてくれるチャンスだと思う。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '間違えることは恥ずかしいことではなく、学ぶためのステップだと思う。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '最初からうまくできることより、努力してできるようになったことの方が価値があると思う。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '他人の成功を見て、嫉妬するよりも「自分も頑張ろう」と刺激を受ける。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '「才能がない」と言い訳をするのは好きではない。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '批判や注意を受けたとき、それを攻撃ではなくアドバイスとして受け止める。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '今はできなくても、いつか必ずできるようになると考えている。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '簡単な問題ばかり解いても、あまり意味がないと思う。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '努力しても結果が出ないときは、やり方を変えればいいと考える。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '自分の限界を決めつけないようにしている。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '「頭が良い」と言われるより、「頑張ったね」と言われる方が嬉しい。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '挑戦して失敗した人の方が、何もしなかった人より立派だと思う。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '新しいことを学ぶ過程そのものを楽しんでいる。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '困難な壁にぶつかったときこそ、成長している実感がある。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '過去の自分と比べて、どれだけ成長したかを重視している。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '生まれ持った才能よりも、継続的な努力の方が大事だと思う。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: 'どんなに苦手な科目でも、勉強し続ければ克服できると信じている。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '失敗を恐れて挑戦しないのはもったいないと思う。' },
    { category: SurveyCategory.GROWTH_MINDSET, question: '自分自身の可能性を信じている。' },

    // EMOTIONAL_REGULATION (感情調整・精神的回復力)
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: 'テスト前に緊張しても、それを良い緊張感に変えることができる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '勉強でイライラしても、すぐに気持ちを切り替えられる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '嫌なことがあっても、勉強に引きずらないようにできる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '不安な気持ちになったとき、誰かに相談したり自分で対処したりできる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: 'プレッシャーがかかる場面でも、普段通りの力を発揮できる方だ。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '成績が下がっても、過度に落ち込みすぎない。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: 'やる気が出ない日でも、とりあえず机に向かうことができる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '自分の感情をコントロールするのが得意な方だと思う。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: 'ストレスを感じたとき、自分なりの解消法を持っている。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '他人と自分を比べて落ち込むことはあまりない。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '試験中、難しい問題があっても焦らずに対処できる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '失敗して恥ずかしい思いをしても、すぐに立ち直れる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '勉強がつらい時でも、将来の目標を思い出して頑張れる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: 'ネガティブな考えが浮かんでも、ポジティブな方向に考え直せる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '自分の機嫌は自分で取ることができる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '予期せぬトラブルがあってもパニックにならずに対応できる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '忙しい時でも、心に余裕を持つように心がけている。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '周囲の雑音や環境の変化に動じずに集中できる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: '自分の弱さを認め、無理をしすぎないように調整できる。' },
    { category: SurveyCategory.EMOTIONAL_REGULATION, question: 'どんな状況でも、希望を持って取り組むことができる。' }
];

async function main() {
    console.log('質問データのシードを開始します...');

    // 既存のすべての質問を取得してマップを作成
    const existingQuestions = await prisma.questionBank.findMany();
    const existingSet = new Set(existingQuestions.map(q => q.question));

    // 存在しない質問のみをフィルタリング
    const newQuestions = questions.filter(q => !existingSet.has(q.question));

    if (newQuestions.length > 0) {
        console.log(`${newQuestions.length} 件の新しい質問を追加します...`);
        // 一括挿入 (N+1問題の解消)
        await prisma.questionBank.createMany({
            data: newQuestions,
            skipDuplicates: true //念のため
        });
    } else {
        console.log('新しい質問はありません。');
    }

    console.log('シードが完了しました。');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
