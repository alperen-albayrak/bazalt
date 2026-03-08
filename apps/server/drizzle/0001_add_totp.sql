ALTER TABLE "users" ADD COLUMN "totp_secret" text;
ALTER TABLE "users" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN "backup_codes" text;
