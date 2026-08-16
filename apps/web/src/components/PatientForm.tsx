"use client";

import { FormEvent, useState } from "react";

export type PatientFormValues = {
  fullName: string;
  cpf: string;
  email: string;
  phone: string;
  whatsapp: string;
  birthDate: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  isParticular: boolean;
  insuranceName: string;
  notes: string;
  sendWelcomeWhatsapp: boolean;
};

export const emptyPatientForm: PatientFormValues = {
  fullName: "",
  cpf: "",
  email: "",
  phone: "",
  whatsapp: "",
  birthDate: "",
  zipCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "SC",
  isParticular: true,
  insuranceName: "",
  notes: "",
  sendWelcomeWhatsapp: true,
};

export function formatCpf(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function formatCep(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 8);
  return d.replace(/(\d{5})(\d)/, "$1-$2");
}

type Props = {
  initial?: Partial<PatientFormValues>;
  submitLabel?: string;
  /** Exibe opção de WhatsApp de boas-vindas (novo cadastro) */
  showWelcomeWhatsapp?: boolean;
  onSubmit: (values: PatientFormValues) => Promise<void>;
  onCancel?: () => void;
};

export function PatientForm({
  initial,
  submitLabel = "Salvar paciente",
  showWelcomeWhatsapp = false,
  onSubmit,
  onCancel,
}: Props) {
  const [form, setForm] = useState<PatientFormValues>({ ...emptyPatientForm, ...initial });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function setField<K extends keyof PatientFormValues>(key: K, value: PatientFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onSubmit(form);
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
          <label className="eq-label">CPF</label>
          <input
            className="eq-input"
            value={form.cpf}
            onChange={(e) => setField("cpf", formatCpf(e.target.value))}
            placeholder="000.000.000-00"
          />
        </div>
        <div>
          <label className="eq-label">Nascimento</label>
          <input
            className="eq-input"
            type="date"
            value={form.birthDate}
            onChange={(e) => setField("birthDate", e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="eq-label">E-mail</label>
        <input
          className="eq-input"
          type="email"
          value={form.email}
          onChange={(e) => setField("email", e.target.value)}
          placeholder="paciente@email.com"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="eq-label">WhatsApp</label>
          <input
            className="eq-input"
            value={form.whatsapp}
            onChange={(e) => setField("whatsapp", e.target.value)}
          />
        </div>
        <div>
          <label className="eq-label">Telefone</label>
          <input
            className="eq-input"
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
          />
        </div>
      </div>

      <div className="border-t border-borderEq pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold">
          Endereço (NF)
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

      <div className="grid grid-cols-2 gap-3 border-t border-borderEq pt-3">
        <label className="flex items-center gap-2 text-sm text-olive">
          <input
            type="checkbox"
            checked={form.isParticular}
            onChange={(e) => setField("isParticular", e.target.checked)}
          />
          Particular
        </label>
        {!form.isParticular ? (
          <input
            className="eq-input"
            placeholder="Convênio"
            value={form.insuranceName}
            onChange={(e) => setField("insuranceName", e.target.value)}
          />
        ) : (
          <div />
        )}
      </div>

      <div>
        <label className="eq-label">Observações</label>
        <textarea
          className="eq-input min-h-16"
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
        />
      </div>

      {showWelcomeWhatsapp ? (
        <label className="flex items-start gap-2 rounded-md border border-borderEq bg-cream/50 px-3 py-3 text-sm text-olive">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.sendWelcomeWhatsapp}
            onChange={(e) => setField("sendWelcomeWhatsapp", e.target.checked)}
          />
          <span>
            <span className="font-medium">Enviar WhatsApp de boas-vindas</span>
            <span className="mt-0.5 block text-xs text-olive-muted">
              Usa o WhatsApp do paciente (ou telefone) logo após o cadastro.
            </span>
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
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
