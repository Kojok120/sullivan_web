
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
    const userId = "生徒1";

    // Check if user exists
    let user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
        console.log(`User ${userId} not found. Creating...`);
        const hashedPassword = await bcrypt.hash("password", 10);
        user = await prisma.user.create({
            data: {
                id: userId,
                loginId: "mock_student_1",
                password: hashedPassword,
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
