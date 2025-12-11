
import { prisma } from '../src/lib/prisma';

async function main() {
    // 1. Find the student (Test Student)
    // QR code image says "Test Student", assuming loginId S0001 or we find by name
    const student = await prisma.user.findFirst({
        where: { name: 'Test Student' }
    });

    if (!student) {
        console.error("Student 'Test Student' not found.");
        // Try finding any recent history
    } else {
        console.log(`Found Student: ${student.name} (${student.id})`);
    }

    // 2. Get Recent Learning History (limit 20)
    const history = await prisma.learningHistory.findMany({
        where: student ? { userId: student.id } : {},
        orderBy: { answeredAt: 'desc' },
        take: 20,
        include: {
            problem: {
                select: { customId: true, question: true, answer: true, acceptedAnswers: true }
            }
        }
    });

    console.log(`\nFound ${history.length} recent history records.`);

    // Group by GroupID to find the batch
    const groups = new Map();
    history.forEach(h => {
        const gid = h.groupId || 'no-group';
        if (!groups.has(gid)) groups.set(gid, []);
        groups.get(gid).push(h);
    });

    for (const [gid, items] of groups.entries()) {
        console.log(`\n--- Group ID: ${gid} (${items[0].answeredAt.toISOString()}) ---`);
        for (const item of items) {
            const isCorrect = item.evaluation === 'A' || item.evaluation === 'B';
            const mark = isCorrect ? 'OK' : 'NG';
            console.log(`[${mark}] ${item.problem.customId} | Eval: ${item.evaluation}`);
            console.log(`      Q: ${item.problem.question}`);
            console.log(`      Ans (DB): ${item.problem.answer}`);
            console.log(`      User Arg: ${item.userAnswer}`);
            console.log(`      Feedback: ${item.feedback.substring(0, 50)}...`);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
