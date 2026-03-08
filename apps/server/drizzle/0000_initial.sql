CREATE TYPE "public"."role" AS ENUM('OWNER', 'EDITOR', 'VIEWER');

CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "vaults" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "vault_members" (
	"id" text PRIMARY KEY NOT NULL,
	"role" "role" DEFAULT 'VIEWER' NOT NULL,
	"user_id" text NOT NULL,
	"vault_id" text NOT NULL
);

CREATE TABLE "vault_files" (
	"id" text PRIMARY KEY NOT NULL,
	"vault_id" text NOT NULL,
	"path" text NOT NULL,
	"hash" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vault_files" ADD CONSTRAINT "vault_files_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "vault_members_user_vault_idx" ON "vault_members" USING btree ("user_id","vault_id");
CREATE UNIQUE INDEX "vault_files_vault_path_idx" ON "vault_files" USING btree ("vault_id","path");
CREATE INDEX "vault_files_vault_id_idx" ON "vault_files" USING btree ("vault_id");
