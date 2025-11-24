import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding ...');

    // Create a test student
    const hashedPassword = await bcrypt.hash('password123', 10);

    const student = await prisma.user.upsert({
        where: { loginId: 'S0001' },
        update: {},
        create: {
            loginId: 'S0001',
            password: hashedPassword,
            name: 'Test Student',
            role: Role.STUDENT,
        },
    });

    // Create a test teacher
    const teacher = await prisma.user.upsert({
        where: { loginId: 'T0001' },
        update: {},
        create: {
            loginId: 'T0001',
            password: hashedPassword,
            name: 'Test Teacher',
            role: Role.TEACHER,
        },
    });

    console.log(`Created users: ${student.name}, ${teacher.name}`);

    // Create an admin user
    const admin = await prisma.user.upsert({
        where: { loginId: 'A0001' },
        update: {},
        create: {
            loginId: 'A0001',
            password: hashedPassword,
            name: 'Admin User',
            role: Role.ADMIN,
        },
    });

    console.log(`Created admin: ${admin.name}`);

    // Create Subjects
    // Create Subjects
    const english = await prisma.subject.upsert({
        where: { name: '英語' },
        update: {},
        create: {
            name: '英語',
            order: 1,
        },
    });

    const math = await prisma.subject.upsert({
        where: { name: '数学' },
        update: {},
        create: {
            name: '数学',
            order: 2,
        },
    });

    const japanese = await prisma.subject.upsert({
        where: { name: '国語' },
        update: {},
        create: {
            name: '国語',
            order: 3,
        },
    });

    console.log(`Created subjects: ${english.name}, ${math.name}, ${japanese.name}`);

    // Create Units for English
    // Create Units for English
    let unit1 = await prisma.unit.findFirst({
        where: {
            name: 'Unit 1: be動詞',
            subjectId: english.id,
        },
    });

    if (!unit1) {
        unit1 = await prisma.unit.create({
            data: {
                name: 'Unit 1: be動詞',
                order: 1,
                subjectId: english.id,
                coreProblems: {
                    create: [
                        {
                            name: 'be動詞の肯定文',
                            order: 1,
                            problems: {
                                create: [
                                    {
                                        question: 'I ( ) a student.',
                                        answer: 'am',
                                        order: 1,
                                        type: 'NORMAL',
                                        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', // Placeholder
                                    },
                                    {
                                        question: 'You ( ) a teacher.',
                                        answer: 'are',
                                        order: 2,
                                        type: 'NORMAL',
                                        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
                                    },
                                    {
                                        question: 'He ( ) my friend.',
                                        answer: 'is',
                                        order: 3,
                                        type: 'NORMAL',
                                        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
                                    },
                                ],
                            },
                        },
                        {
                            name: 'be動詞の否定文',
                            order: 2,
                            problems: {
                                create: [
                                    {
                                        question: 'I ( ) not a doctor.',
                                        answer: 'am',
                                        order: 1,
                                        type: 'NORMAL',
                                    },
                                    {
                                        question: 'She ( ) not happy.',
                                        answer: 'is',
                                        order: 2,
                                        type: 'NORMAL',
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
        });
    }

    let unit2 = await prisma.unit.findFirst({
        where: {
            name: 'Unit 2: 一般動詞',
            subjectId: english.id,
        },
    });

    if (!unit2) {
        unit2 = await prisma.unit.create({
            data: {
                name: 'Unit 2: 一般動詞',
                order: 2,
                subjectId: english.id,
                coreProblems: {
                    create: [
                        {
                            name: '一般動詞の肯定文',
                            order: 1,
                            problems: {
                                create: [
                                    {
                                        question: 'I ( ) tennis.',
                                        answer: 'play',
                                        order: 1,
                                        type: 'NORMAL',
                                    },
                                    {
                                        question: 'He ( ) soccer.',
                                        answer: 'plays',
                                        order: 2,
                                        type: 'NORMAL',
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
        });
    }


    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
