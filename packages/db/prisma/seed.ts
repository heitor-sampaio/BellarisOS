import { PrismaClient, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'lumiere-dev' },
    update: {},
    create: {
      name: 'Lumière Dev',
      slug: 'lumiere-dev',
      email: 'dev@lumiere.com',
      planStatus: 'active',
    },
  })

  const branch = await prisma.branch.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'centro' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Lumière Centro',
      slug: 'centro',
      email: 'centro@lumiere.com',
      phone: '11999999999',
    },
  })

  await prisma.loyaltyConfig.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      pointsPerReal: 1,
      redeemPointsValue: 0.01,
      firstAppLoginBonus: 100,
    },
  })

  console.log('Seed concluído:', { tenant: tenant.slug, branch: branch.slug })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
