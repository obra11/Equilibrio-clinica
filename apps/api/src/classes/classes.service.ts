import { randomUUID } from "crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsappService } from "../whatsapp/whatsapp.service";
import { EmailService } from "../email/email.service";

export type LessonPlanMediaItem = {
  url: string;
  kind: "image" | "video";
  name?: string;
  createdAt: string;
};

function parseLessonMedia(raw?: string | null): LessonPlanMediaItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LessonPlanMediaItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseWeekdays(weekdays?: number[] | null) {
  if (!weekdays?.length) return [] as number[];
  const unique = [...new Set(weekdays.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6))];
  return unique.sort((a, b) => a - b);
}

function generateOccurrences(
  startsAt: Date,
  until: Date,
  weekdays: number[],
  durationMinutes: number,
) {
  if (!weekdays.length) {
    const endsAt = new Date(startsAt);
    endsAt.setMinutes(endsAt.getMinutes() + durationMinutes);
    return [{ startsAt, endsAt }];
  }

  const results: Array<{ startsAt: Date; endsAt: Date }> = [];
  const hours = startsAt.getHours();
  const minutes = startsAt.getMinutes();
  const cursor = new Date(startsAt);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(until);
  limit.setHours(23, 59, 59, 999);

  while (cursor <= limit) {
    if (weekdays.includes(cursor.getDay())) {
      const sessionStart = new Date(cursor);
      sessionStart.setHours(hours, minutes, 0, 0);
      if (sessionStart.getTime() + 1000 >= startsAt.getTime()) {
        const sessionEnd = new Date(sessionStart);
        sessionEnd.setMinutes(sessionEnd.getMinutes() + durationMinutes);
        results.push({ startsAt: sessionStart, endsAt: sessionEnd });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}

@Injectable()
export class ClassesService {
  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
    private email: EmailService,
  ) {}

  private async assertNoScheduleConflict(params: {
    professionalId: string;
    roomId?: string | null;
    startsAt: Date;
    endsAt: Date;
    excludeClassId?: string;
  }) {
    const { professionalId, startsAt, endsAt, excludeClassId } = params;
    const roomId = params.roomId?.trim() || null;

    const apptPro = await this.prisma.appointment.findFirst({
      where: {
        professionalId,
        status: { not: "CANCELADO" },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      include: { professional: true },
    });
    if (apptPro) {
      throw new BadRequestException(
        `Conflito: ${apptPro.professional.fullName} já tem atendimento neste horário.`,
      );
    }

    const classPro = await this.prisma.classSession.findFirst({
      where: {
        professionalId,
        ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      include: { professional: true },
    });
    if (classPro) {
      throw new BadRequestException(
        `Conflito: ${classPro.professional.fullName} já tem outra aula neste horário.`,
      );
    }

    if (roomId) {
      const apptRoom = await this.prisma.appointment.findFirst({
        where: {
          roomId,
          status: { not: "CANCELADO" },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        include: { room: true },
      });
      if (apptRoom) {
        throw new BadRequestException(
          `Conflito: a sala ${apptRoom.room?.name || ""} já tem atendimento neste horário.`,
        );
      }

      const classRoom = await this.prisma.classSession.findFirst({
        where: {
          roomId,
          ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        include: { room: true },
      });
      if (classRoom) {
        throw new BadRequestException(
          `Conflito: a sala ${classRoom.room?.name || ""} já tem outra aula neste horário.`,
        );
      }
    }
  }

  list(params: { from?: string; to?: string }) {
    const from = params.from ? new Date(params.from) : undefined;
    const to = params.to ? new Date(params.to) : undefined;
    return this.prisma.classSession.findMany({
      where:
        from || to
          ? {
              startsAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : undefined,
      include: {
        professional: true,
        serviceType: true,
        room: true,
        enrollments: { include: { patient: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { startsAt: "asc" },
    });
  }

  async get(id: string) {
    const session = await this.prisma.classSession.findUnique({
      where: { id },
      include: {
        professional: true,
        serviceType: true,
        room: true,
        enrollments: { include: { patient: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!session) throw new NotFoundException("Aula não encontrada");
    return {
      ...session,
      weekdays: JSON.parse(session.weekdays || "[]") as number[],
      lessonPlanMedia: parseLessonMedia(session.lessonPlanMedia),
    };
  }

  async create(data: {
    title: string;
    professionalId: string;
    serviceTypeId: string;
    roomId?: string | null;
    capacity: number;
    startsAt: string;
    endsAt?: string;
    notes?: string | null;
    lessonPlan?: string | null;
    weekdays?: number[];
    repeatUntil?: string | null;
    weeksCount?: number | null;
    durationMinutes?: number;
  }) {
    const startsAt = new Date(data.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException("Data/hora de início inválida");
    }

    let durationMinutes = data.durationMinutes;
    if (!durationMinutes && data.endsAt) {
      const ends = new Date(data.endsAt);
      durationMinutes = Math.max(15, Math.round((ends.getTime() - startsAt.getTime()) / 60000));
    }
    if (!durationMinutes || durationMinutes < 15) durationMinutes = 50;

    const weekdays = parseWeekdays(data.weekdays);
    let until: Date;
    if (data.repeatUntil) {
      until = new Date(data.repeatUntil);
      if (Number.isNaN(until.getTime())) {
        throw new BadRequestException("Data final da repetição inválida");
      }
    } else if (weekdays.length && data.weeksCount) {
      const weeks = Math.min(52, Math.max(1, Math.floor(Number(data.weeksCount))));
      until = new Date(startsAt);
      until.setDate(until.getDate() + weeks * 7 - 1);
    } else if (weekdays.length) {
      until = new Date(startsAt);
      until.setDate(until.getDate() + 8 * 7 - 1);
    } else {
      until = startsAt;
    }

    if (until < startsAt) {
      throw new BadRequestException("A data final deve ser após o início");
    }

    const occurrences = generateOccurrences(startsAt, until, weekdays, durationMinutes);
    if (!occurrences.length) {
      throw new BadRequestException(
        "Nenhuma aula gerada — confira os dias da semana e o período",
      );
    }
    if (occurrences.length > 120) {
      throw new BadRequestException("Máximo de 120 aulas por vez — reduza o período");
    }

    const roomId = data.roomId || null;
    for (const occ of occurrences) {
      await this.assertNoScheduleConflict({
        professionalId: data.professionalId,
        roomId,
        startsAt: occ.startsAt,
        endsAt: occ.endsAt,
      });
    }

    const seriesGroupId = occurrences.length > 1 ? randomUUID() : null;
    const weekdaysJson = weekdays.length ? JSON.stringify(weekdays) : null;

    const created = [];
    for (const occ of occurrences) {
      const item = await this.prisma.classSession.create({
        data: {
          title: data.title,
          professionalId: data.professionalId,
          serviceTypeId: data.serviceTypeId,
          roomId,
          capacity: data.capacity,
          startsAt: occ.startsAt,
          endsAt: occ.endsAt,
          notes: data.notes || null,
          lessonPlan: data.lessonPlan || null,
          seriesGroupId,
          weekdays: weekdaysJson,
        },
        include: {
          professional: true,
          serviceType: true,
          room: true,
          enrollments: { include: { patient: true } },
        },
      });
      created.push(item);
    }

    if (created.length === 1) {
      return { ...created[0], weekdays };
    }
    return {
      count: created.length,
      seriesGroupId,
      weekdays,
      items: created,
      id: created[0].id,
    };
  }

  async update(
    id: string,
    data: {
      title?: string;
      professionalId?: string;
      serviceTypeId?: string;
      roomId?: string | null;
      capacity?: number;
      startsAt?: string;
      endsAt?: string;
      notes?: string | null;
      lessonPlan?: string | null;
    },
  ) {
    const current = await this.get(id);
    const professionalId = data.professionalId ?? current.professionalId;
    const roomId = data.roomId !== undefined ? data.roomId || null : current.roomId;
    const startsAt = data.startsAt ? new Date(data.startsAt) : current.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : current.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException("Horário inválido");
    }

    await this.assertNoScheduleConflict({
      professionalId,
      roomId,
      startsAt,
      endsAt,
      excludeClassId: id,
    });

    const updated = await this.prisma.classSession.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        professionalId,
        ...(data.serviceTypeId !== undefined ? { serviceTypeId: data.serviceTypeId } : {}),
        roomId,
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        startsAt,
        endsAt,
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        ...(data.lessonPlan !== undefined ? { lessonPlan: data.lessonPlan || null } : {}),
      },
      include: {
        professional: true,
        serviceType: true,
        room: true,
        enrollments: { include: { patient: true }, orderBy: { createdAt: "asc" } },
      },
    });
    return {
      ...updated,
      weekdays: JSON.parse(updated.weekdays || "[]") as number[],
      lessonPlanMedia: parseLessonMedia(updated.lessonPlanMedia),
    };
  }

  async addLessonMedia(
    id: string,
    item: { url: string; kind: "image" | "video"; name?: string },
  ) {
    const session = await this.prisma.classSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException("Aula não encontrada");
    const media = parseLessonMedia(session.lessonPlanMedia);
    if (media.length >= 24) {
      throw new BadRequestException("Máximo de 24 mídias por plano de aula");
    }
    media.push({
      url: item.url,
      kind: item.kind,
      name: item.name,
      createdAt: new Date().toISOString(),
    });
    const updated = await this.prisma.classSession.update({
      where: { id },
      data: { lessonPlanMedia: JSON.stringify(media) },
      include: {
        professional: true,
        serviceType: true,
        room: true,
        enrollments: { include: { patient: true }, orderBy: { createdAt: "asc" } },
      },
    });
    return {
      ...updated,
      weekdays: JSON.parse(updated.weekdays || "[]") as number[],
      lessonPlanMedia: parseLessonMedia(updated.lessonPlanMedia),
    };
  }

  async removeLessonMedia(id: string, url: string) {
    const session = await this.prisma.classSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException("Aula não encontrada");
    const media = parseLessonMedia(session.lessonPlanMedia).filter((m) => m.url !== url);
    const updated = await this.prisma.classSession.update({
      where: { id },
      data: { lessonPlanMedia: media.length ? JSON.stringify(media) : null },
      include: {
        professional: true,
        serviceType: true,
        room: true,
        enrollments: { include: { patient: true }, orderBy: { createdAt: "asc" } },
      },
    });
    return {
      ...updated,
      weekdays: JSON.parse(updated.weekdays || "[]") as number[],
      lessonPlanMedia: parseLessonMedia(updated.lessonPlanMedia),
    };
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.classSession.delete({ where: { id } });
    return { ok: true };
  }

  async enroll(
    classSessionId: string,
    patientId: string,
    status = "CONFIRMADO",
    isMakeup = false,
  ) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: classSessionId },
      include: { enrollments: true },
    });
    if (!session) throw new NotFoundException("Aula não encontrada");
    const active = session.enrollments.filter(
      (e) =>
        e.patientId !== patientId &&
        (e.status === "CONFIRMADO" || e.status === "PRESENTE"),
    );
    if (active.length >= session.capacity && status === "CONFIRMADO") {
      throw new BadRequestException("Turma lotada — use lista de espera");
    }

    if (status === "CONFIRMADO" || status === "PRESENTE") {
      const apptConflict = await this.prisma.appointment.findFirst({
        where: {
          patientId,
          status: { not: "CANCELADO" },
          startsAt: { lt: session.endsAt },
          endsAt: { gt: session.startsAt },
        },
        include: { patient: true },
      });
      if (apptConflict) {
        throw new BadRequestException(
          `Conflito: ${apptConflict.patient.fullName} já tem atendimento neste horário.`,
        );
      }

      const otherClass = await this.prisma.classEnrollment.findFirst({
        where: {
          patientId,
          status: { in: ["CONFIRMADO", "PRESENTE"] },
          classSessionId: { not: classSessionId },
          classSession: {
            startsAt: { lt: session.endsAt },
            endsAt: { gt: session.startsAt },
          },
        },
        include: { patient: true },
      });
      if (otherClass) {
        throw new BadRequestException(
          `Conflito: ${otherClass.patient.fullName} já está em outra aula neste horário.`,
        );
      }
    }

    const enrollment = await this.prisma.classEnrollment.upsert({
      where: { classSessionId_patientId: { classSessionId, patientId } },
      create: { classSessionId, patientId, status, isMakeup },
      update: { status, isMakeup },
      include: { patient: true, classSession: true },
    });

    let replicated = 0;
    const shouldReplicate =
      !isMakeup &&
      !!session.seriesGroupId &&
      (status === "CONFIRMADO" || status === "LISTA_ESPERA" || status === "PRESENTE");

    if (shouldReplicate && session.seriesGroupId) {
      // Só este aluno — sync completo da turma é pelo botão "Espelhar"
      replicated = await this.replicateEnrollmentToSeries(
        session,
        patientId,
        status === "PRESENTE" ? "CONFIRMADO" : status,
      );
    }

    return { ...enrollment, replicated };
  }

  /**
   * Garante um aluno regular em uma aula da série (respeita reposição e presença já lançada).
   * @returns 1 se criou/atualizou, 0 se pulou
   */
  private async ensureRegularOnSession(
    sibling: {
      id: string;
      capacity: number;
      enrollments: Array<{
        id: string;
        patientId: string;
        status: string;
        isMakeup: boolean;
      }>;
    },
    patientId: string,
    status: string,
  ) {
    const already = sibling.enrollments.find((e) => e.patientId === patientId);
    if (already?.isMakeup) return 0;

    let nextStatus = status === "PRESENTE" ? "CONFIRMADO" : status;
    if (nextStatus === "CONFIRMADO") {
      const filled = sibling.enrollments.filter(
        (e) =>
          e.patientId !== patientId &&
          (e.status === "CONFIRMADO" || e.status === "PRESENTE"),
      ).length;
      if (!already && filled >= sibling.capacity) {
        nextStatus = "LISTA_ESPERA";
      }
    }

    if (already && ["PRESENTE", "FALTOU", "CANCELADO"].includes(already.status)) {
      if (already.isMakeup) {
        await this.prisma.classEnrollment.update({
          where: { id: already.id },
          data: { isMakeup: false },
        });
      }
      return 1;
    }

    if (
      already &&
      already.status === nextStatus &&
      !already.isMakeup
    ) {
      return 0;
    }

    await this.prisma.classEnrollment.upsert({
      where: {
        classSessionId_patientId: {
          classSessionId: sibling.id,
          patientId,
        },
      },
      create: {
        classSessionId: sibling.id,
        patientId,
        status: nextStatus,
        isMakeup: false,
      },
      update: { status: nextStatus, isMakeup: false },
    });
    return 1;
  }

  /** Replica um aluno regular para todas as outras aulas da mesma turma. */
  private async replicateEnrollmentToSeries(
    session: { id: string; seriesGroupId: string | null },
    patientId: string,
    status: string,
  ) {
    if (!session.seriesGroupId) return 0;

    const siblings = await this.prisma.classSession.findMany({
      where: {
        seriesGroupId: session.seriesGroupId,
        id: { not: session.id },
      },
      include: { enrollments: true },
      orderBy: { startsAt: "asc" },
    });

    let replicated = 0;
    for (const sibling of siblings) {
      replicated += await this.ensureRegularOnSession(sibling, patientId, status);
    }
    return replicated;
  }

  /**
   * Une todos os alunos regulares de qualquer data da série e espelha em todas as aulas.
   * Assim, quem só estava em 01/09 passa a aparecer em 03/09, 06/09, etc.
   */
  async syncSeriesEnrollments(classSessionId: string) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: classSessionId },
    });
    if (!session) throw new NotFoundException("Aula não encontrada");
    if (!session.seriesGroupId) {
      throw new BadRequestException(
        "Esta aula não faz parte de uma turma recorrente — não há outras datas para sincronizar",
      );
    }

    const allSessions = await this.prisma.classSession.findMany({
      where: { seriesGroupId: session.seriesGroupId },
      include: { enrollments: true },
      orderBy: { startsAt: "asc" },
    });

    const regulars = new Map<string, string>();
    for (const s of allSessions) {
      for (const e of s.enrollments) {
        if (e.isMakeup) continue;
        if (!["CONFIRMADO", "LISTA_ESPERA", "PRESENTE"].includes(e.status)) continue;
        const st = e.status === "PRESENTE" ? "CONFIRMADO" : e.status;
        const prev = regulars.get(e.patientId);
        if (!prev || (prev === "LISTA_ESPERA" && st === "CONFIRMADO")) {
          regulars.set(e.patientId, st);
        }
      }
    }

    let copies = 0;
    type Job = {
      session: (typeof allSessions)[number];
      patientId: string;
      status: string;
    };
    const jobs: Job[] = [];
    for (const [patientId, status] of regulars) {
      for (const s of allSessions) {
        jobs.push({ session: s, patientId, status });
      }
    }

    const CHUNK = 8;
    for (let i = 0; i < jobs.length; i += CHUNK) {
      const batch = jobs.slice(i, i + CHUNK);
      const nums = await Promise.all(
        batch.map(async ({ session: s, patientId, status }) => {
          const n = await this.ensureRegularOnSession(s, patientId, status);
          if (n > 0) {
            const local = s.enrollments.find((e) => e.patientId === patientId);
            if (local) {
              local.status = status === "PRESENTE" ? "CONFIRMADO" : status;
              local.isMakeup = false;
            } else {
              s.enrollments.push({
                id: `tmp-${s.id}-${patientId}`,
                patientId,
                status: status === "PRESENTE" ? "CONFIRMADO" : status,
                isMakeup: false,
              } as (typeof s.enrollments)[number]);
            }
          }
          return n;
        }),
      );
      copies += nums.reduce((a, b) => a + b, 0 as number);
    }

    return {
      seriesGroupId: session.seriesGroupId,
      students: regulars.size,
      copies,
      sessions: allSessions.length,
      detail: `${regulars.size} aluno(s) regular(es) espelhados em ${allSessions.length} aula(s) da turma (${copies} inscrição(ões) criada(s)/atualizada(s))`,
    };
  }

  async updateEnrollment(
    id: string,
    data: { status?: string; isMakeup?: boolean },
  ) {
    const current = await this.prisma.classEnrollment.findUnique({
      where: { id },
      include: { classSession: true, patient: true },
    });
    if (!current) throw new NotFoundException("Inscrição não encontrada");

    const status = data.status ?? current.status;
    const isMakeup = data.isMakeup ?? current.isMakeup;

    const updated = await this.prisma.classEnrollment.update({
      where: { id },
      data: { status, isMakeup },
      include: { patient: true, classSession: true },
    });

    if (
      !isMakeup &&
      current.classSession.seriesGroupId &&
      (status === "CONFIRMADO" || status === "LISTA_ESPERA" || status === "PRESENTE")
    ) {
      await this.replicateEnrollmentToSeries(
        current.classSession,
        current.patientId,
        status === "PRESENTE" ? "CONFIRMADO" : status,
      );
    }

    return updated;
  }

  async removeEnrollment(id: string) {
    await this.prisma.classEnrollment.delete({ where: { id } });
    return { ok: true };
  }

  /** Envia lembrete (e-mail e/ou WhatsApp) aos alunos ativos (ou só patientIds). */
  async sendReminders(
    id: string,
    patientIds?: string[],
    channels: Array<"email" | "whatsapp"> = ["whatsapp"],
  ) {
    const session = await this.prisma.classSession.findUnique({
      where: { id },
      include: {
        professional: true,
        room: true,
        enrollments: {
          include: { patient: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!session) throw new NotFoundException("Aula não encontrada");

    const wanted = channels.filter((c) => c === "email" || c === "whatsapp");
    if (!wanted.length) {
      throw new BadRequestException("Selecione e-mail e/ou WhatsApp");
    }

    const selected = patientIds?.length ? new Set(patientIds) : null;

    const active = session.enrollments.filter((e) => {
      if (!["CONFIRMADO", "PRESENTE", "LISTA_ESPERA"].includes(e.status)) return false;
      if (selected && !selected.has(e.patientId)) return false;
      return true;
    });

    if (selected && active.length === 0) {
      throw new BadRequestException(
        "Nenhum dos alunos selecionados está ativo nesta aula",
      );
    }

    const subject = `Lembrete de aula de Pilates — ${this.email.clinicName()}`;
    const results = [];

    for (const e of active) {
      const message = this.whatsapp.classReminderMessage({
        patientName: e.patient.fullName,
        startsAt: session.startsAt,
        title: session.title,
        professionalName: session.professional.fullName,
        roomName: session.room?.name,
      });

      const entry: {
        patientId: string;
        fullName: string;
        message: string;
        email?: Awaited<ReturnType<EmailService["sendText"]>>;
        whatsapp?: Awaited<ReturnType<WhatsappService["sendText"]>> & { waUrl?: string };
        ok: boolean;
      } = {
        patientId: e.patientId,
        fullName: e.patient.fullName,
        message,
        ok: false,
      };

      if (wanted.includes("email")) {
        if (!e.patient.email) {
          entry.email = {
            ok: false,
            status: "skipped",
            detail: "Sem e-mail cadastrado",
          };
        } else {
          entry.email = await this.email.sendText({
            to: e.patient.email,
            subject,
            text: message,
          });
        }
      }

      if (wanted.includes("whatsapp")) {
        const phone = e.patient.whatsapp || e.patient.phone;
        const waUrl = this.whatsapp.waMeUrl(phone, message);
        if (!phone) {
          entry.whatsapp = {
            ok: false,
            status: "skipped",
            detail: "Sem WhatsApp/telefone",
            waUrl,
          };
        } else {
          const sent = await this.whatsapp.sendText(phone, message);
          entry.whatsapp = { ...sent, waUrl: sent.waUrl || waUrl };
        }
      }

      entry.ok = Boolean(entry.email?.ok || entry.whatsapp?.ok);
      results.push(entry);
    }

    return {
      classId: session.id,
      title: session.title,
      total: results.length,
      sent: results.filter((r) => r.ok).length,
      channels: wanted,
      results,
    };
  }
}
