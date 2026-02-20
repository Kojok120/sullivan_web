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
    const existingClient = globalForPrisma.prisma;
    if (existingClient) {
        return existingClient;
    }

    const client = prismaClientSingleton();
    if (!client) {
        throw new Error("DATABASE_URL が設定されていません。");
    }

    // 本番/開発に関係なくプロセス内で単一インスタンスを再利用する。
    globalForPrisma.prisma = client;

    return client;
}

// ビルド時は import のみ発生するため、初回アクセスまで接続設定検証を遅延させる。
export const prisma = new Proxy({} as PrismaClientSingleton, {
    get(_target, prop) {
        // then を隠して Proxy が Promise-like と誤判定されるのを防ぐ。
        if (prop === "then") {
            return undefined;
        }

        const client = getPrismaClient();

        if (typeof prop !== "string") {
            return Reflect.get(client, prop);
        }

        const value = Reflect.get(client, prop);
        if (typeof value === "function") {
            return (value as (...args: unknown[]) => unknown).bind(client);
        }

        return value;
    },
});
