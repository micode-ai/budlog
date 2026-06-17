-- CreateEnum
CREATE TYPE "DesignKind" AS ENUM ('schema', 'svg', 'render', 'external3d');

-- CreateEnum
CREATE TYPE "DesignProviderKind" AS ENUM ('openai', 'planner5d', 'coohom', 'manual');

-- CreateTable
CREATE TABLE "design_artifacts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "request_id" TEXT,
    "kind" "DesignKind" NOT NULL,
    "provider" "DesignProviderKind" NOT NULL,
    "data" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "design_artifacts_account_id_project_id_idx" ON "design_artifacts"("account_id", "project_id");

-- AddForeignKey
ALTER TABLE "design_artifacts" ADD CONSTRAINT "design_artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_artifacts" ADD CONSTRAINT "design_artifacts_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
