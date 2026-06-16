# BDL-4 — Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client↔foreman↔designer **requests** inside a Project: typed requests with a status lifecycle, a message thread, and file attachments (web uploads to local storage) — the core collaboration interaction.

**Architecture:** New Prisma models `Request` + `RequestMessage` + `Attachment` (account + project scoped). A `requests` NestJS module mounted under `/projects/:id/requests`, protected by the existing `ProjectGuard` (BDL-3) + `JwtAuthGuard` + `AccountContextGuard`. Writes are blocked for `viewer` account-role; status transitions are limited to the request's assignee (role/user) or the project `manager`. Uploaded files go through a small local `FileStore` port (S3 later).

**Tech Stack:** NestJS 10, Prisma 5, Multer (`@nestjs/platform-express` `FileInterceptor`, memory storage), Jest (mocked-Prisma service specs).

**Spec:** `docs/specs/2026-06-16-collaboration-foundation-design.md` · **Issue:** BDL-4 (#4) · **Depends on:** BDL-3 (#3 — `Project`, `ProjectMember`, `ProjectGuard`).

**Conventions:** `apps/api/src/modules/projects/` (BDL-3) and `sites/` are the references — `(accountId, …)` signatures, every query filtered by `accountId`, `ProjectGuard` sets `req.projectRole`, `ViewerBlockGuard` on write routes, `NotFoundException`/`ForbiddenException`/`BadRequestException`. Run `npx`/`npm` from `apps/api/`. Stop the dev server before any `prisma migrate`/`generate` (Windows DLL lock).

---

### Task 1: Schema — `Request`, `RequestMessage`, `Attachment`

**Files:** Modify `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add enums** (after `ProjectRole`):

```prisma
enum RequestType {
  plan
  design
  change
  question
  other
}

enum RequestStatus {
  open
  accepted
  in_progress
  done
  declined
}

enum AttachmentKind {
  plan
  photo
  doc
  design
}

enum AttachmentStorage {
  telegram
  file
}
```

- [ ] **Step 2: Add models** (before `// ── Telegram ──`):

```prisma
model Request {
  id             String        @id @default(uuid())
  accountId      String        @map("account_id")
  projectId      String        @map("project_id")
  createdById    String        @map("created_by_id")
  type           RequestType   @default(other)
  title          String
  body           String
  status         RequestStatus @default(open)
  assigneeRole   ProjectRole?  @map("assignee_role")
  assigneeUserId String?       @map("assignee_user_id")
  createdAt      DateTime      @default(now()) @map("created_at")
  updatedAt      DateTime      @updatedAt @map("updated_at")

  project     Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  messages    RequestMessage[]
  attachments Attachment[]

  @@index([accountId, projectId, status])
  @@map("requests")
}

model RequestMessage {
  id           String   @id @default(uuid())
  requestId    String   @map("request_id")
  authorUserId String   @map("author_user_id")
  body         String
  createdAt    DateTime @default(now()) @map("created_at")

  request Request @relation(fields: [requestId], references: [id], onDelete: Cascade)

  @@index([requestId, createdAt])
  @@map("request_messages")
}

model Attachment {
  id          String            @id @default(uuid())
  accountId   String            @map("account_id")
  projectId   String            @map("project_id")
  requestId   String?           @map("request_id")
  kind        AttachmentKind
  storage     AttachmentStorage
  fileRef     String            @map("file_ref")
  mimeType    String?           @map("mime_type")
  caption     String?
  createdById String            @map("created_by_id")
  createdAt   DateTime          @default(now()) @map("created_at")

  project Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  request Request? @relation(fields: [requestId], references: [id], onDelete: SetNull)

  @@index([accountId, projectId])
  @@map("attachments")
}
```

- [ ] **Step 3: Back-relations on `Project`** — inside `model Project { ... }`, next to `members`/`sites`, add:

```prisma
  requests    Request[]
  attachments Attachment[]
```

- [ ] **Step 4: Migrate** (dev server stopped):

```bash
npx prisma validate && npx prisma format
npx prisma migrate dev --name add_requests
npx prisma generate
```
Expected: valid; migration `*_add_requests`; client generated. (EPERM on generate → kill stray `budlog` node, re-run generate.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): BDL-4 Request, RequestMessage, Attachment models

Refs #4"
```

---

### Task 2: `RequestsService` — create + list + DTOs

**Files:**
- Create: `apps/api/src/modules/requests/dto/index.ts`
- Create: `apps/api/src/modules/requests/requests.service.ts`
- Test: `apps/api/src/modules/requests/requests.service.spec.ts`

- [ ] **Step 1: DTOs** (`dto/index.ts`):

```ts
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { RequestType, RequestStatus, ProjectRole, AttachmentKind } from '@prisma/client';

export class CreateRequestDto {
  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsEnum(RequestType)
  type?: RequestType;

  @IsOptional()
  @IsEnum(ProjectRole)
  assigneeRole?: ProjectRole;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;
}

export class TransitionRequestDto {
  @IsEnum(['accept', 'decline', 'start', 'done'])
  action: 'accept' | 'decline' | 'start' | 'done';
}

export class CreateMessageDto {
  @IsString()
  body: string;
}

export class CreateAttachmentDto {
  @IsOptional()
  @IsEnum(AttachmentKind)
  kind?: AttachmentKind;

  @IsOptional()
  @IsString()
  caption?: string;
}
```

- [ ] **Step 2: Failing test** (`requests.service.spec.ts`):

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RequestsService } from './requests.service';

function makeService() {
  const prisma: any = {
    request: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'r1', status: 'open', ...a.data })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
    },
    requestMessage: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'msg1', ...a.data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const fileStore: any = { save: jest.fn(), read: jest.fn() };
  return { service: new RequestsService(prisma, fileStore), prisma };
}

describe('RequestsService — create/list', () => {
  it('createRequest stamps account/project/creator', async () => {
    const { service, prisma } = makeService();
    await service.createRequest('acc-1', 'p1', 'u1', { title: 'Plan', body: 'see attached', type: 'plan' });
    expect(prisma.request.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc-1', projectId: 'p1', createdById: 'u1', title: 'Plan', body: 'see attached', type: 'plan',
      }),
    });
  });

  it('listRequests filters by account + project', async () => {
    const { service, prisma } = makeService();
    await service.listRequests('acc-1', 'p1');
    expect(prisma.request.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-1', projectId: 'p1' } }),
    );
  });
});
```

- [ ] **Step 3: Run → fails**

Run: `npx jest requests.service`
Expected: FAIL — cannot find `./requests.service`.

- [ ] **Step 4: Service** (`requests.service.ts`) — create + list + a shared `assertRequest`:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { FileStore } from './file-store.service';
import { CreateRequestDto, TransitionRequestDto, CreateMessageDto, CreateAttachmentDto } from './dto';

const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  accept: { from: ['open'], to: 'accepted' },
  decline: { from: ['open', 'accepted', 'in_progress'], to: 'declined' },
  start: { from: ['accepted'], to: 'in_progress' },
  done: { from: ['accepted', 'in_progress'], to: 'done' },
};

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStore: FileStore,
  ) {}

  createRequest(accountId: string, projectId: string, userId: string, dto: CreateRequestDto) {
    return this.prisma.request.create({
      data: {
        accountId,
        projectId,
        createdById: userId,
        title: dto.title,
        body: dto.body,
        type: dto.type ?? 'other',
        assigneeRole: dto.assigneeRole,
        assigneeUserId: dto.assigneeUserId,
      },
    });
  }

  listRequests(accountId: string, projectId: string) {
    return this.prisma.request.findMany({
      where: { accountId, projectId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Loads a request scoped to account+project, or throws 404. */
  private async assertRequest(accountId: string, projectId: string, requestId: string) {
    const req = await this.prisma.request.findFirst({
      where: { id: requestId, accountId, projectId },
    });
    if (!req) throw new NotFoundException('Request not found');
    return req;
  }
}
```

- [ ] **Step 5: Run → passes**

Run: `npx jest requests.service`
Expected: PASS (2).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/requests/dto/index.ts apps/api/src/modules/requests/requests.service.ts apps/api/src/modules/requests/requests.service.spec.ts
git commit -m "feat(requests): BDL-4 createRequest + listRequests

Refs #4"
```

> Note: the service imports `./file-store.service` (created in Task 5). Until then the spec injects a
> stub `fileStore`. If `tsc` is run before Task 5, it will error on the missing import — that's expected;
> run `npx jest requests.service` (ts-jest compiles per-file) for this task, and `tsc` after Task 5.

---

### Task 3: `getRequest` + `transition` (lifecycle + permissions)

**Files:** Modify `requests.service.ts`, `requests.service.spec.ts`

Permissions: the project `manager` may always transition; otherwise only the request's assignee
(`assigneeUserId === userId`, or `assigneeRole === projectRole`) may. Reads are open to any member.

- [ ] **Step 1: Failing tests** — append:

```ts
describe('RequestsService — get/transition', () => {
  it('getRequest returns a scoped request with thread + attachments', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue({ id: 'r1', status: 'open' });
    await service.getRequest('acc-1', 'p1', 'r1');
    expect(prisma.request.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1', accountId: 'acc-1', projectId: 'p1' } }),
    );
  });

  it('transition accept: open → accepted by the assignee role', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue({ id: 'r1', status: 'open', assigneeRole: 'designer', assigneeUserId: null });
    await service.transition('acc-1', 'p1', 'r1', { action: 'accept' }, { userId: 'u1', projectRole: 'designer' });
    expect(prisma.request.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'accepted' } });
  });

  it('transition forbidden for a non-assignee non-manager', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue({ id: 'r1', status: 'open', assigneeRole: 'designer', assigneeUserId: null });
    await expect(
      service.transition('acc-1', 'p1', 'r1', { action: 'accept' }, { userId: 'u9', projectRole: 'client' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.request.update).not.toHaveBeenCalled();
  });

  it('transition rejects an illegal state change', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue({ id: 'r1', status: 'done', assigneeUserId: 'u1' });
    await expect(
      service.transition('acc-1', 'p1', 'r1', { action: 'start' }, { userId: 'u1', projectRole: 'manager' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: Run → fails**

Run: `npx jest requests.service`
Expected: FAIL — `service.getRequest is not a function`.

- [ ] **Step 3: Add methods**:

```ts
  getRequest(accountId: string, projectId: string, requestId: string) {
    return this.prisma.request
      .findFirst({
        where: { id: requestId, accountId, projectId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          attachments: { orderBy: { createdAt: 'asc' } },
        },
      })
      .then((r) => {
        if (!r) throw new NotFoundException('Request not found');
        return r;
      });
  }

  async transition(
    accountId: string,
    projectId: string,
    requestId: string,
    dto: TransitionRequestDto,
    actor: { userId: string; projectRole: string },
  ) {
    const request = await this.assertRequest(accountId, projectId, requestId);

    const isManager = actor.projectRole === 'manager';
    const isAssignee =
      (request.assigneeUserId && request.assigneeUserId === actor.userId) ||
      (request.assigneeRole && request.assigneeRole === actor.projectRole);
    if (!isManager && !isAssignee) {
      throw new ForbiddenException('Only the assignee or a project manager can change this request');
    }

    const rule = TRANSITIONS[dto.action];
    if (!rule || !rule.from.includes(request.status)) {
      throw new BadRequestException(`Cannot ${dto.action} a request in status "${request.status}"`);
    }
    return this.prisma.request.update({ where: { id: requestId }, data: { status: rule.to } });
  }
```

- [ ] **Step 4: Run → passes**

Run: `npx jest requests.service`
Expected: PASS (6).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/requests/requests.service.ts apps/api/src/modules/requests/requests.service.spec.ts
git commit -m "feat(requests): BDL-4 getRequest + lifecycle transitions

Refs #4"
```

---

### Task 4: Message thread

**Files:** Modify `requests.service.ts`, `requests.service.spec.ts`

- [ ] **Step 1: Failing tests** — append:

```ts
describe('RequestsService — messages', () => {
  it('addMessage attaches to a scoped request', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue({ id: 'r1', status: 'open' });
    await service.addMessage('acc-1', 'p1', 'r1', 'u1', { body: 'hello' });
    expect(prisma.requestMessage.create).toHaveBeenCalledWith({
      data: { requestId: 'r1', authorUserId: 'u1', body: 'hello' },
    });
  });

  it('addMessage 404s for a request outside the project', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue(null);
    await expect(service.addMessage('acc-1', 'p1', 'rX', 'u1', { body: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listMessages returns the thread', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue({ id: 'r1' });
    await service.listMessages('acc-1', 'p1', 'r1');
    expect(prisma.requestMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { requestId: 'r1' } }),
    );
  });
});
```

- [ ] **Step 2: Run → fails**

Run: `npx jest requests.service`
Expected: FAIL — `service.addMessage is not a function`.

- [ ] **Step 3: Add methods**:

```ts
  async addMessage(accountId: string, projectId: string, requestId: string, userId: string, dto: CreateMessageDto) {
    await this.assertRequest(accountId, projectId, requestId);
    return this.prisma.requestMessage.create({
      data: { requestId, authorUserId: userId, body: dto.body },
    });
  }

  async listMessages(accountId: string, projectId: string, requestId: string) {
    await this.assertRequest(accountId, projectId, requestId);
    return this.prisma.requestMessage.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });
  }
```

- [ ] **Step 4: Run → passes**

Run: `npx jest requests.service`
Expected: PASS (9).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/requests/requests.service.ts apps/api/src/modules/requests/requests.service.spec.ts
git commit -m "feat(requests): BDL-4 message thread

Refs #4"
```

---

### Task 5: `FileStore` + attachments (upload / list / stream)

**Files:**
- Create: `apps/api/src/modules/requests/file-store.service.ts`
- Test: `apps/api/src/modules/requests/file-store.service.spec.ts`
- Modify: `requests.service.ts`, `requests.service.spec.ts`

- [ ] **Step 1: FileStore failing test** (`file-store.service.spec.ts`):

```ts
import { FileStore } from './file-store.service';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('FileStore', () => {
  const dir = join(tmpdir(), 'budlog-filestore-test');
  const config: any = { get: (k: string, d?: any) => (k === 'UPLOAD_DIR' ? dir : d) };

  afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('saves a buffer and reads it back; rejects path traversal', async () => {
    const store = new FileStore(config);
    const { fileRef } = await store.save(Buffer.from('hello'), 'txt');
    expect(fileRef).toMatch(/^[a-f0-9]{32}\.txt$/); // generated name only, no dirs
    const back = await store.read(fileRef);
    expect(back.toString()).toBe('hello');
    await expect(store.read('../../etc/passwd')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run → fails**

Run: `npx jest file-store`
Expected: FAIL — cannot find `./file-store.service`.

- [ ] **Step 3: FileStore** (`file-store.service.ts`):

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join, basename } from 'path';

/** Local-disk file store for web uploads. Filenames are generated (no user input in the path);
 *  S3 can replace this behind the same two-method interface later. */
@Injectable()
export class FileStore {
  private readonly dir: string;

  constructor(config: ConfigService) {
    this.dir = config.get<string>('UPLOAD_DIR', 'uploads');
  }

  async save(buffer: Buffer, ext: string): Promise<{ fileRef: string }> {
    await fs.mkdir(this.dir, { recursive: true });
    const safeExt = (ext || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
    const name = `${randomBytes(16).toString('hex')}.${safeExt}`;
    await fs.writeFile(join(this.dir, name), buffer);
    return { fileRef: name };
  }

  async read(fileRef: string): Promise<Buffer> {
    // Only generated basenames are valid — reject anything with path separators.
    if (basename(fileRef) !== fileRef) throw new BadRequestException('Invalid file reference');
    return fs.readFile(join(this.dir, fileRef));
  }
}
```

- [ ] **Step 4: Run → passes**

Run: `npx jest file-store`
Expected: PASS (1).

- [ ] **Step 5: Attachment service tests** — append to `requests.service.spec.ts` (add `attachment` to the prisma mock at the top of `makeService`):

In `makeService`, add to the `prisma` object:
```ts
    attachment: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'a1', ...a.data })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
```
Then append:
```ts
describe('RequestsService — attachments', () => {
  it('addAttachment saves the file and records storage=file', async () => {
    const { service, prisma } = makeService();
    (service as any).fileStore.save.mockResolvedValue({ fileRef: 'abc.png' });
    prisma.request.findFirst.mockResolvedValue({ id: 'r1' });
    await service.addAttachment('acc-1', 'p1', 'r1', 'u1', Buffer.from('x'), 'image/png', { kind: 'plan' });
    expect((service as any).fileStore.save).toHaveBeenCalled();
    expect(prisma.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc-1', projectId: 'p1', requestId: 'r1', createdById: 'u1',
        kind: 'plan', storage: 'file', fileRef: 'abc.png', mimeType: 'image/png',
      }),
    });
  });

  it('getAttachmentFile reads a scoped file attachment', async () => {
    const { service, prisma } = makeService();
    prisma.attachment.findFirst.mockResolvedValue({ id: 'a1', storage: 'file', fileRef: 'abc.png', mimeType: 'image/png' });
    (service as any).fileStore.read.mockResolvedValue(Buffer.from('data'));
    const out = await service.getAttachmentFile('acc-1', 'p1', 'a1');
    expect(prisma.attachment.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', accountId: 'acc-1', projectId: 'p1' },
    });
    expect(out.buffer.toString()).toBe('data');
    expect(out.mimeType).toBe('image/png');
  });
});
```

- [ ] **Step 6: Add attachment methods** to `RequestsService`:

```ts
  async addAttachment(
    accountId: string,
    projectId: string,
    requestId: string,
    userId: string,
    buffer: Buffer,
    mimeType: string | undefined,
    dto: CreateAttachmentDto,
  ) {
    await this.assertRequest(accountId, projectId, requestId);
    const ext = (mimeType?.split('/')[1] || 'bin').toLowerCase();
    const { fileRef } = await this.fileStore.save(buffer, ext);
    return this.prisma.attachment.create({
      data: {
        accountId,
        projectId,
        requestId,
        createdById: userId,
        kind: dto.kind ?? 'doc',
        storage: 'file',
        fileRef,
        mimeType,
        caption: dto.caption,
      },
    });
  }

  listAttachments(accountId: string, projectId: string, requestId: string) {
    return this.prisma.attachment.findMany({
      where: { accountId, projectId, requestId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getAttachmentFile(accountId: string, projectId: string, attachmentId: string) {
    const att = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, accountId, projectId },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    if (att.storage !== 'file') throw new NotFoundException('File not available');
    const buffer = await this.fileStore.read(att.fileRef);
    return { buffer, mimeType: att.mimeType ?? 'application/octet-stream' };
  }
```

- [ ] **Step 7: Run → passes**

Run: `npx jest requests.service file-store`
Expected: PASS (11 service + 1 file-store).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/requests/file-store.service.ts apps/api/src/modules/requests/file-store.service.spec.ts apps/api/src/modules/requests/requests.service.ts apps/api/src/modules/requests/requests.service.spec.ts
git commit -m "feat(requests): BDL-4 FileStore + attachments (upload/list/stream)

Refs #4"
```

---

### Task 6: Controller + module + wiring

**Files:**
- Create: `apps/api/src/modules/requests/requests.controller.ts`
- Create: `apps/api/src/modules/requests/requests.module.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/.env` + `.env.example` (add `UPLOAD_DIR`)

- [ ] **Step 1: Controller** (`requests.controller.ts`) — mounted at `projects/:id/requests`, every route under `ProjectGuard`:

```ts
import {
  Controller, Get, Post, Patch, Body, Param, UseGuards, Req, Res,
  UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { ProjectGuard } from '../projects/guards/project.guard';
import { AuthenticatedRequest } from '../../common/types';
import { RequestsService } from './requests.service';
import { CreateRequestDto, TransitionRequestDto, CreateMessageDto, CreateAttachmentDto } from './dto';

type ProjectRequest = AuthenticatedRequest & { projectRole?: string };

@Controller('projects/:id/requests')
@UseGuards(JwtAuthGuard, AccountContextGuard, ProjectGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Param('id') projectId: string) {
    return this.requests.listRequests(req.accountId, projectId);
  }

  @Post()
  @UseGuards(ViewerBlockGuard)
  create(@Req() req: AuthenticatedRequest, @Param('id') projectId: string, @Body() dto: CreateRequestDto) {
    return this.requests.createRequest(req.accountId, projectId, req.user.id, dto);
  }

  @Get(':rid')
  get(@Req() req: AuthenticatedRequest, @Param('id') projectId: string, @Param('rid') rid: string) {
    return this.requests.getRequest(req.accountId, projectId, rid);
  }

  @Patch(':rid')
  @UseGuards(ViewerBlockGuard)
  transition(@Req() req: ProjectRequest, @Param('id') projectId: string, @Param('rid') rid: string, @Body() dto: TransitionRequestDto) {
    return this.requests.transition(req.accountId, projectId, rid, dto, {
      userId: req.user.id,
      projectRole: req.projectRole ?? '',
    });
  }

  @Get(':rid/messages')
  messages(@Req() req: AuthenticatedRequest, @Param('id') projectId: string, @Param('rid') rid: string) {
    return this.requests.listMessages(req.accountId, projectId, rid);
  }

  @Post(':rid/messages')
  @UseGuards(ViewerBlockGuard)
  addMessage(@Req() req: AuthenticatedRequest, @Param('id') projectId: string, @Param('rid') rid: string, @Body() dto: CreateMessageDto) {
    return this.requests.addMessage(req.accountId, projectId, rid, req.user.id, dto);
  }

  @Get(':rid/attachments')
  attachments(@Req() req: AuthenticatedRequest, @Param('id') projectId: string, @Param('rid') rid: string) {
    return this.requests.listAttachments(req.accountId, projectId, rid);
  }

  @Post(':rid/attachments')
  @UseGuards(ViewerBlockGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  addAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id') projectId: string,
    @Param('rid') rid: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
    @Body() dto: CreateAttachmentDto,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.requests.addAttachment(req.accountId, projectId, rid, req.user.id, file.buffer, file.mimetype, dto);
  }

  @Get('attachments/:aid/file')
  async getFile(@Req() req: AuthenticatedRequest, @Param('id') projectId: string, @Param('aid') aid: string, @Res() res: Response) {
    const { buffer, mimeType } = await this.requests.getAttachmentFile(req.accountId, projectId, aid);
    res.setHeader('Content-Type', mimeType);
    res.send(buffer);
  }
}
```

- [ ] **Step 2: Module** (`requests.module.ts`):

```ts
import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { FileStore } from './file-store.service';

@Module({
  controllers: [RequestsController],
  providers: [RequestsService, FileStore],
  exports: [RequestsService],
})
export class RequestsModule {}
```

- [ ] **Step 3: Register in `app.module.ts`** — import and add `RequestsModule` to `imports` next to `ProjectsModule`:

```ts
import { RequestsModule } from './modules/requests/requests.module';
// ...
    ProjectsModule,
    RequestsModule,
```

- [ ] **Step 4: Add `UPLOAD_DIR`** to `apps/api/.env` and `.env.example`:

```
UPLOAD_DIR=uploads
```
Also add `uploads/` to the repo root `.gitignore` (uploaded files must not be committed):
```
uploads/
```

- [ ] **Step 5: Typecheck + tests**

```bash
npx tsc --noEmit
npx jest requests file-store
```
Expected: tsc exit 0; all requests + file-store tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/requests/requests.controller.ts apps/api/src/modules/requests/requests.module.ts apps/api/src/app.module.ts apps/api/.env.example .gitignore
git commit -m "feat(requests): BDL-4 controller + module + wiring (UPLOAD_DIR)

Refs #4"
```

---

### Task 7: Live smoke + close BDL-4

**Files:** none

- [ ] **Step 1: Boot the API** (from `apps/api/`): `npm run dev` → healthy.

- [ ] **Step 2: Smoke the request flow** (needs a project from BDL-3; create one if needed):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"alice@test.com","password":"TestPass123"}' | grep -o '"accessToken":"[^"]*"' | sed 's/.*:"//;s/"//')
ACC=$(curl -s http://localhost:3000/api/v1/accounts -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
H1="Authorization: Bearer $TOKEN"; H2="X-Account-Id: $ACC"
PID=$(curl -s -X POST http://localhost:3000/api/v1/projects -H "$H1" -H "$H2" -H "Content-Type: application/json" -d '{"name":"P-req"}' | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
# create request
RID=$(curl -s -X POST http://localhost:3000/api/v1/projects/$PID/requests -H "$H1" -H "$H2" -H "Content-Type: application/json" -d '{"title":"My plan","body":"please review","type":"plan","assigneeRole":"designer"}' | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
echo "request: $RID"
# accept (alice is manager → allowed)
curl -s -X PATCH http://localhost:3000/api/v1/projects/$PID/requests/$RID -H "$H1" -H "$H2" -H "Content-Type: application/json" -d '{"action":"accept"}' | grep -o '"status":"[^"]*"'
# message
curl -s -X POST http://localhost:3000/api/v1/projects/$PID/requests/$RID/messages -H "$H1" -H "$H2" -H "Content-Type: application/json" -d '{"body":"on it"}' -o /dev/null -w 'msg [%{http_code}]\n'
# upload attachment + read it back
echo "floor plan" > /tmp/plan.txt
AID=$(curl -s -X POST http://localhost:3000/api/v1/projects/$PID/requests/$RID/attachments -H "$H1" -H "$H2" -F "file=@/tmp/plan.txt" -F "kind=plan" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
curl -s http://localhost:3000/api/v1/projects/$PID/requests/attachments/$AID/file -H "$H1" -H "$H2"
# get request (with thread + attachments)
curl -s http://localhost:3000/api/v1/projects/$PID/requests/$RID -H "$H1" -H "$H2" | head -c 400; echo
```
Expected: request created; accept → `accepted`; message 201; attachment uploaded and its file streams back `floor plan`; get → request with the message + attachment included.

- [ ] **Step 3: Stop the dev server, final commit + close**

```bash
git commit --allow-empty -m "chore(requests): BDL-4 requests verified

Closes #4"
git push origin main
```

---

## Definition of done
- `Request`/`RequestMessage`/`Attachment` models + migration.
- `requests` module under `/projects/:id/requests`: create/list/get, lifecycle transitions (assignee/manager only), message thread, attachment upload/list/stream via local `FileStore`. Account+project scoped; `viewer` blocked from writes.
- `npx tsc --noEmit` clean; `npx jest requests file-store` green; live smoke passes.
- BDL-4 closed; commits reference `#4`.
