
FROM node:20-bookworm-slim AS base
# Python and OpenCV dependencies + pyzbar for robust QR detection
# Note: Using pip opencv-python-headless instead of apt python3-opencv
# because apt version is 4.6.0 which lacks QRCodeDetectorAruco (added in 4.8+)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    libgl1 \
    libglib2.0-0 \
    libzbar0 \
    chromium \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages opencv-python-headless pyzbar Pillow

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NODE_OPTIONS_DEFAULT="--max-old-space-size=3584"
ENV NODE_OPTIONS=$NODE_OPTIONS_DEFAULT

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG QSTASH_CURRENT_SIGNING_KEY
ARG QSTASH_NEXT_SIGNING_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV QSTASH_CURRENT_SIGNING_KEY=$QSTASH_CURRENT_SIGNING_KEY
ENV QSTASH_NEXT_SIGNING_KEY=$QSTASH_NEXT_SIGNING_KEY

RUN npm run build

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

COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/server.ts ./server.ts
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

USER nextjs

EXPOSE 8080
ENV BIND_HOST="0.0.0.0"

CMD ["npm", "run", "start"]
