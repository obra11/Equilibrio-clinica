/**
 * Garante papéis ADMIN sem apagar dados (seguro em produção).
 * Rodado no start da API após db push.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ADMIN_EMAILS = [
  "liz@equilibrio.fisio.br",
  "admin@equilibrio.fisio.br",
];

async function main() {
  for (const email of ADMIN_EMAILS) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`[ensure-admins] usuário não encontrado: ${email}`);
      continue;
    }
    if (user.role === "ADMIN") {
      console.log(`[ensure-admins] já ADMIN: ${email}`);
      continue;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
    });
    console.log(`[ensure-admins] promovido a ADMIN: ${email} (era ${user.role})`);
  }

  // Fallback por nome, se o e-mail da Lizandra for outro
  const byName = await prisma.professional.findMany({
    where: {
      fullName: { contains: "Lizandra", mode: "insensitive" },
    },
    include: { user: true },
  });
  for (const p of byName) {
    if (!p.user || p.user.role === "ADMIN") continue;
    await prisma.user.update({
      where: { id: p.user.id },
      data: { role: "ADMIN" },
    });
    console.log(
      `[ensure-admins] promovido a ADMIN por nome: ${p.fullName} <${p.user.email}> (era ${p.user.role})`,
    );
  }
}

main()
  .catch((e) => {
    console.error("[ensure-admins] falhou:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
