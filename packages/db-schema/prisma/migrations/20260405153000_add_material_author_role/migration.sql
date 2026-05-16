-- Add dedicated role for non-engineer problem authoring
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MATERIAL_AUTHOR';
