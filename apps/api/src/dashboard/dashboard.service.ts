import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async summary() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

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
        this.prisma.accountReceivable.findMany({
          where: { status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] } },
        }),
        this.prisma.accountPayable.findMany({
          where: { status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] } },
        }),
        this.prisma.patient.count(),
      ]);

    const receberAberto = openReceivables.reduce((s, r) => s + (r.amountCents - r.paidCents), 0);
    const pagarAberto = openPayables.reduce((s, r) => s + (r.amountCents - r.paidCents), 0);

    return {
      patientsCount,
      appointmentsToday,
      classesToday,
      receberAbertoCents: receberAberto,
      pagarAbertoCents: pagarAberto,
      openReceivablesCount: openReceivables.length,
      openPayablesCount: openPayables.length,
    };
  }
}
