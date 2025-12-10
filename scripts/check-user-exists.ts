
import { prisma } from '../src/lib/prisma';

async function main() {
    const userId = 'cmizbu15r0000jaw8k1aze4bn';
    const user = await prisma.user.findUnique({
        where: { id: userId },
    });
    console.log('User check:', user);
}
main();
