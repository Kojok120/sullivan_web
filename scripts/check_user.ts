
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const studentId = 'clv340tq800003b6krt8iagf4';
    console.log(`Checking for user with ID: ${studentId}`);

    // List all users to see what's in there
    const users = await prisma.user.findMany({ take: 5 });
    console.log('Existing users:', users.map(u => ({ id: u.id, name: u.name, loginId: u.loginId })));

    const user = await prisma.user.findUnique({
        where: { id: studentId },
    });

    if (user) {
        console.log('User found:', user);
    } else {
        console.error('User NOT found!');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
