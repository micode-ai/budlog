-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('personal', 'business', 'shared', 'investment');

-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('owner', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('voice', 'manual', 'photo');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "language" TEXT NOT NULL DEFAULT 'en',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verification_code" TEXT,
    "email_verification_expires_at" TIMESTAMP(3),
    "default_account_id" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "password_reset_code" TEXT,
    "password_reset_expires_at" TIMESTAMP(3),
    "email_change_pending" TEXT,
    "email_change_code" TEXT,
    "email_change_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ai_response_mode" TEXT NOT NULL DEFAULT 'balanced',
    "ai_model" TEXT NOT NULL DEFAULT 'balanced',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'USD',
    "owner_id" TEXT NOT NULL,
    "icon" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_members" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "AccountRole" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_invitations" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "invited_by" TEXT NOT NULL,
    "invited_email" TEXT,
    "invite_code" TEXT NOT NULL,
    "role" "AccountRole" NOT NULL DEFAULT 'editor',
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sender_user_id" TEXT,
    "mentioned_user_ids" TEXT[],
    "tokens_used" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "account_id" TEXT,
    "feature_type" TEXT NOT NULL,
    "cost_units" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT,
    "type" TEXT NOT NULL,
    "recipient_count" INTEGER NOT NULL,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "subject" TEXT,
    "body" TEXT,
    "filters" JSONB,
    "recipient_ids" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_notifications" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "filters" JSONB,
    "user_ids" JSONB,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "executed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "client_name" TEXT,
    "status" "SiteStatus" NOT NULL DEFAULT 'active',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_links" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_entries" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "source" "EntrySource" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_entries" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "work_entry_id" TEXT,
    "entry_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_photos" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "telegram_file_id" TEXT NOT NULL,
    "caption" TEXT,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_links" (
    "id" TEXT NOT NULL,
    "telegram_user_id" TEXT NOT NULL,
    "telegram_username" TEXT,
    "user_id" TEXT NOT NULL,
    "default_account_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "active_site_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_link_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "account_members_account_id_user_id_key" ON "account_members"("account_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_invitations_invite_code_key" ON "account_invitations"("invite_code");

-- CreateIndex
CREATE INDEX "account_invitations_invite_code_idx" ON "account_invitations"("invite_code");

-- CreateIndex
CREATE INDEX "account_invitations_invited_email_idx" ON "account_invitations"("invited_email");

-- CreateIndex
CREATE INDEX "chat_conversations_account_id_updated_at_idx" ON "chat_conversations"("account_id", "updated_at");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_logs_user_id_created_at_idx" ON "usage_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_logs_account_id_user_id_created_at_idx" ON "usage_logs"("account_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_logs_admin_id_created_at_idx" ON "notification_logs"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "scheduled_notifications_status_scheduled_at_idx" ON "scheduled_notifications"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "sites_account_id_status_idx" ON "sites"("account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "report_links_token_key" ON "report_links"("token");

-- CreateIndex
CREATE INDEX "report_links_account_id_site_id_idx" ON "report_links"("account_id", "site_id");

-- CreateIndex
CREATE INDEX "work_entries_account_id_site_id_work_date_idx" ON "work_entries"("account_id", "site_id", "work_date");

-- CreateIndex
CREATE INDEX "material_entries_account_id_site_id_entry_date_idx" ON "material_entries"("account_id", "site_id", "entry_date");

-- CreateIndex
CREATE INDEX "site_photos_account_id_site_id_taken_at_idx" ON "site_photos"("account_id", "site_id", "taken_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_telegram_user_id_key" ON "telegram_links"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_user_id_key" ON "telegram_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_link_codes_code_key" ON "telegram_link_codes"("code");

-- CreateIndex
CREATE INDEX "telegram_link_codes_code_idx" ON "telegram_link_codes"("code");

-- CreateIndex
CREATE INDEX "telegram_link_codes_user_id_idx" ON "telegram_link_codes"("user_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_links" ADD CONSTRAINT "report_links_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_entries" ADD CONSTRAINT "material_entries_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_entries" ADD CONSTRAINT "material_entries_work_entry_id_fkey" FOREIGN KEY ("work_entry_id") REFERENCES "work_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_photos" ADD CONSTRAINT "site_photos_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_default_account_id_fkey" FOREIGN KEY ("default_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
