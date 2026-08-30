import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  ClinicalAttachment,
  parseClinicalAttachments,
  withParsedAttachments,
} from "./clinical-attachments";

@Injectable()
export class ClinicalService {
  constructor(private prisma: PrismaService) {}

  timeline(patientId: string) {
    return Promise.all([
      this.prisma.sessionNote.findMany({
        where: { patientId },
        include: { professional: true, appointment: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.physicalAssessment.findMany({
        where: { patientId },
        include: { professional: true },
        orderBy: { createdAt: "desc" },
      }),
    ]).then(([notes, assessments]) => ({
      notes: notes.map(withParsedAttachments),
      assessments: assessments.map(withParsedAttachments),
    }));
  }

  async createNote(data: {
    patientId: string;
    professionalId: string;
    appointmentId?: string | null;
    subjective?: string | null;
    objective?: string | null;
    assessment?: string | null;
    plan?: string | null;
  }) {
    const note = await this.prisma.sessionNote.create({
      data: {
        patientId: data.patientId,
        professionalId: data.professionalId,
        appointmentId: data.appointmentId || null,
        subjective: data.subjective || null,
        objective: data.objective || null,
        assessment: data.assessment || null,
        plan: data.plan || null,
      },
      include: { professional: true },
    });
    return withParsedAttachments(note);
  }

  async createAssessment(data: {
    patientId: string;
    professionalId: string;
    painVas?: number | null;
    romNotes?: string | null;
    strengthNotes?: string | null;
    functionalTests?: string | null;
    observations?: string | null;
  }) {
    const assessment = await this.prisma.physicalAssessment.create({
      data: {
        patientId: data.patientId,
        professionalId: data.professionalId,
        painVas: data.painVas ?? null,
        romNotes: data.romNotes || null,
        strengthNotes: data.strengthNotes || null,
        functionalTests: data.functionalTests || null,
        observations: data.observations || null,
      },
      include: { professional: true },
    });
    return withParsedAttachments(assessment);
  }

  async addNoteAttachment(
    id: string,
    item: Omit<ClinicalAttachment, "createdAt"> & { createdAt?: string },
  ) {
    const note = await this.prisma.sessionNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException("Evolução não encontrada");
    const list = parseClinicalAttachments(note.attachments);
    if (list.length >= 30) {
      throw new BadRequestException("Máximo de 30 anexos por evolução");
    }
    list.push({
      url: item.url,
      kind: item.kind,
      name: item.name,
      mime: item.mime,
      createdAt: item.createdAt || new Date().toISOString(),
    });
    const updated = await this.prisma.sessionNote.update({
      where: { id },
      data: { attachments: JSON.stringify(list) },
      include: { professional: true },
    });
    return withParsedAttachments(updated);
  }

  async removeNoteAttachment(id: string, url: string) {
    const note = await this.prisma.sessionNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException("Evolução não encontrada");
    const list = parseClinicalAttachments(note.attachments).filter((a) => a.url !== url);
    const updated = await this.prisma.sessionNote.update({
      where: { id },
      data: { attachments: list.length ? JSON.stringify(list) : null },
      include: { professional: true },
    });
    return withParsedAttachments(updated);
  }

  async addAssessmentAttachment(
    id: string,
    item: Omit<ClinicalAttachment, "createdAt"> & { createdAt?: string },
  ) {
    const row = await this.prisma.physicalAssessment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Avaliação não encontrada");
    const list = parseClinicalAttachments(row.attachments);
    if (list.length >= 30) {
      throw new BadRequestException("Máximo de 30 anexos por avaliação");
    }
    list.push({
      url: item.url,
      kind: item.kind,
      name: item.name,
      mime: item.mime,
      createdAt: item.createdAt || new Date().toISOString(),
    });
    const updated = await this.prisma.physicalAssessment.update({
      where: { id },
      data: { attachments: JSON.stringify(list) },
      include: { professional: true },
    });
    return withParsedAttachments(updated);
  }

  async removeAssessmentAttachment(id: string, url: string) {
    const row = await this.prisma.physicalAssessment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Avaliação não encontrada");
    const list = parseClinicalAttachments(row.attachments).filter((a) => a.url !== url);
    const updated = await this.prisma.physicalAssessment.update({
      where: { id },
      data: { attachments: list.length ? JSON.stringify(list) : null },
      include: { professional: true },
    });
    return withParsedAttachments(updated);
  }
}
