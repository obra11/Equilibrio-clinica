import { z } from "zod";

export const RoleEnum = z.enum(["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"]);
export type Role = z.infer<typeof RoleEnum>;

export const AppointmentStatusEnum = z.enum([
  "AGENDADO",
  "CONFIRMADO",
  "CHECK_IN",
  "CONCLUIDO",
  "CANCELADO",
  "FALTA",
]);
export type AppointmentStatus = z.infer<typeof AppointmentStatusEnum>;

export const EnrollmentStatusEnum = z.enum([
  "CONFIRMADO",
  "LISTA_ESPERA",
  "CANCELADO",
  "FALTA",
  "PRESENTE",
]);
export type EnrollmentStatus = z.infer<typeof EnrollmentStatusEnum>;

export const FinancialStatusEnum = z.enum([
  "ABERTO",
  "PARCIAL",
  "PAGO",
  "VENCIDO",
  "CANCELADO",
]);
export type FinancialStatus = z.infer<typeof FinancialStatusEnum>;

export const InvoiceStatusEnum = z.enum([
  "NAO_APLICAVEL",
  "PENDENTE",
  "EMITIDA",
  "ERRO",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const patientSchema = z.object({
  fullName: z.string().min(2),
  cpf: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  birthDate: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  number: z.string().optional().nullable(),
  complement: z.string().optional().nullable(),
  neighborhood: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().max(2).optional().nullable(),
  notes: z.string().optional().nullable(),
  isParticular: z.boolean().default(true),
  insuranceName: z.string().optional().nullable(),
});

export const professionalSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  crefito: z.string().optional().nullable(),
  specialties: z.array(z.string()).default([]),
  color: z.string().default("#585E45"),
  role: RoleEnum.default("FISIOTERAPEUTA"),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  number: z.string().optional().nullable(),
  complement: z.string().optional().nullable(),
  neighborhood: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().max(2).optional().nullable(),
  accountHolder: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAgency: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  bankAccountType: z.string().optional().nullable(),
  pixKey: z.string().optional().nullable(),
  pixKeyType: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

export const appointmentSchema = z.object({
  patientId: z.string().uuid(),
  professionalId: z.string().uuid(),
  serviceTypeId: z.string().uuid(),
  roomId: z.string().uuid().optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: AppointmentStatusEnum.default("AGENDADO"),
  notes: z.string().optional().nullable(),
});

export const classSessionSchema = z.object({
  professionalId: z.string().uuid(),
  serviceTypeId: z.string().uuid(),
  roomId: z.string().uuid().optional().nullable(),
  title: z.string().min(2),
  capacity: z.number().int().min(1).max(30),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  notes: z.string().optional().nullable(),
});

export const enrollmentSchema = z.object({
  classSessionId: z.string().uuid(),
  patientId: z.string().uuid(),
  status: EnrollmentStatusEnum.default("CONFIRMADO"),
});

export const sessionNoteSchema = z.object({
  patientId: z.string().uuid(),
  professionalId: z.string().uuid(),
  appointmentId: z.string().uuid().optional().nullable(),
  subjective: z.string().optional().nullable(),
  objective: z.string().optional().nullable(),
  assessment: z.string().optional().nullable(),
  plan: z.string().optional().nullable(),
});

export const physicalAssessmentSchema = z.object({
  patientId: z.string().uuid(),
  professionalId: z.string().uuid(),
  painVas: z.number().int().min(0).max(10).optional().nullable(),
  romNotes: z.string().optional().nullable(),
  strengthNotes: z.string().optional().nullable(),
  functionalTests: z.string().optional().nullable(),
  observations: z.string().optional().nullable(),
});

export const receivableSchema = z.object({
  patientId: z.string().uuid().optional().nullable(),
  description: z.string().min(2),
  categoryId: z.string().uuid().optional().nullable(),
  amount: z.number().positive(),
  dueDate: z.string(),
  status: FinancialStatusEnum.default("ABERTO"),
  appointmentId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const payableSchema = z.object({
  description: z.string().min(2),
  categoryId: z.string().uuid().optional().nullable(),
  amount: z.number().positive(),
  dueDate: z.string(),
  status: FinancialStatusEnum.default("ABERTO"),
  vendor: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const paymentSchema = z.object({
  amount: z.number().positive(),
  paidAt: z.string().optional(),
  method: z.enum(["DINHEIRO", "PIX", "CARTAO", "TRANSFERENCIA", "OUTRO"]).default("PIX"),
  notes: z.string().optional().nullable(),
});

export const BRAND = {
  name: "Equilíbrio",
  fullName: "Equilíbrio Fisioterapia e Bem-Estar",
  tagline: "FISIOTERAPIA E BEM ESTAR",
  colors: {
    cream: "#F2EEE4",
    olive: "#585E45",
    oliveMuted: "#6B705C",
    gold: "#B5A478",
    charcoal: "#2F2F2A",
    white: "#FFFFFF",
    border: "#E4DFD3",
  },
  whatsapp: "5548984882418",
  address: "Rua Deputado Protógenes Vieira, 83 — Santa Mônica, Florianópolis/SC",
} as const;
