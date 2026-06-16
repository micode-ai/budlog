-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('plan', 'design', 'change', 'question', 'other');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('open', 'accepted', 'in_progress', 'done', 'declined');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('plan', 'photo', 'doc', 'design');

-- CreateEnum
CREATE TYPE "AttachmentStorage" AS ENUM ('telegram', 'file');

-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "type" "RequestType" NOT NULL DEFAULT 'other',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'open',
    "assignee_role" "ProjectRole",
    "assignee_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_messages" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "request_id" TEXT,
    "kind" "AttachmentKind" NOT NULL,
    "storage" "AttachmentStorage" NOT NULL,
    "file_ref" TEXT NOT NULL,
    "mime_type" TEXT,
    "caption" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requests_account_id_project_id_status_idx" ON "requests"("account_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "request_messages_request_id_created_at_idx" ON "request_messages"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "attachments_account_id_project_id_idx" ON "attachments"("account_id", "project_id");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_messages" ADD CONSTRAINT "request_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
