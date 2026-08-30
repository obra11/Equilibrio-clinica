import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AppointmentsService } from "../appointments/appointments.service";
import { ClassesService } from "../classes/classes.service";

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private appointments: AppointmentsService,
    private classes: ClassesService,
  ) {}

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

  async remindToday(scope: "appointments" | "classes" | "all" = "all") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const appointmentResults = [];
    const classResults = [];

    if (scope === "appointments" || scope === "all") {
      const appts = await this.prisma.appointment.findMany({
        where: {
          startsAt: { gte: start, lte: end },
          status: { not: "CANCELADO" },
        },
        select: { id: true },
        orderBy: { startsAt: "asc" },
      });
      for (const a of appts) {
        appointmentResults.push(await this.appointments.sendReminder(a.id));
      }
    }

    if (scope === "classes" || scope === "all") {
      const sessions = await this.prisma.classSession.findMany({
        where: { startsAt: { gte: start, lte: end } },
        select: { id: true },
        orderBy: { startsAt: "asc" },
      });
      for (const c of sessions) {
        classResults.push(await this.classes.sendReminders(c.id));
      }
    }

    return {
      scope,
      appointments: {
        total: appointmentResults.length,
        sent: appointmentResults.filter((r) => r.ok).length,
        results: appointmentResults,
      },
      classes: {
        total: classResults.length,
        sent: classResults.reduce((s, c) => s + (c.sent || 0), 0),
        results: classResults,
      },
    };
  }
}
