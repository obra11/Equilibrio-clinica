import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async summary(role: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const canSeeFinance = role === "ADMIN" || role === "RECEPCAO";

    const [appointmentsToday, classesToday, openReceivables, openPayables, patientsCount] =
      await Promise.all([
        this.prisma.appointment.findMany({
          where: { startsAt: { gte: start, lte: end }, status: { not: "CANCELADO" } },
          include: { patient: true, professional: true, serviceType: true },
          orderBy: { startsAt: "asc" },
        }),
        this.prisma.classSession.findMany({
          where: { startsAt: { gte: start, lte: end } },
          include: {
            professional: true,
            enrollments: { include: { patient: true } },
          },
          orderBy: { startsAt: "asc" },
        }),
        canSeeFinance
          ? this.prisma.accountReceivable.findMany({
              where: { status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] } },
            })
          : Promise.resolve([]),
        canSeeFinance && role === "ADMIN"
          ? this.prisma.accountPayable.findMany({
              where: { status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] } },
            })
          : Promise.resolve([]),
        this.prisma.patient.count({ where: { active: true } }),
      ]);

    const receberAberto = openReceivables.reduce((s, r) => s + (r.amountCents - r.paidCents), 0);
    const pagarAberto = openPayables.reduce((s, r) => s + (r.amountCents - r.paidCents), 0);

    return {
      patientsCount,
      appointmentsToday,
      classesToday,
      receberAbertoCents: canSeeFinance ? receberAberto : null,
      pagarAbertoCents: role === "ADMIN" ? pagarAberto : null,
      openReceivablesCount: canSeeFinance ? openReceivables.length : null,
      openPayablesCount: role === "ADMIN" ? openPayables.length : null,
    };
  }
}
