
import { prisma } from '../src/lib/prisma';

async function checkStudentProgress() {
    // 1. Find Student
    const student = await prisma.user.findFirst({
        where: {
            OR: [
                { loginId: 'student1' },
                { id: 'cmizbu15r0000jaw8k1aze4bn' }
            ]
        },
        include: { userCoreProblemStates: { include: { coreProblem: true } } }
    });

    if (!student) {
        console.log("Target student not found. Listing all students:");
        const users = await prisma.user.findMany({
            where: { role: 'STUDENT' },
            take: 5
        });
        users.forEach(u => console.log(`${u.name} (Login: ${u.loginId}, ID: ${u.id})`));
        return;
    }

    console.log(`Checking progress for ${student.name} (${student.id})`);

    // 2. Inspect UserCoreProblemStates
    const ucp = student.userCoreProblemStates.sort((a, b) => a.coreProblem.name.localeCompare(b.coreProblem.name));

    for (const p of ucp) {
        console.log(`\nCP: ${p.coreProblem.name} (ID: ${p.coreProblemId})`);
        // console.log(`  Priority: ${p.priority}`); // priority is not on State? It is on UserCoreProblemState
        console.log(`  IsUnlocked: ${p.isUnlocked}`);
        // Stats in State?
        // Ah, UserCoreProblemState schema check needed.
        // Assuming it has correctCount, totalAttempts from previous knowledge.
        // Or is it on the relation?
        // Let's print the object keys to be safe
        console.log(JSON.stringify(p, null, 2));
    }
}

checkStudentProgress();
