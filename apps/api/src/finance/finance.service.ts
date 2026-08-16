import { randomUUID } from "crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function resolveStatus(amountCents: number, paidCents: number, current: string) {
  if (current === "CANCELADO") return "CANCELADO";
  if (paidCents <= 0) return "ABERTO";
  if (paidCents >= amountCents) return "PAGO";
  return "PARCIAL";
}

/** Soma meses preservando o dia quando possível (31/01 → 28/02). */
function addMonths(base: Date, months: number) {
  const d = new Date(base);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

function resolveRecurrenceMonths(recurring?: boolean, recurrenceMonths?: number) {
  if (!recurring) return 1;
  const n = Number(recurrenceMonths ?? 12);
  if (!Number.isFinite(n) || n < 1) throw new BadRequestException("Informe quantos meses repetir");
  if (n > 36) throw new BadRequestException("Máximo de 36 meses");
  return Math.floor(n);
}

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  listReceivables() {
    return this.prisma.accountReceivable.findMany({
      include: { patient: true, category: true, payments: true },
      orderBy: { dueDate: "desc" },
    });
  }

  listPayables() {
    return this.prisma.accountPayable.findMany({
      include: {
        category: true,
        payments: true,
        professional: {
          select: {
            id: true,
            fullName: true,
            pixKey: true,
            pixKeyType: true,
            bankName: true,
            bankAgency: true,
            bankAccount: true,
            bankAccountType: true,
            accountHolder: true,
          },
        },
      },
      orderBy: { dueDate: "desc" },
    });
  }

  async createReceivable(data: {
    patientId?: string | null;
    appointmentId?: string | null;
    categoryId?: string | null;
    description: string;
    amount: number;
    dueDate: string;
    notes?: string | null;
    recurring?: boolean;
    recurrenceMonths?: number;
  }) {
    const months = resolveRecurrenceMonths(data.recurring, data.recurrenceMonths);
    const amountCents = Math.round(data.amount * 100);
    const baseDue = new Date(data.dueDate);
    if (Number.isNaN(baseDue.getTime())) throw new BadRequestException("Vencimento inválido");
    const groupId = months > 1 ? randomUUID() : null;

    const created = [];
    for (let i = 0; i < months; i++) {
      const dueDate = addMonths(baseDue, i);
      const item = await this.prisma.accountReceivable.create({
        data: {
          patientId: data.patientId || null,
          appointmentId: i === 0 ? data.appointmentId || null : null,
          categoryId: data.categoryId || null,
          description:
            months > 1 ? `${data.description} (${i + 1}/${months})` : data.description,
          amountCents,
          dueDate,
          notes: data.notes || null,
          invoiceStatus: "PENDENTE",
          recurring: months > 1,
          recurrenceGroupId: groupId,
          recurrenceIndex: months > 1 ? i + 1 : null,
          recurrenceTotal: months > 1 ? months : null,
        },
        include: { patient: true, category: true },
      });
      created.push(item);
    }
    return months > 1 ? { count: created.length, items: created } : created[0];
  }

  async createPayable(data: {
    categoryId?: string | null;
    professionalId?: string | null;
    description: string;
    vendor?: string | null;
    amount: number;
    dueDate: string;
    notes?: string | null;
    recurring?: boolean;
    recurrenceMonths?: number;
  }) {
    const months = resolveRecurrenceMonths(data.recurring, data.recurrenceMonths);
    const amountCents = Math.round(data.amount * 100);
    const baseDue = new Date(data.dueDate);
    if (Number.isNaN(baseDue.getTime())) throw new BadRequestException("Vencimento inválido");
    const groupId = months > 1 ? randomUUID() : null;

    const professionalInclude = {
      select: {
        id: true,
        fullName: true,
        pixKey: true,
        bankName: true,
        bankAgency: true,
        bankAccount: true,
      },
    } as const;

    const created = [];
    for (let i = 0; i < months; i++) {
      const dueDate = addMonths(baseDue, i);
      const item = await this.prisma.accountPayable.create({
        data: {
          categoryId: data.categoryId || null,
          professionalId: data.professionalId || null,
          description:
            months > 1 ? `${data.description} (${i + 1}/${months})` : data.description,
          vendor: data.vendor || null,
          amountCents,
          dueDate,
          notes: data.notes || null,
          recurring: months > 1,
          recurrenceGroupId: groupId,
          recurrenceIndex: months > 1 ? i + 1 : null,
          recurrenceTotal: months > 1 ? months : null,
        },
        include: { professional: professionalInclude, category: true },
      });
      created.push(item);
    }
    return months > 1 ? { count: created.length, items: created } : created[0];
  }

  async payReceivable(
    id: string,
    data: { amount: number; method?: string; notes?: string | null; paidAt?: string },
  ) {
    const item = await this.prisma.accountReceivable.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    const amountCents = Math.round(data.amount * 100);
    if (amountCents <= 0) throw new BadRequestException("Valor inválido");
    const paidCents = item.paidCents + amountCents;
    const status = resolveStatus(item.amountCents, paidCents, item.status);
    await this.prisma.payment.create({
      data: {
        receivableId: id,
        amountCents,
        method: data.method || "PIX",
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        notes: data.notes || null,
      },
    });
    return this.prisma.accountReceivable.update({
      where: { id },
      data: { paidCents, status },
      include: { payments: true, patient: true },
    });
  }

  async payPayable(
    id: string,
    data: { amount: number; method?: string; notes?: string | null; paidAt?: string },
  ) {
    const item = await this.prisma.accountPayable.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    const amountCents = Math.round(data.amount * 100);
    const paidCents = item.paidCents + amountCents;
    const status = resolveStatus(item.amountCents, paidCents, item.status);
    await this.prisma.payment.create({
      data: {
        payableId: id,
        amountCents,
        method: data.method || "PIX",
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        notes: data.notes || null,
      },
    });
    return this.prisma.accountPayable.update({
      where: { id },
      data: { paidCents, status },
      include: { payments: true },
    });
  }

  categories() {
    return this.prisma.category.findMany({ orderBy: { name: "asc" } });
  }

  createCategory(data: { name: string; kind: string }) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException("Informe o nome da categoria");
    const kind = data.kind === "PAGAR" ? "PAGAR" : "RECEBER";
    return this.prisma.category.create({ data: { name, kind } });
  }

  async dashboard() {
    const openStatuses = ["ABERTO", "PARCIAL", "VENCIDO"];
    const [receivables, payables] = await Promise.all([
      this.prisma.accountReceivable.findMany({
        where: { status: { in: openStatuses } },
        include: { patient: true },
        orderBy: { dueDate: "asc" },
      }),
      this.prisma.accountPayable.findMany({
        where: { status: { in: openStatuses } },
        orderBy: { dueDate: "asc" },
      }),
    ]);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const remaining = (amount: number, paid: number) => Math.max(0, amount - paid);
    const isOverdue = (due: Date) => due < start;
    const isToday = (due: Date) => due >= start && due <= end;

    const receberAbertoCents = receivables.reduce(
      (s, r) => s + remaining(r.amountCents, r.paidCents),
      0,
    );
    const pagarAbertoCents = payables.reduce(
      (s, p) => s + remaining(p.amountCents, p.paidCents),
      0,
    );

    const receberVencido = receivables.filter((r) => isOverdue(r.dueDate));
    const pagarVencido = payables.filter((p) => isOverdue(p.dueDate));
    const receberHoje = receivables.filter((r) => isToday(r.dueDate));
    const pagarHoje = payables.filter((p) => isToday(p.dueDate));

    const debtorsMap = new Map<
      string,
      { patientId: string; fullName: string; totalCents: number; items: number }
    >();
    for (const r of receivables) {
      const rest = remaining(r.amountCents, r.paidCents);
      if (rest <= 0) continue;
      const key = r.patientId || "sem-paciente";
      const name = r.patient?.fullName || "Sem paciente vinculado";
      const cur = debtorsMap.get(key) || {
        patientId: r.patientId || "",
        fullName: name,
        totalCents: 0,
        items: 0,
      };
      cur.totalCents += rest;
      cur.items += 1;
      debtorsMap.set(key, cur);
    }

    const debtors = Array.from(debtorsMap.values()).sort((a, b) => b.totalCents - a.totalCents);

    return {
      receberAbertoCents,
      pagarAbertoCents,
      receberVencidoCents: receberVencido.reduce(
        (s, r) => s + remaining(r.amountCents, r.paidCents),
        0,
      ),
      pagarVencidoCents: pagarVencido.reduce(
        (s, p) => s + remaining(p.amountCents, p.paidCents),
        0,
      ),
      receberHojeCents: receberHoje.reduce(
        (s, r) => s + remaining(r.amountCents, r.paidCents),
        0,
      ),
      pagarHojeCents: pagarHoje.reduce((s, p) => s + remaining(p.amountCents, p.paidCents), 0),
      receberHoje,
      pagarHoje,
      receberVencido: receberVencido.slice(0, 10),
      pagarVencido: pagarVencido.slice(0, 10),
      debtors: debtors.slice(0, 10),
      openReceivablesCount: receivables.length,
      openPayablesCount: payables.length,
    };
  }
}
