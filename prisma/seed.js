const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Fonte única, compartilhada com o passo a passo inicial (src/lib/defaults.js).
let INCOME_CATEGORIES = [];
let EXPENSE_CATEGORIES = [];

const ACCOUNTS = [
  { name: 'Bradesco', color: '#cc2229', icon: '🏦', initialBalance: 0 },
  { name: 'Inter', color: '#ff7a00', icon: '🟠', initialBalance: 0 },
  { name: 'Santander', color: '#ec0000', icon: '🔴', initialBalance: 0 },
];

/**
 * Idempotente: pode rodar de novo na mesma base sem duplicar nada.
 *
 * Variáveis opcionais:
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD  cria o usuário inicial
 *   SEED_DEMO=true                          inclui cartões e recorrentes de exemplo
 */
async function main() {
  console.log('🌱 Seeding database...');

  ({ INCOME_CATEGORIES, EXPENSE_CATEGORIES } = await import('../src/lib/defaults.js'));

  // --- Usuário -------------------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const userCount = await prisma.user.count();

  if (adminEmail && adminPassword) {
    if (adminPassword.length < 8) {
      throw new Error('SEED_ADMIN_PASSWORD precisa ter pelo menos 8 caracteres');
    }
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { password: await bcrypt.hash(adminPassword, 10) },
      create: {
        email: adminEmail,
        password: await bcrypt.hash(adminPassword, 10),
        name: process.env.SEED_ADMIN_NAME || 'Admin',
      },
    });
    console.log('✅ Usuário:', adminEmail);
  } else if (userCount === 0) {
    console.log('⚠️  Nenhum usuário criado.');
    console.log('    Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD, ou');
    console.log('    ligue ALLOW_REGISTRATION=true e crie a conta pela tela de login.');
  } else {
    console.log(`ℹ️  ${userCount} usuário(s) já existem — nenhum alterado.`);
  }

  // Daqui em diante tudo pertence a alguém: sem usuário, não há o que semear.
  const owner = adminEmail
    ? await prisma.user.findUnique({ where: { email: adminEmail } })
    : await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });

  if (!owner) {
    console.log('ℹ️  Nenhum usuário: crie a conta primeiro e rode de novo.');
    return;
  }
  console.log('ℹ️  Semeando os dados de', owner.email);

  // --- Categorias (necessárias: não há tela para cadastrá-las) -------------
  let createdCategories = 0;
  for (const cat of [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]) {
    const existing = await prisma.category.findFirst({
      where: { name: cat.name, type: cat.type, userId: owner.id },
    });
    if (!existing) {
      await prisma.category.create({ data: { ...cat, userId: owner.id } });
      createdCategories++;
    }
  }
  console.log(`✅ Categorias: ${createdCategories} criadas, ${INCOME_CATEGORIES.length + EXPENSE_CATEGORIES.length - createdCategories} já existiam`);

  // --- Contas bancárias ----------------------------------------------------
  let createdAccounts = 0;
  for (const acc of ACCOUNTS) {
    const existing = await prisma.bankAccount.findFirst({
      where: { name: acc.name, userId: owner.id },
    });
    if (!existing) {
      await prisma.bankAccount.create({ data: { ...acc, userId: owner.id } });
      createdAccounts++;
    }
  }
  console.log(`✅ Contas: ${createdAccounts} criadas`);

  // --- Dados de exemplo (só com SEED_DEMO=true) ----------------------------
  if (process.env.SEED_DEMO !== 'true') {
    console.log('ℹ️  Exemplos ignorados (use SEED_DEMO=true para incluí-los).');
    console.log('🎉 Seed concluído.');
    return;
  }

  const bradesco = await prisma.bankAccount.findFirst({ where: { name: 'Bradesco', userId: owner.id } });
  const inter = await prisma.bankAccount.findFirst({ where: { name: 'Inter', userId: owner.id } });

  if (await prisma.investment.count({ where: { userId: owner.id } }) === 0) {
    const cdb = await prisma.investment.create({
      data: {
        name: 'CDB', type: 'RENDA_FIXA', institution: 'Inter',
        currentValue: 0, totalInvested: 0, profit: 0,
        profitPercentage: 0, cdiPercentage: 100,
        userId: owner.id,
      },
    });

    await prisma.financialGoal.create({
      data: {
        name: 'Reserva de Emergência', type: 'RESERVA_EMERGENCIA',
        targetAmount: 30000, currentAmount: 0,
        targetDate: new Date('2027-12-31'), monthlyContribution: 1000,
        userId: owner.id,
      },
    });

    await prisma.financialGoal.create({
      data: {
        name: 'Patrimônio 2032', type: 'PATRIMONIO',
        targetAmount: 500000, currentAmount: 0,
        targetDate: new Date('2032-12-31'), monthlyContribution: 3000,
        investmentId: cdb.id,
        userId: owner.id,
      },
    });
    console.log('✅ Investimento e metas de exemplo criados');
  }

  if (await prisma.creditCard.count({ where: { userId: owner.id } }) === 0) {
    await prisma.creditCard.create({
      data: {
        name: 'Nubank', color: '#820ad1', icon: '🟣', limitAmount: 8000,
        openingDay: 3, dueDay: 10, paymentDay: 10, estimatedAmount: 1800,
        bankAccountId: inter?.id || null,
        userId: owner.id,
      },
    });
    await prisma.creditCard.create({
      data: {
        name: 'Bradesco Visa', color: '#cc2229', icon: '🔴', limitAmount: 12000,
        openingDay: 18, dueDay: 25, paymentDay: 25, estimatedAmount: 2400,
        bankAccountId: bradesco?.id || null,
        userId: owner.id,
      },
    });
    console.log('✅ Cartões de exemplo criados');
  }

  if (await prisma.recurringEntry.count({ where: { userId: owner.id } }) === 0) {
    const salario = await prisma.category.findFirst({ where: { name: 'Salário', userId: owner.id } });
    const entries = [
      { name: 'Salário', type: 'INCOME', amount: 9500, dayOfMonth: 5, bankAccountId: bradesco?.id, categoryId: salario?.id || null },
      { name: 'Pro-labore', type: 'INCOME', amount: 3200, dayOfMonth: 20, bankAccountId: inter?.id },
      { name: 'Aluguel', type: 'EXPENSE', amount: 2300, dayOfMonth: 8, bankAccountId: bradesco?.id },
      { name: 'Condomínio', type: 'EXPENSE', amount: 620, dayOfMonth: 8, bankAccountId: bradesco?.id },
      { name: 'Internet', type: 'EXPENSE', amount: 129.9, dayOfMonth: 15, bankAccountId: inter?.id },
      { name: 'Academia', type: 'EXPENSE', amount: 149, dayOfMonth: 12, bankAccountId: inter?.id },
      { name: 'IPTU', type: 'EXPENSE', amount: 1450, dayOfMonth: 10, frequency: 'YEARLY', monthOfYear: 2, bankAccountId: bradesco?.id },
    ];
    for (const entry of entries) {
      await prisma.recurringEntry.create({ data: { ...entry, userId: owner.id } });
    }
    console.log('✅ Recorrentes de exemplo criados');
  }

  console.log('🎉 Seed concluído.');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
