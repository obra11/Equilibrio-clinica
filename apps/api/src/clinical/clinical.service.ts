import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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
    ]).then(([notes, assessments]) => ({ notes, assessments }));
  }

  createNote(data: {
    patientId: string;
    professionalId: string;
    appointmentId?: string | null;
    subjective?: string | null;
    objective?: string | null;
    assessment?: string | null;
    plan?: string | null;
  }) {
    return this.prisma.sessionNote.create({
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
  }

  createAssessment(data: {
    patientId: string;
    professionalId: string;
    painVas?: number | null;
    romNotes?: string | null;
    strengthNotes?: string | null;
    functionalTests?: string | null;
    observations?: string | null;
  }) {
    return this.prisma.physicalAssessment.create({
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
  }
}
