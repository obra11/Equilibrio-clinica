import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  list(params: { from?: string; to?: string; professionalId?: string }) {
    const from = params.from ? new Date(params.from) : undefined;
    const to = params.to ? new Date(params.to) : undefined;
    return this.prisma.appointment.findMany({
      where: {
        ...(params.professionalId ? { professionalId: params.professionalId } : {}),
        ...(from || to
          ? {
              startsAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: {
        patient: true,
        professional: true,
        serviceType: true,
        room: true,
        receivables: true,
      },
      orderBy: { startsAt: "asc" },
    });
  }

  private async assertNoConflict(
    professionalId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
  ) {
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        professionalId,
        status: { not: "CANCELADO" },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (conflict) {
      throw new BadRequestException("Conflito de horário com outro atendimento deste profissional");
    }
  }

  private async resolvePriceCents(
    serviceTypeId: string,
    price?: number | null,
    priceCents?: number | null,
  ) {
    if (priceCents != null && !Number.isNaN(Number(priceCents))) {
      return Math.max(0, Math.round(Number(priceCents)));
    }
    if (price != null && !Number.isNaN(Number(price))) {
      return Math.max(0, Math.round(Number(price) * 100));
    }
    const service = await this.prisma.serviceType.findUnique({ where: { id: serviceTypeId } });
    return service?.priceCents ?? 0;
  }

  private async syncReceivable(params: {
    appointmentId: string;
    patientId: string;
    serviceName: string;
    startsAt: Date;
    priceCents: number;
    billingType: string;
    status: string;
  }) {
    const existing = await this.prisma.accountReceivable.findFirst({
      where: { appointmentId: params.appointmentId },
      orderBy: { createdAt: "asc" },
    });

    const shouldCharge =
      params.billingType === "AVULSA" &&
      params.priceCents > 0 &&
      params.status !== "CANCELADO" &&
      params.status !== "FALTA";

    if (!shouldCharge) {
      if (existing && (existing.status === "ABERTO" || existing.status === "VENCIDO")) {
        await this.prisma.accountReceivable.update({
          where: { id: existing.id },
          data: { status: "CANCELADO" },
        });
      }
      return;
    }

    const description = `${params.serviceName} — ${params.startsAt.toLocaleString("pt-BR")}`;
    const dueDate = params.startsAt;

    if (!existing) {
      await this.prisma.accountReceivable.create({
        data: {
          patientId: params.patientId,
          appointmentId: params.appointmentId,
          description,
          amountCents: params.priceCents,
          dueDate,
          status: "ABERTO",
          invoiceStatus: "PENDENTE",
        },
      });
      return;
    }

    if (existing.status === "PAGO" || existing.status === "PARCIAL") {
      // não altera títulos já pagos/parciais automaticamente
      return;
    }

    await this.prisma.accountReceivable.update({
      where: { id: existing.id },
      data: {
        patientId: params.patientId,
        description,
        amountCents: params.priceCents,
        dueDate,
        status: existing.status === "CANCELADO" ? "ABERTO" : existing.status,
        invoiceStatus: existing.invoiceStatus === "NAO_APLICAVEL" ? "PENDENTE" : existing.invoiceStatus,
      },
    });
  }

  async create(data: {
    patientId: string;
    professionalId: string;
    serviceTypeId: string;
    roomId?: string | null;
    startsAt: string;
    endsAt: string;
    status?: string;
    notes?: string | null;
    price?: number | null;
    priceCents?: number | null;
    billingType?: string;
  }) {
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException("Horário inválido");
    await this.assertNoConflict(data.professionalId, startsAt, endsAt);

    const service = await this.prisma.serviceType.findUnique({ where: { id: data.serviceTypeId } });
    if (!service) throw new BadRequestException("Serviço inválido");

    const priceCents = await this.resolvePriceCents(
      data.serviceTypeId,
      data.price,
      data.priceCents,
    );
    const billingType = (data.billingType || "AVULSA").toUpperCase();
    const status = data.status || "AGENDADO";

    const created = await this.prisma.appointment.create({
      data: {
        patientId: data.patientId,
        professionalId: data.professionalId,
        serviceTypeId: data.serviceTypeId,
        roomId: data.roomId || null,
        startsAt,
        endsAt,
        status,
        priceCents,
        billingType,
        notes: data.notes || null,
      },
      include: {
        patient: true,
        professional: true,
        serviceType: true,
        room: true,
        receivables: true,
      },
    });

    await this.syncReceivable({
      appointmentId: created.id,
      patientId: created.patientId,
      serviceName: service.name,
      startsAt,
      priceCents,
      billingType,
      status,
    });

    return this.prisma.appointment.findUnique({
      where: { id: created.id },
      include: {
        patient: true,
        professional: true,
        serviceType: true,
        room: true,
        receivables: true,
      },
    });
  }

  async update(
    id: string,
    data: {
      patientId?: string;
      professionalId?: string;
      serviceTypeId?: string;
      roomId?: string | null;
      startsAt?: string;
      endsAt?: string;
      status?: string;
      notes?: string | null;
      price?: number | null;
      priceCents?: number | null;
      billingType?: string;
    },
  ) {
    const current = await this.prisma.appointment.findUnique({
      where: { id },
      include: { serviceType: true },
    });
    if (!current) throw new NotFoundException("Agendamento não encontrado");

    const professionalId = data.professionalId ?? current.professionalId;
    const serviceTypeId = data.serviceTypeId ?? current.serviceTypeId;
    const patientId = data.patientId ?? current.patientId;
    const startsAt = data.startsAt ? new Date(data.startsAt) : current.startsAt;
    let endsAt = data.endsAt ? new Date(data.endsAt) : current.endsAt;

    if (data.startsAt && !data.endsAt) {
      const durationMs = current.endsAt.getTime() - current.startsAt.getTime();
      endsAt = new Date(startsAt.getTime() + (durationMs > 0 ? durationMs : 50 * 60 * 1000));
    }

    if (endsAt <= startsAt) throw new BadRequestException("Horário inválido");

    const status = data.status ?? current.status;
    if (status !== "CANCELADO") {
      await this.assertNoConflict(professionalId, startsAt, endsAt, id);
    }

    const priceCents =
      data.price != null || data.priceCents != null
        ? await this.resolvePriceCents(serviceTypeId, data.price, data.priceCents)
        : current.priceCents;
    const billingType = data.billingType
      ? String(data.billingType).toUpperCase()
      : current.billingType;

    const service = await this.prisma.serviceType.findUnique({ where: { id: serviceTypeId } });

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        patientId,
        professionalId,
        serviceTypeId,
        ...(data.roomId !== undefined ? { roomId: data.roomId || null } : {}),
        startsAt,
        endsAt,
        status,
        priceCents,
        billingType,
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      },
      include: {
        patient: true,
        professional: true,
        serviceType: true,
        room: true,
        receivables: true,
      },
    });

    await this.syncReceivable({
      appointmentId: updated.id,
      patientId: updated.patientId,
      serviceName: service?.name || updated.serviceType.name,
      startsAt,
      priceCents,
      billingType,
      status,
    });

    return this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: true,
        professional: true,
        serviceType: true,
        room: true,
        receivables: true,
      },
    });
  }

  async updateStatus(id: string, status: string) {
    return this.update(id, { status });
  }
}
