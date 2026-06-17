# BDL-5 — Design action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a foreman/designer/manager run a **design action** on a request — turn the client's uploaded plan image into a reviewable **schema (JSON) + rendered SVG floor plan** — behind a provider-agnostic `DesignProvider` port (MVP = OpenAI Vision), persisting the output as `DesignArtifact` rows attached to the request + project.

**Architecture:** New `DesignArtifact` Prisma model. A `design` NestJS module: a `DesignProvider` port (interface + `DESIGN_PROVIDER` DI token), an `OpenAiVisionProvider` MVP (GPT-4o vision → schema JSON, plus a pure `renderSchemaSvg()` that draws the schema as SVG — one AI call, two artifacts), and a `DesignService.run()` that loads the request's plan attachment via the BDL-4 `RequestsService`, calls the provider, and persists artifacts. Endpoints `POST /projects/:id/requests/:rid/design` and `GET /projects/:id/designs`, guarded by `ProjectGuard` + `ViewerBlockGuard`; only write-roles (manager/foreman/designer) may run an action.

**Tech Stack:** NestJS 10, Prisma 5, `openai` SDK wrapped with `langsmith/wrappers` `wrapOpenAI` (mirrors `apps/api/src/modules/ai/services/ocr.service.ts`), Jest (mocked OpenAI + mocked Prisma).

**Spec:** `docs/specs/2026-06-16-collaboration-foundation-design.md` (§5) · **Research:** `docs/research/2026-06-16-ai-design-generation-feasibility.md` · **Issue:** BDL-5 (#5) · **Depends on:** BDL-3 (#3 Project/ProjectGuard), BDL-4 (#4 Request/Attachment/FileStore/RequestsService).

**Conventions:** `apps/api/src/modules/requests/` and `projects/` are the references — `(accountId, …)` signatures, every query filtered by `accountId`, `ProjectGuard` sets `req.projectRole`, `ViewerBlockGuard` on writes, `NotFoundException`/`ForbiddenException`/`BadRequestException`. Run `npx`/`npm` from `apps/api/`. **Stop the dev server before any `prisma migrate`/`generate`** (Windows DLL lock). Vision output is approximate — frame artifacts as a *draft* (BDL-1 risk note).

---

### Task 1: Schema — `DesignArtifact` + enums

**Files:** Modify `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add enums** (after `AttachmentStorage`):

```prisma
enum DesignKind {
  schema
  svg
  render
  external3d
}

enum DesignProviderKind {
  openai
  planner5d
  coohom
  manual
}
```

- [ ] **Step 2: Add model** (after the `Attachment` model):

```prisma
model DesignArtifact {
  id          String             @id @default(uuid())
  accountId   String             @map("account_id")
  projectId   String             @map("project_id")
  requestId   String?            @map("request_id")
  kind        DesignKind
  provider    DesignProviderKind
  data        Json
  createdById String             @map("created_by_id")
  createdAt   DateTime           @default(now()) @map("created_at")

  project Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  request Request? @relation(fields: [requestId], references: [id], onDelete: SetNull)

  @@index([accountId, projectId])
  @@map("design_artifacts")
}
```

- [ ] **Step 3: Back-relations** — inside `model Project { ... }` add `designs DesignArtifact[]` (next to `requests`/`attachments`); inside `model Request { ... }` add `designs DesignArtifact[]` (next to `attachments`).

- [ ] **Step 4: Migrate** (dev server stopped):

```bash
npx prisma validate && npx prisma format
npx prisma migrate dev --name add_design_artifacts
npx prisma generate
```
Expected: valid; migration `*_add_design_artifacts`; client generated. (EPERM on generate → kill stray `budlog` node, re-run generate.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): BDL-5 DesignArtifact model + enums

Refs #5"
```

---

### Task 2: `DesignProvider` port (interface + types + DI token)

**Files:** Create `apps/api/src/modules/design/providers/design-provider.interface.ts`

- [ ] **Step 1: Write the port** (no test — pure types/const):

```ts
import { DesignKind, DesignProviderKind } from '@prisma/client';

/** Input to a design action. The service resolves the plan attachment to bytes before calling
 *  the provider — providers never touch the DB or file store. */
export interface DesignInput {
  /** Base64-encoded plan image (no data: prefix), if a plan attachment was supplied. */
  planImageBase64?: string;
  /** MIME type of the plan image (e.g. image/png). */
  mimeType?: string;
  /** Free-text client requirements. */
  requirements?: string;
}

/** One produced artifact (a schema, an SVG, a render, or an external 3D link). */
export interface DesignResult {
  kind: DesignKind;
  provider: DesignProviderKind;
  data: unknown;
}

/** Provider-agnostic design generator. MVP impl = OpenAI Vision; Planner5d/Coohom plug in later. */
export interface DesignProvider {
  readonly name: DesignProviderKind;
  /** Produce one or more artifacts from the input. May return [] if nothing could be generated. */
  generate(input: DesignInput): Promise<DesignResult[]>;
}

/** Nest DI token so `DesignService` depends on the interface, not a concrete provider. */
export const DESIGN_PROVIDER = Symbol('DESIGN_PROVIDER');
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/design/providers/design-provider.interface.ts
git commit -m "feat(design): BDL-5 DesignProvider port + types + DI token

Refs #5"
```

---

### Task 3: `renderSchemaSvg` — pure schema → SVG floor plan

**Files:**
- Create: `apps/api/src/modules/design/providers/svg-render.ts`
- Test: `apps/api/src/modules/design/providers/svg-render.spec.ts`

The schema shape the provider produces (and this renderer consumes):
```ts
// { rooms: [{ name: string, approxWidthM?: number, approxLengthM?: number }], notes?: string }
```

- [ ] **Step 1: Failing test** (`svg-render.spec.ts`):

```ts
import { renderSchemaSvg } from './svg-render';

describe('renderSchemaSvg', () => {
  it('renders a labelled rect per room and is valid-ish SVG', () => {
    const svg = renderSchemaSvg({
      rooms: [
        { name: 'Kitchen', approxWidthM: 4, approxLengthM: 3 },
        { name: 'Bedroom', approxWidthM: 5, approxLengthM: 4 },
      ],
    });
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('</svg>');
    expect(svg).toContain('Kitchen');
    expect(svg).toContain('Bedroom');
    expect((svg.match(/<rect /g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('escapes room names and tolerates a missing/garbage schema', () => {
    const svg = renderSchemaSvg({ rooms: [{ name: '<script>x</script>' }] } as any);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    // garbage in → still returns an <svg> wrapper, no throw
    expect(renderSchemaSvg(null as any)).toMatch(/^<svg /);
    expect(renderSchemaSvg({} as any)).toContain('</svg>');
  });
});
```

- [ ] **Step 2: Run → fails**

Run: `npx jest svg-render`
Expected: FAIL — cannot find `./svg-render`.

- [ ] **Step 3: Implement** (`svg-render.ts`):

```ts
interface SchemaRoom {
  name?: string;
  approxWidthM?: number;
  approxLengthM?: number;
}
interface DesignSchema {
  rooms?: SchemaRoom[];
  notes?: string;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string),
  );
}

/** Pure renderer: lays each room out as a scaled rectangle in a simple wrapping grid with a label.
 *  Tolerant of missing/garbage input — always returns a well-formed <svg> string, never throws. */
export function renderSchemaSvg(schema: DesignSchema | null | undefined): string {
  const rooms = Array.isArray(schema?.rooms) ? (schema!.rooms as SchemaRoom[]) : [];
  const pad = 16;
  const scale = 28; // px per metre
  const cols = Math.max(1, Math.ceil(Math.sqrt(rooms.length || 1)));
  const cellW = 5 * scale + pad; // max room footprint + gap
  const cellH = 5 * scale + pad + 16;
  const rects: string[] = [];

  rooms.forEach((room, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const w = Math.min(5, Math.max(1, Number(room.approxWidthM) || 3)) * scale;
    const h = Math.min(5, Math.max(1, Number(room.approxLengthM) || 3)) * scale;
    const x = pad + col * cellW;
    const y = pad + row * cellH;
    const label = escapeXml(String(room.name ?? `Room ${i + 1}`)).slice(0, 40);
    rects.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f3f4f6" stroke="#374151" stroke-width="2"/>` +
        `<text x="${x + 6}" y="${y + 18}" font-family="sans-serif" font-size="13" fill="#111827">${label}</text>`,
    );
  });

  const totalRows = Math.max(1, Math.ceil((rooms.length || 1) / cols));
  const width = pad + cols * cellW;
  const height = pad + totalRows * cellH + 24;
  const note = schema?.notes ? escapeXml(String(schema.notes)).slice(0, 120) : 'Draft — dimensions approximate';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    rects.join('') +
    `<text x="${pad}" y="${height - 8}" font-family="sans-serif" font-size="11" fill="#6b7280">${note}</text>` +
    `</svg>`
  );
}
```

- [ ] **Step 4: Run → passes**

Run: `npx jest svg-render`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/design/providers/svg-render.ts apps/api/src/modules/design/providers/svg-render.spec.ts
git commit -m "feat(design): BDL-5 pure schema→SVG floor-plan renderer

Refs #5"
```

---

### Task 4: `OpenAiVisionProvider` — MVP design provider

**Files:**
- Create: `apps/api/src/modules/design/providers/openai-vision.provider.ts`
- Test: `apps/api/src/modules/design/providers/openai-vision.provider.spec.ts`

Mirrors `ocr.service.ts` for the OpenAI/LangSmith wiring. One vision call → parsed schema JSON; returns `[schema, svg]` results (SVG rendered locally from the schema). Tolerant of non-JSON model output.

- [ ] **Step 1: Failing test** (`openai-vision.provider.spec.ts`) — inject a fake OpenAI client:

```ts
import { OpenAiVisionProvider } from './openai-vision.provider';

function makeProvider(content: string) {
  const create = jest.fn().mockResolvedValue({ choices: [{ message: { content } }] });
  const config: any = { get: () => 'sk-test' };
  const provider = new OpenAiVisionProvider(config);
  // swap the real OpenAI client for a fake
  (provider as any).openai = { chat: { completions: { create } } };
  return { provider, create };
}

describe('OpenAiVisionProvider', () => {
  it('parses a JSON schema and returns schema + svg artifacts', async () => {
    const { provider, create } = makeProvider(
      '```json\n{"rooms":[{"name":"Kitchen","approxWidthM":4,"approxLengthM":3}],"notes":"draft"}\n```',
    );
    const results = await provider.generate({ planImageBase64: 'AAAA', mimeType: 'image/png' });
    expect(create).toHaveBeenCalled();
    const schema = results.find((r) => r.kind === 'schema');
    const svg = results.find((r) => r.kind === 'svg');
    expect(schema).toBeDefined();
    expect((schema!.data as any).rooms[0].name).toBe('Kitchen');
    expect(schema!.provider).toBe('openai');
    expect(svg).toBeDefined();
    expect((svg!.data as any).svg).toContain('Kitchen');
  });

  it('tolerates non-JSON output (stores raw text, still emits an svg)', async () => {
    const { provider } = makeProvider('I could not read this plan.');
    const results = await provider.generate({ planImageBase64: 'AAAA', mimeType: 'image/png' });
    const schema = results.find((r) => r.kind === 'schema')!;
    expect((schema.data as any).parseError).toBe(true);
    expect((schema.data as any).raw).toContain('could not read');
    expect(results.find((r) => r.kind === 'svg')).toBeDefined();
  });

  it('sends the image when present and the requirements text', async () => {
    const { provider, create } = makeProvider('{"rooms":[]}');
    await provider.generate({ planImageBase64: 'IMG', mimeType: 'image/png', requirements: '3 bedrooms' });
    const arg = create.mock.calls[0][0];
    const parts = arg.messages[arg.messages.length - 1].content;
    const hasImage = parts.some((p: any) => p.type === 'image_url' && p.image_url.url.includes('IMG'));
    const hasReq = JSON.stringify(parts).includes('3 bedrooms');
    expect(hasImage).toBe(true);
    expect(hasReq).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fails**

Run: `npx jest openai-vision`
Expected: FAIL — cannot find `./openai-vision.provider`.

- [ ] **Step 3: Implement** (`openai-vision.provider.ts`):

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { wrapOpenAI } from 'langsmith/wrappers';
import { DesignProviderKind } from '@prisma/client';
import { DesignProvider, DesignInput, DesignResult } from './design-provider.interface';
import { renderSchemaSvg } from './svg-render';

const SYSTEM = `You are an architect's assistant. Analyze the floor-plan image (and any requirements) and
return STRICT JSON only (no prose, no markdown) of the form:
{"rooms":[{"name":string,"approxWidthM":number,"approxLengthM":number}],"notes":string}
Dimensions are approximate. If you cannot read the plan, return {"rooms":[],"notes":"<reason>"}.`;

/** MVP design provider — GPT-4o vision → draft schema JSON + a locally-rendered SVG floor plan.
 *  Wrapped with LangSmith tracing (no-op unless LANGSMITH_TRACING is set), mirroring OcrService. */
@Injectable()
export class OpenAiVisionProvider implements DesignProvider {
  readonly name: DesignProviderKind = 'openai';
  private readonly logger = new Logger(OpenAiVisionProvider.name);
  private readonly openai: OpenAI;

  constructor(config: ConfigService) {
    this.openai = wrapOpenAI(new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') }));
  }

  async generate(input: DesignInput): Promise<DesignResult[]> {
    const userParts: any[] = [
      {
        type: 'text',
        text: input.requirements
          ? `Client requirements: ${input.requirements}\nProduce the schema JSON.`
          : 'Produce the schema JSON for this floor plan.',
      },
    ];
    if (input.planImageBase64) {
      userParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${input.mimeType || 'image/png'};base64,${input.planImageBase64}`,
          detail: 'high',
        },
      });
    }

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userParts },
      ],
      max_tokens: 1200,
    });

    const raw = response.choices[0]?.message?.content || '';
    const schemaData = this.parseSchema(raw);
    const svg = renderSchemaSvg(schemaData.parseError ? { rooms: [] } : schemaData);

    return [
      { kind: 'schema', provider: 'openai', data: schemaData },
      { kind: 'svg', provider: 'openai', data: { svg } },
    ];
  }

  /** Strip ```json fences and parse; on failure return a tolerant {parseError, raw} object. */
  private parseSchema(raw: string): any {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // fall through
    }
    this.logger.warn('Vision output was not valid JSON; storing raw text.');
    return { parseError: true, raw: raw.slice(0, 2000) };
  }
}
```

- [ ] **Step 4: Run → passes**

Run: `npx jest openai-vision`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/design/providers/openai-vision.provider.ts apps/api/src/modules/design/providers/openai-vision.provider.spec.ts
git commit -m "feat(design): BDL-5 OpenAiVisionProvider (plan image → schema JSON + SVG)

Refs #5"
```

---

### Task 5: `DesignService` — run action + list

**Files:**
- Create: `apps/api/src/modules/design/dto/index.ts`
- Create: `apps/api/src/modules/design/design.service.ts`
- Test: `apps/api/src/modules/design/design.service.spec.ts`

Permissions: only write-roles (`manager`/`foreman`/`designer`) may run an action. The plan image is resolved via the BDL-4 `RequestsService.getAttachmentFile(accountId, projectId, attachmentId)` (which scopes by account+project and returns `{ buffer, mimeType }`).

- [ ] **Step 1: DTO** (`dto/index.ts`):

```ts
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RunDesignDto {
  /** Attachment id of the uploaded plan image (optional — requirements-only is allowed). */
  @IsOptional()
  @IsString()
  planAttachmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  requirements?: string;
}
```

- [ ] **Step 2: Failing test** (`design.service.spec.ts`):

```ts
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DesignService } from './design.service';

function makeService() {
  const prisma: any = {
    designArtifact: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'd1', ...a.data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const requests: any = {
    getAttachmentFile: jest.fn().mockResolvedValue({ buffer: Buffer.from('img'), mimeType: 'image/png' }),
  };
  const provider: any = {
    name: 'openai',
    generate: jest.fn().mockResolvedValue([
      { kind: 'schema', provider: 'openai', data: { rooms: [] } },
      { kind: 'svg', provider: 'openai', data: { svg: '<svg/>' } },
    ]),
  };
  return { service: new DesignService(prisma, requests, provider), prisma, requests, provider };
}

describe('DesignService.run', () => {
  it('loads the plan attachment, calls the provider, persists one artifact per result', async () => {
    const { service, prisma, requests, provider } = makeService();
    const out = await service.run('acc-1', 'p1', 'r1', 'u1', 'designer', { planAttachmentId: 'a1' });
    expect(requests.getAttachmentFile).toHaveBeenCalledWith('acc-1', 'p1', 'a1');
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ planImageBase64: Buffer.from('img').toString('base64'), mimeType: 'image/png' }),
    );
    expect(prisma.designArtifact.create).toHaveBeenCalledTimes(2);
    expect(prisma.designArtifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc-1', projectId: 'p1', requestId: 'r1', createdById: 'u1',
        kind: 'schema', provider: 'openai',
      }),
    });
    expect(out).toHaveLength(2);
  });

  it('forbids a client role from running a design action', async () => {
    const { service, provider } = makeService();
    await expect(
      service.run('acc-1', 'p1', 'r1', 'u1', 'client', { planAttachmentId: 'a1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('requires a plan attachment or requirements', async () => {
    const { service } = makeService();
    await expect(service.run('acc-1', 'p1', 'r1', 'u1', 'designer', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listDesigns filters by account + project', async () => {
    const { service, prisma } = makeService();
    await service.listDesigns('acc-1', 'p1');
    expect(prisma.designArtifact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-1', projectId: 'p1' } }),
    );
  });
});
```

- [ ] **Step 3: Run → fails**

Run: `npx jest design.service`
Expected: FAIL — cannot find `./design.service`.

- [ ] **Step 4: Implement** (`design.service.ts`):

```ts
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequestsService } from '../requests/requests.service';
import { DESIGN_PROVIDER, DesignProvider, DesignInput } from './providers/design-provider.interface';
import { RunDesignDto } from './dto';

const WRITE_ROLES = new Set(['manager', 'foreman', 'designer']);

@Injectable()
export class DesignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: RequestsService,
    @Inject(DESIGN_PROVIDER) private readonly provider: DesignProvider,
  ) {}

  async run(
    accountId: string,
    projectId: string,
    requestId: string,
    userId: string,
    projectRole: string,
    dto: RunDesignDto,
  ) {
    if (!WRITE_ROLES.has(projectRole)) {
      throw new ForbiddenException('Only a foreman, designer, or manager can run a design action');
    }
    if (!dto.planAttachmentId && !dto.requirements) {
      throw new BadRequestException('Provide a planAttachmentId or requirements');
    }

    const input: DesignInput = { requirements: dto.requirements };
    if (dto.planAttachmentId) {
      // getAttachmentFile scopes by account+project and 404s otherwise.
      const { buffer, mimeType } = await this.requests.getAttachmentFile(
        accountId,
        projectId,
        dto.planAttachmentId,
      );
      input.planImageBase64 = buffer.toString('base64');
      input.mimeType = mimeType;
    }

    const results = await this.provider.generate(input);
    const created = [];
    for (const r of results) {
      created.push(
        await this.prisma.designArtifact.create({
          data: {
            accountId,
            projectId,
            requestId,
            createdById: userId,
            kind: r.kind,
            provider: r.provider,
            data: r.data as any,
          },
        }),
      );
    }
    return created;
  }

  listDesigns(accountId: string, projectId: string) {
    return this.prisma.designArtifact.findMany({
      where: { accountId, projectId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
```

- [ ] **Step 5: Run → passes**

Run: `npx jest design.service`
Expected: PASS (4).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/design/dto/index.ts apps/api/src/modules/design/design.service.ts apps/api/src/modules/design/design.service.spec.ts
git commit -m "feat(design): BDL-5 DesignService.run + listDesigns

Refs #5"
```

---

### Task 6: Controller + module + wiring

**Files:**
- Create: `apps/api/src/modules/design/design.controller.ts`
- Create: `apps/api/src/modules/design/design.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Controller** (`design.controller.ts`) — mounted at `projects/:id`, all routes under `ProjectGuard`:

```ts
import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { ProjectGuard } from '../projects/guards/project.guard';
import { AuthenticatedRequest } from '../../common/types';
import { DesignService } from './design.service';
import { RunDesignDto } from './dto';

type ProjectRequest = AuthenticatedRequest & { projectRole?: string };

@Controller('projects/:id')
@UseGuards(JwtAuthGuard, AccountContextGuard, ProjectGuard)
export class DesignController {
  constructor(private readonly design: DesignService) {}

  @Get('designs')
  list(@Req() req: AuthenticatedRequest, @Param('id') projectId: string) {
    return this.design.listDesigns(req.accountId, projectId);
  }

  @Post('requests/:rid/design')
  @UseGuards(ViewerBlockGuard)
  run(
    @Req() req: ProjectRequest,
    @Param('id') projectId: string,
    @Param('rid') rid: string,
    @Body() dto: RunDesignDto,
  ) {
    return this.design.run(req.accountId, projectId, rid, req.user.id, req.projectRole ?? '', dto);
  }
}
```

> Note on routing: `DesignController` (`projects/:id`) and `RequestsController` (`projects/:id/requests`) are
> distinct controllers but share the `projects/:id` prefix. `POST projects/:id/requests/:rid/design` (3 segments
> after the prefix) does not collide with any `RequestsController` route (`:rid`, `:rid/messages`,
> `:rid/attachments`, `attachments/:aid/file`). `GET projects/:id/designs` is a single literal segment — no collision.
> Both are independently guarded by `ProjectGuard`. Verify at boot that both route sets map (Task 7).

- [ ] **Step 2: Module** (`design.module.ts`):

```ts
import { Module } from '@nestjs/common';
import { RequestsModule } from '../requests/requests.module';
import { DesignController } from './design.controller';
import { DesignService } from './design.service';
import { OpenAiVisionProvider } from './providers/openai-vision.provider';
import { DESIGN_PROVIDER } from './providers/design-provider.interface';

@Module({
  imports: [RequestsModule], // for RequestsService (getAttachmentFile)
  controllers: [DesignController],
  providers: [
    DesignService,
    OpenAiVisionProvider,
    { provide: DESIGN_PROVIDER, useExisting: OpenAiVisionProvider },
  ],
  exports: [DesignService],
})
export class DesignModule {}
```

(`RequestsModule` already `exports: [RequestsService]` from BDL-4 — confirm it does; if not, add that export.)

- [ ] **Step 3: Register in `app.module.ts`** — import and add `DesignModule` right after `RequestsModule`:

```ts
import { DesignModule } from './modules/design/design.module';
// ...
    RequestsModule,
    DesignModule,
```

- [ ] **Step 4: Typecheck + tests**

```bash
npx tsc --noEmit
npx jest design svg-render openai-vision
```
Expected: tsc exit 0; all design/svg/vision tests pass. Then run the FULL suite to confirm no regressions:
```bash
npx jest
```
Expected: all green (BDL-4 left 100 passing; this adds ~9).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/design/design.controller.ts apps/api/src/modules/design/design.module.ts apps/api/src/app.module.ts
git commit -m "feat(design): BDL-5 controller + module + wiring

Refs #5"
```

---

### Task 7: Live smoke + close BDL-5

**Files:** none

> The smoke makes **one real GPT-4o vision call** (needs `OPENAI_API_KEY` in `apps/api/.env`, already present).
> The image is a tiny generated PNG, so the model will likely return an empty/`parseError` schema — that is fine;
> the smoke verifies the **pipeline** (attachment → provider → persisted artifacts + listing), not extraction quality.

- [ ] **Step 1: Boot the API** (from `apps/api/`): `npm run dev` → healthy; confirm the log maps `POST /api/v1/projects/:id/requests/:rid/design` and `GET /api/v1/projects/:id/designs`.

- [ ] **Step 2: Smoke** (reuses the BDL-4 flow to get a project + request + plan attachment):

```bash
cd /d/tmp
B=http://localhost:3000/api/v1
TOKEN=$(curl -s -X POST $B/auth/login -H "Content-Type: application/json" -d '{"email":"alice@test.com","password":"TestPass123"}' | grep -o '"accessToken":"[^"]*"' | sed 's/.*:"//;s/"//')
ACC=$(curl -s $B/accounts -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
H1="Authorization: Bearer $TOKEN"; H2="X-Account-Id: $ACC"
PID=$(curl -s -X POST $B/projects -H "$H1" -H "$H2" -H "Content-Type: application/json" -d '{"name":"P-design"}' | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
RID=$(curl -s -X POST $B/projects/$PID/requests -H "$H1" -H "$H2" -H "Content-Type: application/json" -d '{"title":"Plan","body":"design please","type":"plan","assigneeRole":"designer"}' | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
# a tiny 1x1 PNG as the "plan"
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0aIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\x0d\x0a-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > plan.png
AID=$(curl -s -X POST $B/projects/$PID/requests/$RID/attachments -H "$H1" -H "$H2" -F "file=@plan.png;type=image/png" -F "kind=plan" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
echo "attachment=$AID"
echo "--- run design action ---"
curl -s -X POST $B/projects/$PID/requests/$RID/design -H "$H1" -H "$H2" -H "Content-Type: application/json" -d "{\"planAttachmentId\":\"$AID\"}" | head -c 500; echo
echo "--- list designs (expect schema + svg) ---"
curl -s $B/projects/$PID/designs -H "$H1" -H "$H2" | grep -o '"kind":"[^"]*"'
```
Expected: design action returns 2 created artifacts (`schema` + `svg`); `GET designs` lists both kinds. (Schema may be `{parseError:true,...}` for the 1×1 image — acceptable; pipeline is what's under test.)

- [ ] **Step 3: Stop the dev server, final commit + close**

```bash
git commit --allow-empty -m "chore(design): BDL-5 design action verified live

Closes #5"
git push origin main
```

---

## Definition of done
- `DesignArtifact` model + enums + migration.
- `design` module: `DesignProvider` port + DI token, `OpenAiVisionProvider` MVP (vision → schema JSON + locally-rendered SVG), `DesignService.run` (account+project scoped, write-roles only, resolves the plan attachment via `RequestsService`) + `listDesigns`, controller `POST /projects/:id/requests/:rid/design` + `GET /projects/:id/designs` under `ProjectGuard` + `ViewerBlockGuard`.
- `npx tsc --noEmit` clean; `npx jest` green (provider tests mock OpenAI; no real calls in the suite).
- Live smoke passes (one real vision call); BDL-5 closed; commits reference `#5`.

## Out of scope (future BDL)
- Web portal surfacing of designs (BDL-6).
- `Planner5dProvider` / `CoohomProvider` (same port, separate BDL).
- Auto-transitioning the request to `done` from the design action (kept a separate manual step per spec §5).
- S3 `FileStore` (artifacts are stored as JSON/SVG in `DesignArtifact.data`, not on disk).
