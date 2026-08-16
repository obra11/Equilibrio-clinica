import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.payment.deleteMany();
  await prisma.accountReceivable.deleteMany();
  await prisma.accountPayable.deleteMany();
  await prisma.classEnrollment.deleteMany();
  await prisma.classSession.deleteMany();
  await prisma.sessionNote.deleteMany();
  await prisma.physicalAssessment.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.user.deleteMany();
  await prisma.serviceType.deleteMany();
  await prisma.room.deleteMany();
  await prisma.category.deleteMany();

  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@equilibrio.fisio.br",
      passwordHash,
      role: "ADMIN",
      professional: {
        create: {
          fullName: "Administração Equilíbrio",
          specialties: JSON.stringify(["Gestão"]),
          color: "#1D4ED8",
        },
      },
    },
    include: { professional: true },
  });

  const lizandra = await prisma.user.create({
    data: {
      email: "lizandra@equilibrio.fisio.br",
      passwordHash: await bcrypt.hash("fisio123", 10),
      role: "FISIOTERAPEUTA",
      professional: {
        create: {
          fullName: "Lizandra Gorski",
          crefito: "Resp. Técnica",
          specialties: JSON.stringify([
            "Fisioterapia",
            "Acupuntura",
            "Pilates Clínico",
            "Terapia Manual",
          ]),
          color: "#1D4ED8",
        },
      },
    },
    include: { professional: true },
  });

  const mirele = await prisma.user.create({
    data: {
      email: "mirele@equilibrio.fisio.br",
      passwordHash: await bcrypt.hash("fisio123", 10),
      role: "FISIOTERAPEUTA",
      professional: {
        create: {
          fullName: "Mirele T. Montes",
          crefito: "CREFITO 60102",
          specialties: JSON.stringify(["Fisioterapia", "RPG", "Fisio Aquática"]),
          color: "#DC2626",
        },
      },
    },
    include: { professional: true },
  });

  const jose = await prisma.user.create({
    data: {
      email: "jose@equilibrio.fisio.br",
      passwordHash: await bcrypt.hash("fisio123", 10),
      role: "FISIOTERAPEUTA",
      professional: {
        create: {
          fullName: "José Guilherme",
          specialties: JSON.stringify(["Fisioterapia", "Osteopatia", "Pilates", "Dry Needling"]),
          color: "#EAB308",
        },
      },
    },
    include: { professional: true },
  });

  await prisma.user.create({
    data: {
      email: "recepcao@equilibrio.fisio.br",
      passwordHash: await bcrypt.hash("recepcao123", 10),
      role: "RECEPCAO",
    },
  });

  const services = await Promise.all(
    [
      { name: "Fisioterapia", durationMin: 50, priceCents: 15000, isGroup: false },
      { name: "Avaliação Física", durationMin: 60, priceCents: 18000, isGroup: false },
      { name: "Acupuntura", durationMin: 50, priceCents: 16000, isGroup: false },
      { name: "RPG", durationMin: 50, priceCents: 16000, isGroup: false },
      { name: "Osteopatia", durationMin: 50, priceCents: 18000, isGroup: false },
      { name: "Terapia Manual", durationMin: 50, priceCents: 15000, isGroup: false },
      { name: "Massoterapia", durationMin: 50, priceCents: 14000, isGroup: false },
      { name: "Pilates em Grupo", durationMin: 50, priceCents: 9000, isGroup: true },
    ].map((s) => prisma.serviceType.create({ data: s })),
  );

  const rooms = await Promise.all([
    prisma.room.create({ data: { name: "Consultório 1", capacity: 1 } }),
    prisma.room.create({ data: { name: "Consultório 2", capacity: 1 } }),
    prisma.room.create({ data: { name: "Studio Pilates", capacity: 8 } }),
  ]);

  await Promise.all([
    prisma.category.create({ data: { name: "Sessões", kind: "RECEBER" } }),
    prisma.category.create({ data: { name: "Pacotes / Mensalidades", kind: "RECEBER" } }),
    prisma.category.create({ data: { name: "Aluguel", kind: "PAGAR" } }),
    prisma.category.create({ data: { name: "Fornecedores", kind: "PAGAR" } }),
    prisma.category.create({ data: { name: "Pró-labore", kind: "PAGAR" } }),
  ]);

  const patients = await Promise.all([
    prisma.patient.create({
      data: {
        fullName: "Ana Paula Silva",
        phone: "48999990001",
        whatsapp: "48999990001",
        isParticular: true,
      },
    }),
    prisma.patient.create({
      data: {
        fullName: "Carlos Eduardo Souza",
        phone: "48999990002",
        whatsapp: "48999990002",
        isParticular: true,
      },
    }),
    prisma.patient.create({
      data: {
        fullName: "Fernanda Lima",
        phone: "48999990003",
        whatsapp: "48999990003",
        isParticular: false,
        insuranceName: "Unimed",
      },
    }),
  ]);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setMinutes(50);

  await prisma.appointment.create({
    data: {
      patientId: patients[0].id,
      professionalId: lizandra.professional!.id,
      serviceTypeId: services[0].id,
      roomId: rooms[0].id,
      startsAt: tomorrow,
      endsAt: tomorrowEnd,
      status: "CONFIRMADO",
    },
  });

  const pilatesStart = new Date();
  pilatesStart.setDate(pilatesStart.getDate() + 1);
  pilatesStart.setHours(18, 0, 0, 0);
  const pilatesEnd = new Date(pilatesStart);
  pilatesEnd.setMinutes(50);

  const pilates = await prisma.classSession.create({
    data: {
      title: "Pilates Manhã / Noite",
      professionalId: jose.professional!.id,
      serviceTypeId: services.find((s) => s.isGroup)!.id,
      roomId: rooms[2].id,
      capacity: 6,
      startsAt: pilatesStart,
      endsAt: pilatesEnd,
    },
  });

  await prisma.classEnrollment.createMany({
    data: [
      { classSessionId: pilates.id, patientId: patients[0].id, status: "CONFIRMADO" },
      { classSessionId: pilates.id, patientId: patients[1].id, status: "CONFIRMADO" },
    ],
  });

  console.log("Seed OK");
  console.log("Admin: admin@equilibrio.fisio.br / admin123");
  console.log("Recepção: recepcao@equilibrio.fisio.br / recepcao123");
  console.log("Fisio: lizandra@equilibrio.fisio.br / fisio123");
  console.log("Users:", admin.email, mirele.email, jose.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
