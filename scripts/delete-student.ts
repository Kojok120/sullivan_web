
import { prisma } from '../src/lib/prisma';

async function deleteStudent(targetId: string) {
    console.log(`Searching for student with loginId or id: ${targetId}`);

    const student = await prisma.user.findFirst({
        where: {
            OR: [
                { id: targetId },
                { loginId: targetId }
            ]
        }
    });

    if (!student) {
        console.error(`Student not found: ${targetId}`);
        process.exit(1);
    }

    console.log(`Found student: ${student.name} (${student.id})`);
    console.log("Deleting related data...");

    // 1. Delete LearningHistory
    const lh = await prisma.learningHistory.deleteMany({
        where: { userId: student.id }
    });
    console.log(`Deleted ${lh.count} LearningHistory records.`);

    // 2. Delete UserProblemState
    const ups = await prisma.userProblemState.deleteMany({
        where: { userId: student.id }
    });
    console.log(`Deleted ${ups.count} UserProblemState records.`);

    // 3. Delete UserCoreProblemState
    const ucps = await prisma.userCoreProblemState.deleteMany({
        where: { userId: student.id }
    });
    console.log(`Deleted ${ucps.count} UserCoreProblemState records.`);

    // 4. Delete GuidanceRecords (as student)
    const gr = await prisma.guidanceRecord.deleteMany({
        where: { studentId: student.id }
    });
    console.log(`Deleted ${gr.count} GuidanceRecord records.`);

    // 5. Delete User
    await prisma.user.delete({
        where: { id: student.id }
    });
    console.log(`Deleted User: ${student.name}`);
}

const target = process.argv[2];
if (!target) {
    console.error("Usage: npx tsx scripts/delete-student.ts <student_id_or_login_id>");
    process.exit(1);
}

deleteStudent(target)
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
