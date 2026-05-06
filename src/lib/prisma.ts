import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

type PrismaQueryEvent = {
    timestamp: Date;
    query: string;
    params: string;
    duration: number;
    target: string;
};

// PRISMA_SLOW_QUERY_THRESHOLD_MS が正の値なら、その閾値を超えたクエリだけ
// 構造化ログとして出力する。0 / 未設定 / 解析失敗時は計装そのものを無効化し、
// 本番には影響を与えない。
function resolveSlowQueryThresholdMs(): number {
    const raw = process.env.PRISMA_SLOW_QUERY_THRESHOLD_MS;
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
}

const prismaClientSingleton = () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        return null;
    }

    const adapter = new PrismaPg({ connectionString: databaseUrl });
    const slowQueryThresholdMs = resolveSlowQueryThresholdMs();
    const enableQueryLog = slowQueryThresholdMs > 0;

    const client = new PrismaClient({
        adapter,
        ...(enableQueryLog
            ? { log: [{ emit: "event", level: "query" }] }
            : {}),
    });

    if (enableQueryLog) {
        // PrismaClient の型からは $on('query', ...) を引き出せないため最小限の型変換のみ行う。
        const eventClient = client as unknown as {
            $on: (event: "query", listener: (event: PrismaQueryEvent) => void) => void;
        };
        eventClient.$on("query", (event) => {
            if (event.duration >= slowQueryThresholdMs) {
                console.warn(
                    `[prisma:slow-query] duration=${event.duration}ms target=${event.target} query=${event.query}`,
                );
            }
        });
    }

    return client;
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
