import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsappService } from "../whatsapp/whatsapp.service";
import { withParsedAttachments } from "../clinical/clinical-attachments";

type PatientInput = {
  fullName: string;
  cpf?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  birthDate?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  isParticular?: boolean;
  insuranceName?: string | null;
  sendWelcomeWhatsapp?: boolean;
};

function cleanCpf(cpf?: string | null) {
  if (!cpf) return null;
  const digits = String(cpf).replace(/\D/g, "");
  return digits || null;
}

function cleanCep(cep?: string | null) {
  if (!cep) return null;
  const digits = String(cep).replace(/\D/g, "");
  return digits || null;
}

function cleanUf(state?: string | null) {
  if (!state) return null;
  const uf = String(state).trim().toUpperCase().slice(0, 2);
  return uf || null;
}

function mapPatientData(data: PatientInput) {
  return {
    fullName: data.fullName,
    cpf: cleanCpf(data.cpf),
    phone: data.phone || null,
    whatsapp: data.whatsapp || null,
    email: data.email || null,
    birthDate: data.birthDate ? new Date(data.birthDate) : null,
    zipCode: cleanCep(data.zipCode),
    street: data.street || null,
    number: data.number || null,
    complement: data.complement || null,
    neighborhood: data.neighborhood || null,
    city: data.city || null,
    state: cleanUf(data.state),
    notes: data.notes || null,
    isParticular: data.isParticular ?? true,
    insuranceName: data.insuranceName || null,
  };
}

function sanitizeWhatsappResult(
  result: Awaited<ReturnType<WhatsappService["sendWelcome"]>>,
) {
  return {
    ok: result.ok,
    status: result.status,
    to: result.to,
    from: result.from,
    provider: result.provider,
    detail: result.detail,
    message: result.message,
    waUrl: result.waUrl,
  };
}

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
  ) {}

  list(q?: string) {
    return this.prisma.patient.findMany({
      where: {
        active: true,
        ...(q
          ? {
              OR: [
                { fullName: { contains: q } },
                { phone: { contains: q } },
                { whatsapp: { contains: q } },
                { cpf: { contains: q.replace(/\D/g, "") || q } },
                { email: { contains: q } },
                { city: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { fullName: "asc" },
    });
  }

  async get(id: string, role = "ADMIN") {
    const patient = await this.prisma.patient.findFirst({
      where: { id, active: true },
      include: {
        appointments: {
          orderBy: { startsAt: "desc" },
          include: {
            professional: true,
            serviceType: true,
            room: true,
          },
        },
        enrollments: {
          orderBy: { createdAt: "desc" },
          include: {
            classSession: {
              include: {
                professional: true,
                serviceType: true,
                room: true,
              },
            },
          },
        },
        sessionNotes:
          role === "RECEPCAO"
            ? false
            : { orderBy: { createdAt: "desc" }, include: { professional: true } },
        assessments:
          role === "RECEPCAO"
            ? false
            : { orderBy: { createdAt: "desc" }, include: { professional: true } },
        receivables:
          role === "FISIOTERAPEUTA"
            ? false
            : { orderBy: { dueDate: "desc" }, take: 20 },
      },
    });
    if (!patient) throw new NotFoundException("Paciente não encontrado");
    return {
      ...patient,
      sessionNotes:
        role === "RECEPCAO"
          ? []
          : (patient.sessionNotes || []).map(withParsedAttachments),
      assessments:
        role === "RECEPCAO"
          ? []
          : (patient.assessments || []).map(withParsedAttachments),
      receivables: role === "FISIOTERAPEUTA" ? [] : patient.receivables,
    };
  }

  async create(data: PatientInput) {
    const patient = await this.prisma.patient.create({
      data: mapPatientData(data),
    });

    const sendWelcome = data.sendWelcomeWhatsapp !== false;
    const phone = patient.whatsapp || patient.phone;
    let welcomeWhatsapp = null as ReturnType<typeof sanitizeWhatsappResult> | null;
    if (sendWelcome) {
      welcomeWhatsapp = sanitizeWhatsappResult(
        await this.whatsapp.sendWelcome(patient.fullName, phone),
      );
    } else {
      welcomeWhatsapp = {
        ok: false,
        status: "skipped",
        to: undefined,
        provider: undefined,
        detail: "Envio de boas-vindas desmarcado no cadastro",
      };
    }

    return { ...patient, welcomeWhatsapp };
  }

  async sendWelcomeWhatsapp(id: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id, active: true } });
    if (!patient) throw new NotFoundException("Paciente não encontrado");
    return sanitizeWhatsappResult(
      await this.whatsapp.sendWelcome(patient.fullName, patient.whatsapp || patient.phone),
    );
  }

  async update(id: string, data: Record<string, unknown>) {
    await this.get(id);
    const patch: Record<string, unknown> = {};

    if (data.fullName !== undefined) patch.fullName = String(data.fullName);
    if (data.cpf !== undefined) patch.cpf = cleanCpf(data.cpf as string);
    if (data.phone !== undefined) patch.phone = (data.phone as string) || null;
    if (data.whatsapp !== undefined) patch.whatsapp = (data.whatsapp as string) || null;
    if (data.email !== undefined) patch.email = (data.email as string) || null;
    if (data.birthDate !== undefined) {
      patch.birthDate = data.birthDate ? new Date(String(data.birthDate)) : null;
    }
    if (data.zipCode !== undefined) patch.zipCode = cleanCep(data.zipCode as string);
    if (data.street !== undefined) patch.street = (data.street as string) || null;
    if (data.number !== undefined) patch.number = (data.number as string) || null;
    if (data.complement !== undefined) patch.complement = (data.complement as string) || null;
    if (data.neighborhood !== undefined) patch.neighborhood = (data.neighborhood as string) || null;
    if (data.city !== undefined) patch.city = (data.city as string) || null;
    if (data.state !== undefined) patch.state = cleanUf(data.state as string);
    if (data.notes !== undefined) patch.notes = (data.notes as string) || null;
    if (data.isParticular !== undefined) patch.isParticular = Boolean(data.isParticular);
    if (data.insuranceName !== undefined) patch.insuranceName = (data.insuranceName as string) || null;

    return this.prisma.patient.update({
      where: { id },
      data: patch,
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.patient.update({
      where: { id },
      data: { active: false },
    });
    return { ok: true };
  }

  async updatePhoto(id: string, photoUrl: string) {
    await this.get(id);
    return this.prisma.patient.update({
      where: { id },
      data: { photoUrl },
    });
  }
}
