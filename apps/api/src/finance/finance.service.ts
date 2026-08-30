import { randomUUID } from "crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsappService, normalizeBrazilWhatsApp } from "../whatsapp/whatsapp.service";
import { EmailService } from "../email/email.service";

function resolveStatus(amountCents: number, paidCents: number, current: string) {
  if (current === "CANCELADO") return "CANCELADO";
  if (paidCents <= 0) return "ABERTO";
  if (paidCents >= amountCents) return "PAGO";
  return "PARCIAL";
}

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "olá";
}

type OverdueChannel = "email" | "whatsapp";

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
  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
    private email: EmailService,
  ) {}

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

  /** Mensagem padrão educada para cobrança de atraso. */
  overdueReminderMessage(params: {
    patientName: string;
    totalCents: number;
    items: Array<{ description: string; dueDate: Date; remainingCents: number }>;
  }) {
    const clinic =
      process.env.CLINIC_NAME || "Equilíbrio Fisioterapia e Bem-Estar";
    const name = firstName(params.patientName);
    const lines = params.items
      .slice(0, 8)
      .map(
        (i) =>
          `• ${i.description} — vencimento ${formatDateBR(i.dueDate)} — ${formatBRL(i.remainingCents)}`,
      );
    const extra =
      params.items.length > 8
        ? `\n• … e mais ${params.items.length - 8} lançamento(s)`
        : "";

    return (
      `Olá, ${name}.\n\n` +
      `Esperamos que esteja bem.\n\n` +
      `Passando para lembrar, com carinho, que há valor(es) em aberto conosco na ${clinic}, ` +
      `totalizando ${formatBRL(params.totalCents)}:\n\n` +
      `${lines.join("\n")}${extra}\n\n` +
      `Se o pagamento já tiver sido efetuado, por favor desconsidere esta mensagem. ` +
      `Caso precise de uma segunda via, renegociação ou qualquer esclarecimento, ` +
      `é só responder — teremos prazer em ajudar.\n\n` +
      `Agradecemos a atenção e a confiança.\n\n` +
      `Atenciosamente,\n` +
      `${clinic}\n` +
      `WhatsApp: ${this.whatsapp.clinicFromDisplay()}`
    );
  }

  private async loadOverdueByPatient(patientIds?: string[]) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const rows = await this.prisma.accountReceivable.findMany({
      where: {
        status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] },
        dueDate: { lt: start },
        patientId: patientIds?.length ? { in: patientIds } : { not: null },
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
            whatsapp: true,
            phone: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    const map = new Map<
      string,
      {
        patientId: string;
        fullName: string;
        email: string | null;
        whatsapp: string | null;
        phone: string | null;
        totalCents: number;
        items: Array<{
          id: string;
          description: string;
          dueDate: Date;
          remainingCents: number;
        }>;
      }
    >();

    for (const r of rows) {
      if (!r.patientId || !r.patient) continue;
      const rest = Math.max(0, r.amountCents - r.paidCents);
      if (rest <= 0) continue;
      const cur = map.get(r.patientId) || {
        patientId: r.patientId,
        fullName: r.patient.fullName,
        email: r.patient.email,
        whatsapp: r.patient.whatsapp,
        phone: r.patient.phone,
        totalCents: 0,
        items: [],
      };
      cur.totalCents += rest;
      cur.items.push({
        id: r.id,
        description: r.description,
        dueDate: r.dueDate,
        remainingCents: rest,
      });
      map.set(r.patientId, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.totalCents - a.totalCents);
  }

  async previewOverdueReminders(patientIds?: string[]) {
    const groups = await this.loadOverdueByPatient(patientIds);
    return {
      sampleMessage:
        groups[0]
          ? this.overdueReminderMessage({
              patientName: groups[0].fullName,
              totalCents: groups[0].totalCents,
              items: groups[0].items,
            })
          : this.overdueReminderMessage({
              patientName: "Paciente",
              totalCents: 0,
              items: [
                {
                  description: "Exemplo de lançamento",
                  dueDate: new Date(),
                  remainingCents: 0,
                },
              ],
            }),
      patients: groups.map((g) => ({
        patientId: g.patientId,
        fullName: g.fullName,
        totalCents: g.totalCents,
        items: g.items.length,
        email: g.email,
        phone: g.whatsapp || g.phone,
        canEmail: Boolean(g.email?.includes("@")),
        canWhatsapp: Boolean(normalizeBrazilWhatsApp(g.whatsapp || g.phone)),
      })),
      emailProvider: this.email.provider,
      whatsappProvider: this.whatsapp.provider,
    };
  }

  async sendOverdueReminders(data: {
    channels?: OverdueChannel[];
    patientIds?: string[];
  }) {
    const channels = (data.channels || []).filter(
      (c): c is OverdueChannel => c === "email" || c === "whatsapp",
    );
    if (!channels.length) {
      throw new BadRequestException("Selecione e-mail e/ou WhatsApp");
    }

    const groups = await this.loadOverdueByPatient(data.patientIds);
    if (!groups.length) {
      return {
        sent: 0,
        results: [],
        detail: "Nenhum paciente com título vencido em aberto",
      };
    }

    const results: Array<{
      patientId: string;
      fullName: string;
      totalCents: number;
      message: string;
      email?: Awaited<ReturnType<EmailService["sendText"]>>;
      whatsapp?: Awaited<ReturnType<WhatsappService["sendText"]>> & { waUrl?: string };
    }> = [];

    for (const g of groups) {
      const message = this.overdueReminderMessage({
        patientName: g.fullName,
        totalCents: g.totalCents,
        items: g.items,
      });
      const entry: (typeof results)[number] = {
        patientId: g.patientId,
        fullName: g.fullName,
        totalCents: g.totalCents,
        message,
      };

      if (channels.includes("email")) {
        if (!g.email) {
          entry.email = {
            ok: false,
            status: "skipped",
            detail: "Paciente sem e-mail cadastrado",
          };
        } else {
          entry.email = await this.email.sendText({
            to: g.email,
            subject: `Lembrete amigável — valores em aberto | ${process.env.CLINIC_NAME || "Equilíbrio"}`,
            text: message,
          });
        }
      }

      if (channels.includes("whatsapp")) {
        const phone = g.whatsapp || g.phone;
        const normalized = normalizeBrazilWhatsApp(phone);
        const waUrl = normalized
          ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
          : undefined;
        if (!phone || !normalized) {
          entry.whatsapp = {
            ok: false,
            status: "skipped",
            detail: "Paciente sem WhatsApp/telefone válido",
            waUrl,
          };
        } else {
          const sent = await this.whatsapp.sendText(phone, message);
          entry.whatsapp = { ...sent, waUrl };
        }
      }

      results.push(entry);
    }

    const sent = results.filter((r) => r.email?.ok || r.whatsapp?.ok).length;

    return { sent, total: results.length, channels, results };
  }

  async dashboard(role = "ADMIN", yearParam?: number) {
    const openStatuses = ["ABERTO", "PARCIAL", "VENCIDO"];
    const canSeePayables = role === "ADMIN";
    const year = yearParam || new Date().getFullYear();
    const yearStart = new Date(year, 0, 1, 0, 0, 0, 0);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const in30 = new Date(start);
    in30.setDate(in30.getDate() + 30);
    const in90 = new Date(start);
    in90.setDate(in90.getDate() + 90);

    const remaining = (amount: number, paid: number) => Math.max(0, amount - paid);
    const isOverdue = (due: Date) => due < start;
    const isToday = (due: Date) => due >= start && due <= end;

    const [
      receivables,
      payables,
      yearReceivables,
      yearPayables,
      yearInPayments,
      yearOutPayments,
    ] = await Promise.all([
      this.prisma.accountReceivable.findMany({
        where: { status: { in: openStatuses } },
        include: { patient: true, category: true },
        orderBy: { dueDate: "asc" },
      }),
      canSeePayables
        ? this.prisma.accountPayable.findMany({
            where: { status: { in: openStatuses } },
            include: { category: true },
            orderBy: { dueDate: "asc" },
          })
        : Promise.resolve([]),
      this.prisma.accountReceivable.findMany({
        where: {
          dueDate: { gte: yearStart, lte: yearEnd },
          status: { not: "CANCELADO" },
        },
        include: {
          category: true,
          appointment: { include: { serviceType: true } },
        },
      }),
      canSeePayables
        ? this.prisma.accountPayable.findMany({
            where: {
              dueDate: { gte: yearStart, lte: yearEnd },
              status: { not: "CANCELADO" },
            },
            include: { category: true },
          })
        : Promise.resolve([]),
      this.prisma.payment.findMany({
        where: {
          receivableId: { not: null },
          paidAt: { gte: yearStart, lte: yearEnd },
        },
        include: {
          receivable: {
            include: {
              category: true,
              appointment: { include: { serviceType: true } },
            },
          },
        },
      }),
      canSeePayables
        ? this.prisma.payment.findMany({
            where: {
              payableId: { not: null },
              paidAt: { gte: yearStart, lte: yearEnd },
            },
          })
        : Promise.resolve([]),
    ]);

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

    const receberVencidoCents = receberVencido.reduce(
      (s, r) => s + remaining(r.amountCents, r.paidCents),
      0,
    );
    const pagarVencidoCents = pagarVencido.reduce(
      (s, p) => s + remaining(p.amountCents, p.paidCents),
      0,
    );

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

    // --- Indicadores ---
    const inadimplenciaPct =
      receberAbertoCents > 0
        ? Math.round((receberVencidoCents / receberAbertoCents) * 1000) / 10
        : 0;

    const yearBilledCents = yearReceivables.reduce((s, r) => s + r.amountCents, 0);
    const yearReceivedCents = yearInPayments.reduce((s, p) => s + p.amountCents, 0);
    const yearPaidOutCents = yearOutPayments.reduce((s, p) => s + p.amountCents, 0);
    const yearReceivablePaidOnTitles = yearReceivables.reduce((s, r) => s + r.paidCents, 0);
    const taxaRecebimentoPct =
      yearBilledCents > 0
        ? Math.round((yearReceivablePaidOnTitles / yearBilledCents) * 1000) / 10
        : 0;
    const ticketMedioCents =
      yearReceivables.length > 0
        ? Math.round(yearBilledCents / yearReceivables.length)
        : 0;

    // Fluxo mensal do ano
    const cashFlowMonths = Array.from({ length: 12 }, (_, month) => {
      const label = new Date(year, month, 1).toLocaleDateString("pt-BR", {
        month: "short",
      });
      let inCents = 0;
      let outCents = 0;
      let projectedInCents = 0;
      let projectedOutCents = 0;

      for (const p of yearInPayments) {
        if (new Date(p.paidAt).getMonth() === month) inCents += p.amountCents;
      }
      for (const p of yearOutPayments) {
        if (new Date(p.paidAt).getMonth() === month) outCents += p.amountCents;
      }
      for (const r of yearReceivables) {
        if (new Date(r.dueDate).getMonth() === month) {
          projectedInCents += remaining(r.amountCents, r.paidCents);
        }
      }
      for (const p of yearPayables) {
        if (new Date(p.dueDate).getMonth() === month) {
          projectedOutCents += remaining(p.amountCents, p.paidCents);
        }
      }

      return {
        month: month + 1,
        label: label.replace(".", ""),
        inCents,
        outCents,
        projectedInCents,
        projectedOutCents,
        netCents: inCents - outCents,
        projectedNetCents: inCents - outCents + projectedInCents - projectedOutCents,
      };
    });

    const byCategoryMap = new Map<
      string,
      { name: string; billedCents: number; receivedCents: number; openCents: number }
    >();
    for (const r of yearReceivables) {
      const name = r.category?.name || "Sem categoria";
      const cur = byCategoryMap.get(name) || {
        name,
        billedCents: 0,
        receivedCents: 0,
        openCents: 0,
      };
      cur.billedCents += r.amountCents;
      cur.receivedCents += r.paidCents;
      cur.openCents += remaining(r.amountCents, r.paidCents);
      byCategoryMap.set(name, cur);
    }
    const byCategory = Array.from(byCategoryMap.values()).sort(
      (a, b) => b.billedCents - a.billedCents,
    );

    const byServiceMap = new Map<
      string,
      { name: string; billedCents: number; receivedCents: number; count: number }
    >();
    for (const r of yearReceivables) {
      const name =
        r.appointment?.serviceType?.name ||
        (r.description?.split("—")[0]?.trim() || "Outros / avulso");
      const cur = byServiceMap.get(name) || {
        name,
        billedCents: 0,
        receivedCents: 0,
        count: 0,
      };
      cur.billedCents += r.amountCents;
      cur.receivedCents += r.paidCents;
      cur.count += 1;
      byServiceMap.set(name, cur);
    }
    const byServiceType = Array.from(byServiceMap.values()).sort(
      (a, b) => b.billedCents - a.billedCents,
    );

    const futurosReceber = receivables
      .filter((r) => r.dueDate > end && r.dueDate <= in90)
      .map((r) => ({
        id: r.id,
        description: r.description,
        dueDate: r.dueDate,
        remainingCents: remaining(r.amountCents, r.paidCents),
        patientName: r.patient?.fullName || null,
        within30: r.dueDate <= in30,
      }))
      .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));

    const futurosPagar = payables
      .filter((p) => p.dueDate > end && p.dueDate <= in90)
      .map((p) => ({
        id: p.id,
        description: p.description,
        dueDate: p.dueDate,
        remainingCents: remaining(p.amountCents, p.paidCents),
        vendor: p.vendor || null,
        within30: p.dueDate <= in30,
      }))
      .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));

    const futuros30ReceberCents = futurosReceber
      .filter((f) => f.within30)
      .reduce((s, f) => s + f.remainingCents, 0);
    const futuros30PagarCents = futurosPagar
      .filter((f) => f.within30)
      .reduce((s, f) => s + f.remainingCents, 0);

    return {
      year,
      receberAbertoCents,
      pagarAbertoCents,
      receberVencidoCents,
      pagarVencidoCents,
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
      indicators: {
        inadimplenciaPct,
        taxaRecebimentoPct,
        ticketMedioCents,
        yearBilledCents,
        yearReceivedCents,
        yearPaidOutCents,
        yearNetCents: yearReceivedCents - yearPaidOutCents,
        futuros30ReceberCents,
        futuros30PagarCents,
        saldoProjetado30Cents: futuros30ReceberCents - futuros30PagarCents,
      },
      cashFlowMonths,
      byCategory,
      byServiceType,
      futurosReceber: futurosReceber.slice(0, 15),
      futurosPagar: futurosPagar.slice(0, 15),
    };
  }
}
