# BDL-3 — Projects foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `Project` umbrella (with project-scoped membership/roles) and a `projects` API module, so a company account can group work into client projects — the foundation for collaboration (BDL-2).

**Architecture:** New Prisma models `Project` + `ProjectMember` (project-scoped role) and `Site.projectId`. A `projects` NestJS module follows the canonical pattern (`JwtAuthGuard` + `AccountContextGuard`, `(accountId, userId, dto)` service signature, every query filtered by `accountId`). A `ProjectGuard` resolves the caller's `ProjectMember` (or grants the account `owner`) for `:id` routes. Membership is enforced in services; writes that manage the project require `manager`/owner.

**Tech Stack:** NestJS 10, Prisma 5 (PostgreSQL), Jest (service specs with a mocked `PrismaService`).

**Spec:** `docs/specs/2026-06-16-collaboration-foundation-design.md` · **Issue:** BDL-3 (#3)

**Conventions to follow (read first):** `apps/api/src/modules/sites/` is the canonical reference
(account scoping, `assertSite` pattern, `ViewerBlockGuard`), and `apps/api/src/modules/accounts/guards/account-role.guard.ts` for the guard pattern. Run all `npx`/`npm` commands from `apps/api/`.

---

### Task 1: Schema — `Project`, `ProjectMember`, `Site.projectId`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add enums** after the existing `EntrySource` enum block:

```prisma
enum ProjectStatus {
  lead
  design
  build
  done
  archived
}

enum ProjectRole {
  foreman
  designer
  client
  manager
}
```

- [ ] **Step 2: Add the `Project` and `ProjectMember` models** (place them just before `// ── Telegram ──`):

```prisma
model Project {
  id          String        @id @default(uuid())
  accountId   String        @map("account_id")
  name        String
  clientName  String?       @map("client_name")
  address     String?
  status      ProjectStatus @default(lead)
  createdById String        @map("created_by_id")
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  account Account         @relation(fields: [accountId], references: [id], onDelete: Cascade)
  members ProjectMember[]
  sites   Site[]

  @@index([accountId, status])
  @@map("projects")
}

model ProjectMember {
  id        String      @id @default(uuid())
  projectId String      @map("project_id")
  userId    String      @map("user_id")
  role      ProjectRole
  createdAt DateTime    @default(now()) @map("created_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([userId])
  @@map("project_members")
}
```

- [ ] **Step 3: Add the back-relation on `Account`** — inside `model Account { ... }`, next to `sites Site[]` add:

```prisma
  projects          Project[]
```

- [ ] **Step 4: Add the back-relation on `User`** — inside `model User { ... }` Relations block, add:

```prisma
  projectMembers    ProjectMember[]
```

- [ ] **Step 5: Add `projectId` to `Site`** — inside `model Site { ... }`, add the field and relation:

```prisma
  projectId       String?         @map("project_id")
  project         Project?        @relation(fields: [projectId], references: [id], onDelete: SetNull)
```

- [ ] **Step 6: Validate + migrate + generate**

If the API dev server is running, stop it first (it locks the Prisma engine on Windows).

Run (from `apps/api/`):
```bash
npx prisma validate && npx prisma format
npx prisma migrate dev --name add_projects
npx prisma generate
```
Expected: `The schema ... is valid`, a migration `*_add_projects` applied, client generated.
If `generate` fails with `EPERM ... query_engine`, kill the stray node process holding it and re-run `npx prisma generate`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): BDL-3 Project + ProjectMember models, Site.projectId

Refs #3"
```

---

### Task 2: `ProjectsService.createProject` + `listProjects`

**Files:**
- Create: `apps/api/src/modules/projects/projects.service.ts`
- Create: `apps/api/src/modules/projects/dto/index.ts`
- Test: `apps/api/src/modules/projects/projects.service.spec.ts`

- [ ] **Step 1: Write the DTOs** (`dto/index.ts`):

```ts
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(['lead', 'design', 'build', 'done', 'archived'])
  status?: 'lead' | 'design' | 'build' | 'done' | 'archived';
}

export class AddMemberDto {
  @IsString()
  userId: string;

  @IsEnum(['foreman', 'designer', 'client', 'manager'])
  role: 'foreman' | 'designer' | 'client' | 'manager';
}
```

- [ ] **Step 2: Write the failing test** (`projects.service.spec.ts`):

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';

function makeService() {
  const prisma: any = {
    project: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'p1', ...a.data })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
    },
    projectMember: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'm1', ...a.data })),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // $transaction runs the callback with the prisma mock
    $transaction: jest.fn((fn: any) => fn(prisma)),
  };
  return { service: new ProjectsService(prisma), prisma };
}

describe('ProjectsService — create/list', () => {
  it('createProject stamps accountId + creator and adds creator as manager member', async () => {
    const { service, prisma } = makeService();
    await service.createProject('acc-1', 'user-1', { name: 'Dom Kowalski' });
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accountId: 'acc-1', createdById: 'user-1', name: 'Dom Kowalski' }),
    });
    expect(prisma.projectMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: 'p1', userId: 'user-1', role: 'manager' }),
    });
  });

  it('listProjects returns account projects the user is a member of (owner sees all)', async () => {
    const { service, prisma } = makeService();
    await service.listProjects('acc-1', 'user-1', 'editor');
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'acc-1', members: { some: { userId: 'user-1' } } },
      }),
    );
    await service.listProjects('acc-1', 'owner-1', 'owner');
    expect(prisma.project.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-1' } }),
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest projects.service`
Expected: FAIL — `Cannot find module './projects.service'`.

- [ ] **Step 4: Write the minimal service** (`projects.service.ts`):

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto, UpdateProjectDto, AddMemberDto } from './dto';

type AccountRole = 'owner' | 'editor' | 'viewer';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProject(accountId: string, userId: string, dto: CreateProjectDto) {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          accountId,
          createdById: userId,
          name: dto.name,
          clientName: dto.clientName,
          address: dto.address,
        },
      });
      await tx.projectMember.create({
        data: { projectId: project.id, userId, role: 'manager' },
      });
      return project;
    });
  }

  /** Account owners see all projects; everyone else sees projects they're a member of. */
  listProjects(accountId: string, userId: string, accountRole: AccountRole) {
    const where =
      accountRole === 'owner'
        ? { accountId }
        : { accountId, members: { some: { userId } } };
    return this.prisma.project.findMany({
      where,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest projects.service`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/projects/projects.service.ts apps/api/src/modules/projects/dto/index.ts apps/api/src/modules/projects/projects.service.spec.ts
git commit -m "feat(projects): BDL-3 createProject + listProjects

Refs #3"
```

---

### Task 3: `getProject` + `updateProject` (with member access)

**Files:**
- Modify: `apps/api/src/modules/projects/projects.service.ts`
- Modify: `apps/api/src/modules/projects/projects.service.spec.ts`

- [ ] **Step 1: Add failing tests** — append inside `projects.service.spec.ts`:

```ts
describe('ProjectsService — get/update access', () => {
  it('getProject throws NotFound when the user is not a member (and not owner)', async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.getProject('acc-1', 'p-x', 'user-1', 'editor')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-x', accountId: 'acc-1', members: { some: { userId: 'user-1' } } },
    });
  });

  it('getProject for an owner does not require membership', async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue({ id: 'p1' });
    await service.getProject('acc-1', 'p1', 'owner-1', 'owner');
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', accountId: 'acc-1' },
    });
  });

  it('updateProject updates a scoped project', async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue({ id: 'p1' });
    await service.updateProject('acc-1', 'p1', { status: 'build' });
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { name: undefined, clientName: undefined, address: undefined, status: 'build' },
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest projects.service`
Expected: FAIL — `service.getProject is not a function`.

- [ ] **Step 3: Add the methods** to `ProjectsService`:

```ts
  /** Throws NotFound unless the project is in the account AND (user is a member OR account owner). */
  async getProject(accountId: string, projectId: string, userId: string, accountRole: AccountRole) {
    const where =
      accountRole === 'owner'
        ? { id: projectId, accountId }
        : { id: projectId, accountId, members: { some: { userId } } };
    const project = await this.prisma.project.findFirst({ where });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  /** Manager/owner only (route guard enforces the role). Asserts the project is in the account. */
  async updateProject(accountId: string, projectId: string, dto: UpdateProjectDto) {
    await this.assertProject(accountId, projectId);
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: dto.name,
        clientName: dto.clientName,
        address: dto.address,
        status: dto.status,
      },
    });
  }

  private async assertProject(accountId: string, projectId: string) {
    const found = await this.prisma.project.findFirst({
      where: { id: projectId, accountId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Project not found');
  }
```

> Note: `assertProject` uses `findFirst` with `select` — but Task 3's `getProject` tests assert
> `findFirst` is called with the membership `where`. These are different calls; the `updateProject`
> test mocks `findFirst` to return `{ id: 'p1' }`, satisfying `assertProject`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest projects.service`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/projects/projects.service.ts apps/api/src/modules/projects/projects.service.spec.ts
git commit -m "feat(projects): BDL-3 getProject + updateProject with member scoping

Refs #3"
```

---

### Task 4: Member management (`addMember` / `listMembers` / `removeMember`)

**Files:**
- Modify: `apps/api/src/modules/projects/projects.service.ts`
- Modify: `apps/api/src/modules/projects/projects.service.spec.ts`

- [ ] **Step 1: Add failing tests**:

```ts
describe('ProjectsService — members', () => {
  it('addMember upserts a project member with a role (account-scoped project)', async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue({ id: 'p1' });
    await service.addMember('acc-1', 'p1', { userId: 'u2', role: 'designer' });
    expect(prisma.projectMember.create).toHaveBeenCalledWith({
      data: { projectId: 'p1', userId: 'u2', role: 'designer' },
    });
  });

  it('listMembers returns members for a scoped project', async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue({ id: 'p1' });
    await service.listMembers('acc-1', 'p1');
    expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p1' } }),
    );
  });

  it('removeMember deletes by project + member id', async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue({ id: 'p1' });
    await service.removeMember('acc-1', 'p1', 'm1');
    expect(prisma.projectMember.deleteMany).toHaveBeenCalledWith({
      where: { id: 'm1', projectId: 'p1' },
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest projects.service`
Expected: FAIL — `service.addMember is not a function`.

- [ ] **Step 3: Add the methods** to `ProjectsService` (and import `AddMemberDto` is already imported):

```ts
  async addMember(accountId: string, projectId: string, dto: AddMemberDto) {
    await this.assertProject(accountId, projectId);
    return this.prisma.projectMember.create({
      data: { projectId, userId: dto.userId, role: dto.role },
    });
  }

  async listMembers(accountId: string, projectId: string) {
    await this.assertProject(accountId, projectId);
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async removeMember(accountId: string, projectId: string, memberId: string) {
    await this.assertProject(accountId, projectId);
    const { count } = await this.prisma.projectMember.deleteMany({
      where: { id: memberId, projectId },
    });
    if (count === 0) throw new NotFoundException('Member not found');
    return { removed: true };
  }
```

> The `listMembers` test mocks `projectMember.findMany` returning `[]`; the `include` is part of the
> call args object but the test only asserts the `where`, so `expect.objectContaining` passes.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest projects.service`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/projects/projects.service.ts apps/api/src/modules/projects/projects.service.spec.ts
git commit -m "feat(projects): BDL-3 project member management

Refs #3"
```

---

### Task 5: `ProjectGuard`

**Files:**
- Create: `apps/api/src/modules/projects/guards/project.guard.ts`
- Test: `apps/api/src/modules/projects/guards/project.guard.spec.ts`

The guard runs after `JwtAuthGuard` + `AccountContextGuard` (which set `req.user`, `req.accountId`,
`req.accountRole`). It resolves the caller's `ProjectMember` for `req.params.id` and sets
`req.projectRole`; the account `owner` is allowed as `manager`. Non-members are rejected (404).

- [ ] **Step 1: Write the failing test** (`project.guard.spec.ts`):

```ts
import { NotFoundException } from '@nestjs/common';
import { ProjectGuard } from './project.guard';

function ctx(req: any): any {
  return { switchToHttp: () => ({ getRequest: () => req }) };
}

function makeGuard() {
  const prisma: any = { projectMember: { findUnique: jest.fn() } };
  return { guard: new ProjectGuard(prisma), prisma };
}

describe('ProjectGuard', () => {
  it('allows a project member and sets req.projectRole', async () => {
    const { guard, prisma } = makeGuard();
    prisma.projectMember.findUnique.mockResolvedValue({ role: 'designer' });
    const req: any = { user: { id: 'u1' }, accountId: 'acc-1', accountRole: 'editor', params: { id: 'p1' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.projectRole).toBe('designer');
    expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 'p1', userId: 'u1' } },
    });
  });

  it('allows the account owner as manager without a membership row', async () => {
    const { guard, prisma } = makeGuard();
    prisma.projectMember.findUnique.mockResolvedValue(null);
    const req: any = { user: { id: 'o1' }, accountId: 'acc-1', accountRole: 'owner', params: { id: 'p1' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.projectRole).toBe('manager');
  });

  it('rejects a non-member non-owner with NotFound', async () => {
    const { guard, prisma } = makeGuard();
    prisma.projectMember.findUnique.mockResolvedValue(null);
    const req: any = { user: { id: 'u9' }, accountId: 'acc-1', accountRole: 'viewer', params: { id: 'p1' } };
    await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest project.guard`
Expected: FAIL — `Cannot find module './project.guard'`.

- [ ] **Step 3: Write the guard** (`project.guard.ts`):

```ts
import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ProjectGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const projectId = req.params?.id as string;
    const userId = req.user?.id as string;

    const membership = projectId && userId
      ? await this.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId } },
        })
      : null;

    if (membership) {
      req.projectRole = membership.role;
      return true;
    }
    // Account owners administer every project in their account.
    if (req.accountRole === 'owner') {
      req.projectRole = 'manager';
      return true;
    }
    throw new NotFoundException('Project not found');
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest project.guard`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/projects/guards/project.guard.ts apps/api/src/modules/projects/guards/project.guard.spec.ts
git commit -m "feat(projects): BDL-3 ProjectGuard (member or account owner)

Refs #3"
```

---

### Task 6: Controller + module + app wiring

**Files:**
- Create: `apps/api/src/modules/projects/projects.controller.ts`
- Create: `apps/api/src/modules/projects/projects.module.ts`
- Modify: `apps/api/src/app.module.ts`

The `AuthenticatedRequest` type lives at `../../common/types`; it already carries `user`, `accountId`,
`accountRole`. We extend the request locally for `projectRole` via a small inline type.

- [ ] **Step 1: Write the controller** (`projects.controller.ts`):

```ts
import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import { ProjectsService } from './projects.service';
import { ProjectGuard } from './guards/project.guard';
import { CreateProjectDto, UpdateProjectDto, AddMemberDto } from './dto';

type ProjectRequest = AuthenticatedRequest & { projectRole?: string };

function requireManager(req: ProjectRequest) {
  if (req.projectRole !== 'manager') throw new ForbiddenException('Project manager role required');
}

@Controller('projects')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.projects.listProjects(req.accountId, req.user.id, req.accountRole);
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateProjectDto) {
    return this.projects.createProject(req.accountId, req.user.id, dto);
  }

  @Get(':id')
  @UseGuards(ProjectGuard)
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projects.getProject(req.accountId, id, req.user.id, req.accountRole);
  }

  @Patch(':id')
  @UseGuards(ProjectGuard)
  update(@Req() req: ProjectRequest, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    requireManager(req);
    return this.projects.updateProject(req.accountId, id, dto);
  }

  @Get(':id/members')
  @UseGuards(ProjectGuard)
  members(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projects.listMembers(req.accountId, id);
  }

  @Post(':id/members')
  @UseGuards(ProjectGuard)
  addMember(@Req() req: ProjectRequest, @Param('id') id: string, @Body() dto: AddMemberDto) {
    requireManager(req);
    return this.projects.addMember(req.accountId, id, dto);
  }

  @Delete(':id/members/:memberId')
  @UseGuards(ProjectGuard)
  removeMember(@Req() req: ProjectRequest, @Param('id') id: string, @Param('memberId') memberId: string) {
    requireManager(req);
    return this.projects.removeMember(req.accountId, id, memberId);
  }
}
```

- [ ] **Step 2: Write the module** (`projects.module.ts`):

```ts
import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectGuard } from './guards/project.guard';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectGuard],
  exports: [ProjectsService],
})
export class ProjectsModule {}
```

- [ ] **Step 3: Register in `app.module.ts`** — add the import near the other module imports and add `ProjectsModule` to the `imports` array (next to `SitesModule`):

```ts
import { ProjectsModule } from './modules/projects/projects.module';
// ...
    SitesModule,
    ProjectsModule,
    ReportsModule,
```

- [ ] **Step 4: Typecheck + full unit tests**

Run (from `apps/api/`):
```bash
npx tsc --noEmit
npx jest projects
```
Expected: tsc exit 0; all `projects` specs pass (11 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/projects/projects.controller.ts apps/api/src/modules/projects/projects.module.ts apps/api/src/app.module.ts
git commit -m "feat(projects): BDL-3 controller + module wiring

Refs #3"
```

---

### Task 7: Live smoke + close BDL-3

**Files:** none (verification only)

- [ ] **Step 1: Boot the API**

Run (from `apps/api/`): `npm run dev`
Expected: `Application is running on: http://localhost:3000`, no errors.

- [ ] **Step 2: Smoke the project flow** (from repo root, dev DB seeded with alice):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"alice@test.com","password":"TestPass123"}' | grep -o '"accessToken":"[^"]*"' | sed 's/.*:"//;s/"//')
ACC=$(curl -s http://localhost:3000/api/v1/accounts -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
H="-H Authorization:Bearer$TOKEN -H X-Account-Id:$ACC"
# create
PID=$(curl -s -X POST http://localhost:3000/api/v1/projects -H "Authorization: Bearer $TOKEN" -H "X-Account-Id: $ACC" -H "Content-Type: application/json" -d '{"name":"Dom Kowalski","clientName":"Jan"}' | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
echo "project: $PID"
# list (alice is the creator → manager member; also owner)
curl -s http://localhost:3000/api/v1/projects -H "Authorization: Bearer $TOKEN" -H "X-Account-Id: $ACC"
# members (alice should be manager)
curl -s http://localhost:3000/api/v1/projects/$PID/members -H "Authorization: Bearer $TOKEN" -H "X-Account-Id: $ACC"
# update status
curl -s -X PATCH http://localhost:3000/api/v1/projects/$PID -H "Authorization: Bearer $TOKEN" -H "X-Account-Id: $ACC" -H "Content-Type: application/json" -d '{"status":"design"}'
```
Expected: create → 201 with project; list → array containing it; members → alice as `manager`; update → status `design`.

- [ ] **Step 3: Stop the dev server, mark the plan done, commit + close issue**

```bash
git commit --allow-empty -m "chore(projects): BDL-3 projects foundation verified

Closes #3"
git push origin main
```

---

## Definition of done
- `Project`/`ProjectMember` models + migration; `Site.projectId`.
- `projects` module: create/list/get/update + member add/list/remove, all account-scoped and
  membership-scoped, `manager`/owner gated for management.
- `ProjectGuard` resolves member-or-owner.
- `npx tsc --noEmit` clean; `npx jest projects` green (11 tests); live smoke passes.
- BDL-3 closed; commits reference `#3`.
