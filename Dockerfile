ARG WEB_BASE_IMAGE

FROM ${WEB_BASE_IMAGE} AS base

FROM base AS deps
WORKDIR /app
RUN npm install -g pnpm@10.11.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY packages/config/package.json ./packages/config/package.json
COPY packages/db-schema/package.json ./packages/db-schema/package.json
COPY packages/db-schema/prisma ./packages/db-schema/prisma
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NODE_OPTIONS_DEFAULT="--max-old-space-size=3584"
ENV NODE_OPTIONS=$NODE_OPTIONS_DEFAULT

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS=$NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS

# Next.js standalone 出力 (.next/standalone) と custom server bundle (dist/server.js) を生成
# build-server.mjs に `web` を渡し、worker bundle が image に紛れ込まないようにする
RUN pnpm run build && node scripts/build-server.mjs web

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV HOME=/home/nextjs
ENV XDG_CONFIG_HOME=/tmp/.chromium-config
ENV XDG_CACHE_HOME=/tmp/.chromium-cache
ENV XDG_DATA_HOME=/tmp/.chromium-data
ARG NODE_OPTIONS_DEFAULT="--max-old-space-size=3584"
ENV NODE_OPTIONS=$NODE_OPTIONS_DEFAULT

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN mkdir -p /home/nextjs /tmp/.chromium-config /tmp/.chromium-cache /tmp/.chromium-data /tmp/.chromium-user-data /tmp/.chromium-crashpad \
    && chown -R nextjs:nodejs /home/nextjs /tmp/.chromium-config /tmp/.chromium-cache /tmp/.chromium-data /tmp/.chromium-user-data /tmp/.chromium-crashpad

# standalone 本体（trace 済みの最小 node_modules + .next/server 等）を /app 直下に展開
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# .next/static は standalone に含まれないので個別に同梱
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# bundle した custom server
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
# instructions/ は runtime に process.cwd()/instructions で読まれる
COPY --from=builder --chown=nextjs:nodejs /app/instructions ./instructions
# scripts/qr_reader.py は grading-service が実行する
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs

EXPOSE 8080
ENV BIND_HOST="0.0.0.0"

CMD ["node", "dist/server.js"]
