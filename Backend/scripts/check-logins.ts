import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.authSession.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log('\n======================= RECENT LOGIN ACTIVITY =======================');
  if (sessions.length === 0) {
    console.log('No recent login sessions found.');
  } else {
    console.table(
      sessions.map((s) => ({
        User: `@${s.user.handle}`,
        Status: s.revokedAt ? 'REVOKED' : s.expiresAt < new Date() ? 'EXPIRED' : 'ACTIVE',
        Device: s.deviceType || 'unknown',
        Browser: s.browser || 'unknown',
        OS: s.os || 'unknown',
        IP: s.ipAddress || 'unknown',
        'Logged In At': s.createdAt.toLocaleString(),
      }))
    );
  }
  console.log('=====================================================================\n');
}

main().finally(async () => {
  await prisma.$disconnect();
});
