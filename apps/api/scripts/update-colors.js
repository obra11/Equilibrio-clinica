const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const map = {
  "Lizandra Gorski": "#1D4ED8",
  "Mirele T. Montes": "#DC2626",
  "José Guilherme": "#EAB308",
  "Administração Equilíbrio": "#2563EB",
};

const palette = ["#1D4ED8", "#DC2626", "#EAB308", "#2563EB", "#B91C1C", "#CA8A04"];

(async () => {
  const all = await prisma.professional.findMany({
    where: { active: true },
    orderBy: { fullName: "asc" },
  });
  let i = 0;
  for (const p of all) {
    const color = map[p.fullName] || palette[i % palette.length];
    await prisma.professional.update({ where: { id: p.id }, data: { color } });
    console.log(`${p.fullName} -> ${color}`);
    i += 1;
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
