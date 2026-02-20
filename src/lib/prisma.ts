import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        return null;
    }

    const adapter = new PrismaPg({ connectionString: databaseUrl });
    return new PrismaClient({ adapter });
};

type PrismaClientSingleton = PrismaClient;

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClientSingleton | undefined;
};

function getPrismaClient(): PrismaClientSingleton {
    if (globalForPrisma.prisma) {
        return globalForPrisma.prisma;
    }

    const client = prismaClientSingleton();
    if (!client) {
        throw new Error("DATABASE_URL が設定されていません。");
    }

    if (process.env.NODE_ENV !== "production") {
        globalForPrisma.prisma = client;
    }

    return client;
}

// ビルド時は import のみ発生するため、初回アクセスまで接続設定検証を遅延させる。
export const prisma = new Proxy({} as PrismaClientSingleton, {
    get(_target, prop) {
        const client = getPrismaClient();
        const value = (client as unknown as Record<PropertyKey, unknown>)[prop];
        if (typeof value === "function") {
            return (value as (...args: unknown[]) => unknown).bind(client);
        }
        return value;
    },
});

// Trigger reload
