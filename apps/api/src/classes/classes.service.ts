import { randomUUID } from "crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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
  constructor(private prisma: PrismaService) {}

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
    };
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.classSession.delete({ where: { id } });
    return { ok: true };
  }

  async enroll(classSessionId: string, patientId: string, status = "CONFIRMADO") {
    const session = await this.prisma.classSession.findUnique({
      where: { id: classSessionId },
      include: { enrollments: true },
    });
    if (!session) throw new NotFoundException("Aula não encontrada");
    const active = session.enrollments.filter(
      (e) => e.status === "CONFIRMADO" || e.status === "PRESENTE",
    );
    if (active.length >= session.capacity && status === "CONFIRMADO") {
      throw new BadRequestException("Turma lotada — use lista de espera");
    }
    return this.prisma.classEnrollment.upsert({
      where: { classSessionId_patientId: { classSessionId, patientId } },
      create: { classSessionId, patientId, status },
      update: { status },
      include: { patient: true, classSession: true },
    });
  }

  async updateEnrollment(id: string, status: string) {
    return this.prisma.classEnrollment.update({
      where: { id },
      data: { status },
      include: { patient: true },
    });
  }

  async removeEnrollment(id: string) {
    await this.prisma.classEnrollment.delete({ where: { id } });
    return { ok: true };
  }
}
