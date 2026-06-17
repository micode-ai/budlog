# BudLog — Collaboration foundation (Project + requests + web portal)

**Issue:** BDL-2 (#2) · **Builds on:** BDL-1 research (`docs/research/2026-06-16-ai-design-generation-feasibility.md`)
**Status:** Design approved — ready for implementation planning.

## 1. Goal

Turn BudLog from a one-way site journal (foreman writes, client reads) into **multi-party
collaboration** inside one company Account: a client submits a plan + requirements as a
**request**, a foreman or designer **accepts** it and acts on it (e.g. runs a design action that
turns the plan into a structured schema), and everyone tracks the work against a **Project**.

## 2. Key decisions (from brainstorm)

1. **Identity:** all parties (client, foreman, designer) live in **one company `Account`**; we
   extend membership with project-scoped roles rather than separate tenants.
2. **Container:** a new **`Project`** umbrella (client's object): `Project → { Requests, DesignArtifacts, Site }`.
   `Site` (construction journal) becomes the *build phase* of a Project.
3. **AI generation** is **provider-agnostic** behind a `DesignProvider` port. Planner 5D is
   enterprise-only (BDL-1), so the MVP provider is **OpenAI Vision** (self-serve, already have the key);
   Planner 5D / Coohom plug in later behind the same interface.
4. **Channels:** **web portal** (authenticated) for client + designer; **Telegram** for the foreman
   (unchanged capture flow) + request notifications. The read-only `/r/[token]` report stays.

## 3. Domain model (Prisma)

New models (all account-scoped; `@@map` snake_case; leading-`accountId`/`projectId` indexes):

- **`Project`** — `id, accountId, name, clientName?, address?, status (lead|design|build|done|archived) @default(lead), createdById, createdAt, updatedAt`. Relations: `account`, `members ProjectMember[]`, `requests Request[]`, `designs DesignArtifact[]`, `sites Site[]`.
- **`ProjectMember`** — `id, projectId, userId, role (foreman|designer|client|manager), createdAt`. `@@unique([projectId, userId])`. Grants project-scoped access + role. (Company-level `AccountMember` still gates login / company membership.)
- **`Request`** — `id, accountId, projectId, createdById, type (plan|design|change|question|other), title, body, status (open|accepted|in_progress|done|declined) @default(open), assigneeRole (foreman|designer)?, assigneeUserId?, createdAt, updatedAt`. Relations: `project`, `messages RequestMessage[]`, `attachments Attachment[]`, `designs DesignArtifact[]`.
- **`RequestMessage`** — `id, requestId, authorUserId, body, createdAt`. The back-and-forth thread.
- **`Attachment`** — `id, accountId, projectId, requestId?, messageId?, kind (plan|photo|doc|design), storage (telegram|file), fileRef (telegram file_id OR stored path), mimeType?, caption?, createdById, createdAt`. Plans/requirements/files.
- **`DesignArtifact`** — `id, accountId, projectId, requestId?, kind (schema|svg|render|external3d), provider (openai|planner5d|coohom|manual), data Json (schema JSON / SVG markup / external URL), createdById, createdAt`. Output of a design action — the AI seam.

Schema change to existing model:
- **`Site`** — add `projectId String? @map("project_id")` + relation to `Project` (`onDelete: SetNull`).
  Existing sites stay project-less; new ones can belong to a Project.

New enums: `ProjectStatus`, `ProjectRole`, `RequestType`, `RequestStatus`, `AttachmentKind`, `AttachmentStorage`, `DesignKind`, `DesignProviderKind`.

## 4. Permissions

Project role → capability (enforced in services, scoped by `accountId` AND `ProjectMember`):

| Capability | client | foreman | designer | manager/owner |
|---|---|---|---|---|
| View project, designs, journal/report | ✓ | ✓ | ✓ | ✓ |
| Create request | ✓ | ✓ | ✓ | ✓ |
| Accept / decline / progress a request | — | ✓ (assigned) | ✓ (assigned) | ✓ |
| Comment in a request thread | ✓ | ✓ | ✓ | ✓ |
| Run a design action / upload design | — | ✓ | ✓ | ✓ |
| Log work/materials/photos (Site journal) | — | ✓ | — | ✓ |
| Manage project members | — | — | — | ✓ |

`manager` is the project-admin **project role**; the company **`owner`** (AccountMember.role) also
gets full access to every project in the account. A `ProjectGuard` resolves the caller's
`ProjectMember` for the `:projectId` (or grants the account `owner`), 404 if neither; service methods
take `(accountId, projectId, userId, role, dto)` and filter every query by both ids.

## 5. Request lifecycle + design-action contract

```
open ──accept──▶ accepted ──start──▶ in_progress ──done──▶ done
  └──────────────decline (assignee/manager)──────────────▶ declined
                         (messages allowed in any non-terminal state)
```
- On an `accepted`/`in_progress` request, the assignee (foreman/designer) can run a **design action**:
  `DesignService.run(provider, projectId, requestId, input)` → calls the `DesignProvider` → persists a
  `DesignArtifact` attached to the request + project. Marking the request `done` is a separate step.

**`DesignProvider` port** (provider-agnostic):
```ts
interface DesignInput { planAttachmentId?: string; requirements?: string; }
interface DesignResult { kind: DesignKind; provider: DesignProviderKind; data: unknown; }
interface DesignProvider { name: DesignProviderKind; generate(input): Promise<DesignResult[]>; }
```
- **MVP impl — `OpenAiVisionProvider`:** plan image → structured schema JSON (rooms, openings,
  approximate dimensions) + a rendered **SVG** floor plan. Runs in the existing OpenAI/LangSmith stack.
  Framed as a **draft** the designer reviews (vision dimensions are approximate — BDL-1 risk note).
- Future impls (separate BDL): `Planner5dProvider`, `CoohomProvider` — same interface.

## 6. Notifications (minimal, cross-channel)

The old `notifications` module was removed; we do NOT resurrect it. Instead a thin `ProjectNotifier`:
- new request / status change / design ready → **foreman:** Telegram message (reuse `TelegramService`);
  **client/designer:** in-portal unread badge (+ email via `MailService` if SMTP configured).
- No new scheduling/queue — fire-and-forget on the triggering action.

## 7. API surface (prefix `/api/v1`, JWT + AccountContext + ProjectGuard)

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET/POST | `/projects` | member / manager | list my projects / create |
| GET/PATCH | `/projects/:id` | member / manager | view / update status |
| GET/POST/DELETE | `/projects/:id/members` | manager | manage participants |
| GET/POST | `/projects/:id/requests` | member | list / create request |
| PATCH | `/projects/:id/requests/:rid` | assignee/manager | accept/decline/progress/done |
| GET/POST | `/projects/:id/requests/:rid/messages` | member | thread |
| POST | `/projects/:id/requests/:rid/attachments` | member | upload plan/doc |
| POST | `/projects/:id/requests/:rid/design` | foreman/designer | run a design action → DesignArtifact |
| GET | `/projects/:id/designs` | member | list design artifacts |
| GET | `/projects/:id/attachments/:aid/file` | member | stream a stored file |

## 8. Web portal (`apps/web`)

- **Auth login** (`/login`) — reuse the existing JWT auth (client/designer are Users). Token in
  memory (same pattern as `/admin`); 401 → login.
- **`/app/projects`** — my projects (from `ProjectMember`).
- **`/app/projects/[id]`** — tabs: **Requests** (list + create + thread + accept/act), **Designs**
  (artifacts: SVG/schema/links), **Journal** (the existing site report, embedded). Plan upload in a request.
- Swiss-minimal, reuses the existing design system (EB Garamond + PT Sans, tokens). i18n PL/RU/UA/EN.
- The public `/r/[token]` read-only report is unchanged.

## 9. File storage

- **Telegram-origin** attachments (foreman photos): keep `file_id` (`storage='telegram'`), proxied as today.
- **Web uploads** (client plans/docs): MVP stores to a **local volume** (`storage='file'`, `fileRef`=path),
  served via the authenticated attachment-file endpoint. **S3 is a future BDL** (swap behind a small `FileStore` port).

## 10. Phasing

- **This spec / BDL-2:** Project + ProjectMember + Request + RequestMessage + Attachment +
  DesignArtifact + `DesignProvider` port + **`OpenAiVisionProvider` MVP** + ProjectNotifier (Telegram/portal)
  + web portal (login, projects, project tabs, request thread, plan upload) + local file storage.
- **Future BDL issues:** Planner 5D / Coohom providers; S3 `FileStore`; richer threads / task board;
  designer marketplace (cross-account) if ever needed.

## 11. Out of scope / non-goals
- Cross-account / marketplace identity (chose single-account).
- Real-time chat / websockets (thread is request/response; notifications are fire-and-forget).
- Survey-grade CAD output (vision schema is a reviewable draft).
- Resurrecting the deleted finance/notifications modules.
