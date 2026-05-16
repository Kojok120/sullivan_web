CREATE TABLE "distributed_locks" (
    "key" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributed_locks_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "distributed_locks_expires_at_idx" ON "distributed_locks"("expires_at");

CREATE TABLE "drive_watch_states" (
    "scope_key" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "token" TEXT,
    "expiration" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_watch_states_pkey" PRIMARY KEY ("scope_key")
);
