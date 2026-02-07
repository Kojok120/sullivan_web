
import { prisma } from '../src/lib/prisma';

async function main() {
    const userId = "生徒1";

    // Check if user exists
    let user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
        console.log(`User ${userId} not found. Creating...`);
        user = await prisma.user.create({
            data: {
                id: userId,
                loginId: "mock_student_1",
                name: "テスト生徒1",
                role: "STUDENT"
            }
        });
        console.log(`User ${userId} created.`);
    } else {
        console.log(`User ${userId} already exists.`);
    }
}

main();
