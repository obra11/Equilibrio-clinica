import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";

/** Paleta distinta para a agenda (mesma ordem do front). */
const AGENDA_COLORS = [
  "#1D4ED8",
  "#DC2626",
  "#EAB308",
  "#2563EB",
  "#B91C1C",
  "#CA8A04",
  "#0EA5E9",
  "#F97316",
];

function pickDistinctColor(used: string[], requested?: string) {
  if (requested) return requested;
  const normalized = used.map((c) => c.toLowerCase());
  const free = AGENDA_COLORS.find((c) => !normalized.includes(c.toLowerCase()));
  return free || AGENDA_COLORS[used.length % AGENDA_COLORS.length];
}

type ProfessionalInput = {
  fullName: string;
  email: string;
  password?: string;
  crefito?: string | null;
  specialties?: string[];
  color?: string;
  role?: string;
  phone?: string | null;
  whatsapp?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  accountHolder?: string | null;
  bankName?: string | null;
  bankAgency?: string | null;
  bankAccount?: string | null;
  bankAccountType?: string | null;
  pixKey?: string | null;
  pixKeyType?: string | null;
};

const PROFILE_KEYS = [
  "phone",
  "whatsapp",
  "zipCode",
  "street",
  "number",
  "complement",
  "neighborhood",
  "city",
  "state",
  "accountHolder",
  "bankName",
  "bankAgency",
  "bankAccount",
  "bankAccountType",
  "pixKey",
  "pixKeyType",
] as const;

function clean(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pickProfile(data: Partial<ProfessionalInput>) {
  const out: Record<string, string | null> = {};
  for (const key of PROFILE_KEYS) {
    if (data[key] !== undefined) out[key] = clean(data[key]) ?? null;
  }
  if (data.state !== undefined) {
    const st = clean(data.state);
    out.state = st ? st.toUpperCase().slice(0, 2) : null;
  }
  return out;
}

@Injectable()
export class ProfessionalsService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.professional.findMany({
      where: { active: true },
      include: { user: { select: { email: true, role: true, active: true } } },
      orderBy: { fullName: "asc" },
    });
    return rows.map((p) => ({
      ...p,
      specialties: JSON.parse(p.specialties || "[]") as string[],
    }));
  }

  async get(id: string) {
    const p = await this.prisma.professional.findUnique({
      where: { id },
      include: { user: { select: { email: true, role: true, active: true } } },
    });
    if (!p || !p.active) throw new NotFoundException("Profissional não encontrado");
    return { ...p, specialties: JSON.parse(p.specialties || "[]") };
  }

  async create(data: ProfessionalInput) {
    const email = data.email.toLowerCase().trim();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException("Já existe usuário com este e-mail");

    const existing = await this.prisma.professional.findMany({
      where: { active: true },
      select: { color: true },
    });
    const color = pickDistinctColor(
      existing.map((p) => p.color),
      data.color,
    );

    const passwordHash = await bcrypt.hash(data.password || "fisio123", 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: data.role || "FISIOTERAPEUTA",
        professional: {
          create: {
            fullName: data.fullName,
            crefito: clean(data.crefito) ?? null,
            specialties: JSON.stringify(data.specialties ?? []),
            color,
            ...pickProfile(data),
          },
        },
      },
      include: { professional: true },
    });
    return {
      ...user.professional!,
      specialties: JSON.parse(user.professional!.specialties || "[]"),
      user: { email: user.email, role: user.role },
    };
  }

  async update(id: string, data: Partial<ProfessionalInput>) {
    const current = await this.get(id);

    if (data.email) {
      const email = data.email.toLowerCase().trim();
      const exists = await this.prisma.user.findFirst({
        where: { email, NOT: { id: current.userId } },
      });
      if (exists) throw new ConflictException("Já existe usuário com este e-mail");
    }

    await this.prisma.professional.update({
      where: { id },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.crefito !== undefined ? { crefito: clean(data.crefito) ?? null } : {}),
        ...(data.specialties !== undefined
          ? { specialties: JSON.stringify(data.specialties) }
          : {}),
        ...(data.color !== undefined ? { color: data.color || "#585E45" } : {}),
        ...pickProfile(data),
      },
    });

    const userData: { email?: string; role?: string; passwordHash?: string } = {};
    if (data.email) userData.email = data.email.toLowerCase().trim();
    if (data.role) userData.role = data.role;
    if (data.password && data.password.length >= 6) {
      userData.passwordHash = await bcrypt.hash(data.password, 10);
    }
    if (Object.keys(userData).length) {
      await this.prisma.user.update({ where: { id: current.userId }, data: userData });
    }

    return this.get(id);
  }

  async remove(id: string) {
    const current = await this.get(id);
    await this.prisma.$transaction([
      this.prisma.professional.update({ where: { id }, data: { active: false } }),
      this.prisma.user.update({ where: { id: current.userId }, data: { active: false } }),
    ]);
    return { ok: true };
  }

  async updatePhoto(id: string, photoUrl: string) {
    await this.get(id);
    const updated = await this.prisma.professional.update({
      where: { id },
      data: { photoUrl },
      include: { user: { select: { email: true, role: true, active: true } } },
    });
    return {
      ...updated,
      specialties: JSON.parse(updated.specialties || "[]") as string[],
    };
  }
}
