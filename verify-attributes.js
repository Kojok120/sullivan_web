const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        // Check if we can select attributes
        const problem = await prisma.problem.findFirst({
            select: { id: true, attributes: true }
        });
        console.log('Successfully queried attributes column.');
    } catch (e) {
        console.error('Error querying attributes:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
