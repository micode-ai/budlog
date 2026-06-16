import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ============ TEST CREDENTIALS ============
// User: alice@test.com / TestPass123
// ==========================================

async function main() {
  console.log('Seeding test data...\n');

  const passwordHash = await bcrypt.hash('TestPass123', 10);

  const alice = await prisma.user.upsert({
    where: { email: 'alice@test.com' },
    update: {},
    create: {
      email: 'alice@test.com',
      passwordHash,
      name: 'Alice',
      isVerified: true,
    },
  });

  // Ensure Alice has a default personal account with an owner membership
  let account = await prisma.account.findFirst({
    where: { ownerId: alice.id, type: 'personal' },
  });
  if (!account) {
    account = await prisma.account.create({
      data: { name: 'Personal', type: 'personal', currencyCode: 'PLN', ownerId: alice.id },
    });
    await prisma.accountMember.create({
      data: { accountId: account.id, userId: alice.id, role: 'owner' },
    });
    await prisma.user.update({
      where: { id: alice.id },
      data: { defaultAccountId: account.id },
    });
  }

  console.log(`Seeded user alice@test.com with account ${account.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
