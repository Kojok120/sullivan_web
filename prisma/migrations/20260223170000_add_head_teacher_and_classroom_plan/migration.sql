-- Add HEAD_TEACHER role for classroom manager capability
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HEAD_TEACHER';

-- Create classroom plan enum for SaaS feature entitlements
CREATE TYPE "ClassroomPlan" AS ENUM ('STANDARD', 'PREMIUM');

-- Add classroom plan with STANDARD as safe default
ALTER TABLE "Classroom"
ADD COLUMN "plan" "ClassroomPlan" NOT NULL DEFAULT 'STANDARD';
