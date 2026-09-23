// ============================================================================
// Prisma Deterministic Seed Script (PRD 04 - Requirement JS-D09)
// Executes reviewed seed SQL with exact parity to Stage B modeling
// Idempotent: safe to run multiple times without duplicating data.
// ============================================================================

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

function splitStatements(sql: string): string[] {
  // Remove single line comments and psql meta-commands (e.g. \echo)
  const cleanSql = sql
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('--') && !trimmed.startsWith('\\');
    })
    .join('\n');

  return cleanSql
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  console.log('>>> Starting Prisma deterministic database seed...');

  const seedSqlPath = path.resolve(__dirname, '../Database/seed.sql');
  const notificationsSqlPath = path.resolve(__dirname, '../Database/notifications.sql');

  if (!fs.existsSync(seedSqlPath)) {
    throw new Error(`Seed SQL not found at ${seedSqlPath}`);
  }

  const seedSql = fs.readFileSync(seedSqlPath, 'utf8');
  const seedStatements = splitStatements(seedSql);

  for (const stmt of seedStatements) {
    await prisma.$executeRawUnsafe(stmt);
  }
  console.log('[OK] Seeded core dataset from seed.sql.');

  if (fs.existsSync(notificationsSqlPath)) {
    const notifSql = fs.readFileSync(notificationsSqlPath, 'utf8');
    const notifStatements = splitStatements(notifSql);
    for (const stmt of notifStatements) {
      await prisma.$executeRawUnsafe(stmt);
    }
    console.log('[OK] Seeded notifications extension.');
  }

  const [users, posts, media, likes, follows] = await Promise.all([
    prisma.user.count(),
    prisma.post.count(),
    prisma.postMedia.count(),
    prisma.postLike.count(),
    prisma.follow.count(),
  ]);

  console.log('----------------------------------------------------------------------');
  console.log('VERIFIED SEED COUNTS:');
  console.log(`Users:       ${users}`);
  console.log(`Posts:       ${posts}`);
  console.log(`Post Media:  ${media}`);
  console.log(`Post Likes:  ${likes}`);
  console.log(`Follows:     ${follows}`);
  console.log('----------------------------------------------------------------------');
  console.log('>>> Prisma seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
