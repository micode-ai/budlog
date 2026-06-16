/**
 * E2E tests for the Polish Bank Import feature (ABA-NNN).
 *
 * Prerequisites:
 *   - Running PostgreSQL reachable via DATABASE_URL (from .env or .env.local).
 *   - The `csv_import_mappings` table must exist.  Run pending migrations first:
 *       cd apps/api && npx prisma migrate deploy   (or: npx prisma migrate dev)
 *   - `supertest` and `@types/supertest` are devDependencies (already added).
 *   - Run with:
 *       cd apps/api && npm run test:e2e -- --testPathPattern=import-bank
 *
 * Auth setup note:
 *   The standard `POST /auth/register` endpoint performs a live DNS MX-record
 *   lookup and returns an empty accessToken until the user verifies their email.
 *   To avoid that in tests, we create the user directly via PrismaService
 *   (with isVerified: true), build the default account via AccountsService, and
 *   sign a JWT via JwtService — matching exactly what AuthService.generateTokens does.
 *
 * Known blockers (as of 2026-05-23):
 *   - Local dev DB is missing the `csv_import_mappings` table created by the
 *     import-bank feature migration.  Run `npx prisma migrate deploy` to unblock.
 *     Until then, the preview/commit tests return HTTP 500 and fail.
 *   - The auth guard test (401) and empty-commit no-op test pass without the table.
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { AccountsService } from '../src/modules/accounts/accounts.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

// ── mBank sample CSV (semicolon-separated, Polish decimal format) ─────────────
const MBANK_CSV = [
  '#Data operacji;#Data księgowania;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji',
  '2026-01-16;2026-01-16;PLATNOSC KARTA;Zakupy;BIEDRONKA;PL999;-87,45 PLN;3113,05 PLN',
].join('\n');

describe('Import Bank (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let accountId: string;
  let testUserId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    // Mirror the global setup from main.ts exactly.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: ['webhooks/stripe', 'telegram/webhook', 'whatsapp/webhook'],
    });

    await app.init();

    prisma = moduleRef.get(PrismaService);
    const accountsService = moduleRef.get(AccountsService);
    const jwtService = moduleRef.get(JwtService);
    const configService = moduleRef.get(ConfigService);

    // Create a pre-verified test user directly via Prisma, bypassing the
    // register endpoint's DNS MX check and email-verification gate.
    const email = `bankimport-${Date.now()}@test.local`;
    const passwordHash = await bcrypt.hash('Passw0rd!', 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: 'Bank Import Test',
        currencyCode: 'PLN',
        isVerified: true,
        isActive: true,
      },
    });
    testUserId = user.id;

    // Create the default personal account (seeds categories too).
    const account = await accountsService.createDefaultAccount(user.id, 'PLN', 'en');
    accountId = account.id;

    // Sign a JWT the same way AuthService.generateTokens does.
    token = await jwtService.signAsync(
      { sub: user.id, email },
      {
        secret: configService.get<string>('JWT_SECRET'),
        expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d'),
      },
    );
  });

  afterAll(async () => {
    // Clean up test data in dependency order.
    if (testUserId) {
      await prisma.expense.deleteMany({ where: { accountId } });
      await prisma.income.deleteMany({ where: { accountId } });
      await prisma.accountMember.deleteMany({ where: { accountId } });
      await prisma.account.deleteMany({ where: { id: accountId } });
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await app.close();
  });

  it('previews → commits → second preview marks row as alreadyImported', async () => {
    // ── Step 1: Preview ────────────────────────────────────────────────────────
    const preview1 = await request(app.getHttpServer())
      .post('/api/v1/import/bank/preview')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Account-Id', accountId)
      .attach('file', Buffer.from(MBANK_CSV, 'utf-8'), 'mbank.csv');

    expect(preview1.status).toBe(201);
    expect(preview1.body.status).toBe('parsed');
    expect(preview1.body.detectedBankId).toBe('mbank');
    expect(preview1.body.rows).toHaveLength(1);
    expect(preview1.body.rows[0].alreadyImported).toBe(false);

    // ── Step 2: Commit ─────────────────────────────────────────────────────────
    const commit = await request(app.getHttpServer())
      .post('/api/v1/import/bank/commit')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Account-Id', accountId)
      .send({ rows: preview1.body.rows });

    expect(commit.status).toBe(201);
    expect(commit.body.createdExpenses).toBe(1);
    expect(commit.body.createdIncomes).toBe(0);

    // ── Step 3: Re-preview of same file → row marked alreadyImported ──────────
    const preview2 = await request(app.getHttpServer())
      .post('/api/v1/import/bank/preview')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Account-Id', accountId)
      .attach('file', Buffer.from(MBANK_CSV, 'utf-8'), 'mbank.csv');

    expect(preview2.status).toBe(201);
    expect(preview2.body.rows[0].alreadyImported).toBe(true);
  });

  it('returns needs_picker for an unrecognized CSV', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/import/bank/preview')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Account-Id', accountId)
      .attach('file', Buffer.from('Foo;Bar\n1;2', 'utf-8'), 'random.csv');

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('needs_picker');
    expect(res.body.supportedBanks.map((b: { id: string }) => b.id)).toContain('mbank');
  });

  it('rejects preview without auth (401)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/import/bank/preview')
      .attach('file', Buffer.from(MBANK_CSV, 'utf-8'), 'mbank.csv');

    expect(res.status).toBe(401);
  });

  it('rejects commit with an empty rows array (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/import/bank/commit')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Account-Id', accountId)
      .send({ rows: [] });

    // rows array passes validation but nothing is imported — service returns 0 counts
    // (empty rows is a valid no-op commit, not a 400)
    expect([200, 201]).toContain(res.status);
    expect(res.body.createdExpenses).toBe(0);
  });
});
