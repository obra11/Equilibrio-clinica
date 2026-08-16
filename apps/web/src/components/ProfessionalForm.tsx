"use client";

import { FormEvent, useState } from "react";
import { formatCep } from "@/components/PatientForm";
import {
  DEFAULT_PROFESSIONAL_COLOR,
  PROFESSIONAL_COLORS,
} from "@/lib/professionalColors";

export type ProfessionalFormValues = {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  whatsapp: string;
  crefito: string;
  specialtiesText: string;
  color: string;
  role: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  accountHolder: string;
  bankName: string;
  bankAgency: string;
  bankAccount: string;
  bankAccountType: string;
  pixKey: string;
  pixKeyType: string;
};

export const emptyProfessionalForm: ProfessionalFormValues = {
  fullName: "",
  email: "",
  password: "",
  phone: "",
  whatsapp: "",
  crefito: "",
  specialtiesText: "",
  color: DEFAULT_PROFESSIONAL_COLOR,
  role: "FISIOTERAPEUTA",
  zipCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  accountHolder: "",
  bankName: "",
  bankAgency: "",
  bankAccount: "",
  bankAccountType: "CORRENTE",
  pixKey: "",
  pixKeyType: "CPF",
};

type Props = {
  initial?: Partial<ProfessionalFormValues>;
  submitLabel?: string;
  passwordRequired?: boolean;
  onSubmit: (values: ProfessionalFormValues & { specialties: string[] }) => Promise<void>;
  onCancel?: () => void;
};

export function ProfessionalForm({
  initial,
  submitLabel = "Salvar profissional",
  passwordRequired = false,
  onSubmit,
  onCancel,
}: Props) {
  const [form, setForm] = useState<ProfessionalFormValues>({
    ...emptyProfessionalForm,
    ...initial,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function setField<K extends keyof ProfessionalFormValues>(
    key: K,
    value: ProfessionalFormValues[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const specialties = form.specialtiesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await onSubmit({ ...form, specialties });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="eq-card space-y-3">
      <div>
        <label className="eq-label">Nome completo *</label>
        <input
          className="eq-input"
          value={form.fullName}
          onChange={(e) => setField("fullName", e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="eq-label">E-mail (login) *</label>
          <input
            className="eq-input"
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            required
          />
        </div>
        <div>
          <label className="eq-label">
            Senha {passwordRequired ? "*" : "(opcional)"}
          </label>
          <input
            className="eq-input"
            type="password"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            required={passwordRequired}
            minLength={passwordRequired ? 6 : undefined}
            placeholder={passwordRequired ? "Mín. 6 caracteres" : "Deixe em branco para manter"}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="eq-label">Telefone</label>
          <input
            className="eq-input"
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
            placeholder="(48) 00000-0000"
          />
        </div>
        <div>
          <label className="eq-label">WhatsApp</label>
          <input
            className="eq-input"
            value={form.whatsapp}
            onChange={(e) => setField("whatsapp", e.target.value)}
            placeholder="(48) 00000-0000"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="eq-label">CREFITO</label>
          <input
            className="eq-input"
            value={form.crefito}
            onChange={(e) => setField("crefito", e.target.value)}
          />
        </div>
        <div>
          <label className="eq-label">Perfil</label>
          <select
            className="eq-input"
            value={form.role}
            onChange={(e) => setField("role", e.target.value)}
          >
            <option value="FISIOTERAPEUTA">Fisioterapeuta</option>
            <option value="RECEPCAO">Recepção</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
      </div>

      <div>
        <label className="eq-label">Especialidades (separadas por vírgula)</label>
        <input
          className="eq-input"
          value={form.specialtiesText}
          onChange={(e) => setField("specialtiesText", e.target.value)}
          placeholder="Fisioterapia, Pilates, RPG"
        />
      </div>

      <div>
        <label className="eq-label">Cor na agenda</label>
        <p className="mb-2 text-xs text-olive-muted">
          Escolha uma cor bem diferente das dos outros profissionais
        </p>
        <div className="flex flex-wrap gap-2">
          {PROFESSIONAL_COLORS.map((c) => {
            const selected = form.color.toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                key={c.hex}
                type="button"
                title={c.label}
                onClick={() => setField("color", c.hex)}
                className={`h-9 w-9 rounded-full border-2 transition ${
                  selected ? "border-olive scale-110 shadow-sm" : "border-white/80"
                }`}
                style={{ background: c.hex }}
                aria-label={c.label}
              />
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="color"
            value={form.color}
            onChange={(e) => setField("color", e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border border-borderEq bg-white"
          />
          <span className="text-sm text-olive-muted">{form.color}</span>
        </div>
      </div>

      <div className="border-t border-borderEq pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold">
          Endereço de residência
        </p>
        <div className="grid grid-cols-[1fr_90px] gap-3">
          <div>
            <label className="eq-label">CEP</label>
            <input
              className="eq-input"
              value={form.zipCode}
              onChange={(e) => setField("zipCode", formatCep(e.target.value))}
              placeholder="00000-000"
            />
          </div>
          <div>
            <label className="eq-label">UF</label>
            <input
              className="eq-input uppercase"
              maxLength={2}
              value={form.state}
              onChange={(e) => setField("state", e.target.value.toUpperCase())}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="eq-label">Logradouro</label>
          <input
            className="eq-input"
            value={form.street}
            onChange={(e) => setField("street", e.target.value)}
            placeholder="Rua, avenida..."
          />
        </div>
        <div className="mt-3 grid grid-cols-[100px_1fr] gap-3">
          <div>
            <label className="eq-label">Número</label>
            <input
              className="eq-input"
              value={form.number}
              onChange={(e) => setField("number", e.target.value)}
            />
          </div>
          <div>
            <label className="eq-label">Complemento</label>
            <input
              className="eq-input"
              value={form.complement}
              onChange={(e) => setField("complement", e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="eq-label">Bairro</label>
            <input
              className="eq-input"
              value={form.neighborhood}
              onChange={(e) => setField("neighborhood", e.target.value)}
            />
          </div>
          <div>
            <label className="eq-label">Cidade</label>
            <input
              className="eq-input"
              value={form.city}
              onChange={(e) => setField("city", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-borderEq pt-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold">
          Dados bancários
        </p>
        <p className="mb-3 text-xs text-olive-muted">
          Usados no financeiro da clínica para repasses e contas a pagar ao profissional.
        </p>
        <div>
          <label className="eq-label">Titular da conta</label>
          <input
            className="eq-input"
            value={form.accountHolder}
            onChange={(e) => setField("accountHolder", e.target.value)}
            placeholder="Nome como no banco"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="eq-label">Banco</label>
            <input
              className="eq-input"
              value={form.bankName}
              onChange={(e) => setField("bankName", e.target.value)}
              placeholder="Ex.: Nubank, Itaú"
            />
          </div>
          <div>
            <label className="eq-label">Tipo de conta</label>
            <select
              className="eq-input"
              value={form.bankAccountType}
              onChange={(e) => setField("bankAccountType", e.target.value)}
            >
              <option value="CORRENTE">Corrente</option>
              <option value="POUPANCA">Poupança</option>
              <option value="PAGAMENTO">Pagamento</option>
            </select>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="eq-label">Agência</label>
            <input
              className="eq-input"
              value={form.bankAgency}
              onChange={(e) => setField("bankAgency", e.target.value)}
            />
          </div>
          <div>
            <label className="eq-label">Conta</label>
            <input
              className="eq-input"
              value={form.bankAccount}
              onChange={(e) => setField("bankAccount", e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-[140px_1fr] gap-3">
          <div>
            <label className="eq-label">Tipo PIX</label>
            <select
              className="eq-input"
              value={form.pixKeyType}
              onChange={(e) => setField("pixKeyType", e.target.value)}
            >
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
              <option value="EMAIL">E-mail</option>
              <option value="TELEFONE">Telefone</option>
              <option value="ALEATORIA">Aleatória</option>
            </select>
          </div>
          <div>
            <label className="eq-label">Chave PIX</label>
            <input
              className="eq-input"
              value={form.pixKey}
              onChange={(e) => setField("pixKey", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button className="eq-btn" disabled={loading}>
          {loading ? "Salvando..." : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="eq-btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}

/** Payload helpers for create/update API */
export function professionalPayload(values: ProfessionalFormValues & { specialties: string[] }) {
  return {
    fullName: values.fullName,
    email: values.email,
    password: values.password || undefined,
    crefito: values.crefito || null,
    specialties: values.specialties,
    color: values.color,
    role: values.role,
    phone: values.phone || null,
    whatsapp: values.whatsapp || null,
    zipCode: values.zipCode || null,
    street: values.street || null,
    number: values.number || null,
    complement: values.complement || null,
    neighborhood: values.neighborhood || null,
    city: values.city || null,
    state: values.state || null,
    accountHolder: values.accountHolder || null,
    bankName: values.bankName || null,
    bankAgency: values.bankAgency || null,
    bankAccount: values.bankAccount || null,
    bankAccountType: values.bankAccountType || null,
    pixKey: values.pixKey || null,
    pixKeyType: values.pixKeyType || null,
  };
}
