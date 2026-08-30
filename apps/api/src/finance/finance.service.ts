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
      `${clinic}`
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

  async dashboard(role = "ADMIN") {
    const openStatuses = ["ABERTO", "PARCIAL", "VENCIDO"];
    const canSeePayables = role === "ADMIN";
    const [receivables, payables] = await Promise.all([
      this.prisma.accountReceivable.findMany({
        where: { status: { in: openStatuses } },
        include: { patient: true },
        orderBy: { dueDate: "asc" },
      }),
      canSeePayables
        ? this.prisma.accountPayable.findMany({
            where: { status: { in: openStatuses } },
            orderBy: { dueDate: "asc" },
          })
        : Promise.resolve([]),
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
