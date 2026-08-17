"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

export type ClassFormValues = {
  title: string;
  professionalId: string;
  serviceTypeId: string;
  roomId: string;
  capacity: string;
  startsAt: string;
  notes: string;
  weekdays: number[];
  weeksCount: string;
  repeatUntil: string;
};

export const emptyClassForm: ClassFormValues = {
  title: "Pilates em Grupo",
  professionalId: "",
  serviceTypeId: "",
  roomId: "",
  capacity: "6",
  startsAt: "",
  notes: "",
  weekdays: [],
  weeksCount: "8",
  repeatUntil: "",
};

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

type Option = { id: string; fullName?: string; name?: string; isGroup?: boolean };

type Props = {
  initial?: Partial<ClassFormValues>;
  submitLabel?: string;
  /** Mostra dias da semana e repetição (nova turma) */
  allowRecurrence?: boolean;
  onSubmit: (values: ClassSubmitValues) => Promise<void>;
  onCancel?: () => void;
};

export type ClassSubmitValues = Omit<ClassFormValues, "weeksCount" | "repeatUntil"> & {
  endsAt: string;
  weekdays: number[];
  weeksCount?: number;
  repeatUntil?: string | null;
};

export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function estimateCount(startsAt: string, weekdays: number[], weeksCount: string, repeatUntil: string) {
  if (!startsAt || !weekdays.length) return 1;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return 0;
  let until: Date;
  if (repeatUntil) {
    until = new Date(repeatUntil);
    until.setHours(23, 59, 59, 999);
  } else {
    const weeks = Math.max(1, Number(weeksCount) || 8);
    until = new Date(start);
    until.setDate(until.getDate() + weeks * 7 - 1);
  }
  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const hours = start.getHours();
  const minutes = start.getMinutes();
  while (cursor <= until) {
    if (weekdays.includes(cursor.getDay())) {
      const s = new Date(cursor);
      s.setHours(hours, minutes, 0, 0);
      if (s.getTime() + 1000 >= start.getTime()) count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function ClassForm({
  initial,
  submitLabel = "Salvar aula",
  allowRecurrence = false,
  onSubmit,
  onCancel,
}: Props) {
  const [form, setForm] = useState<ClassFormValues>({ ...emptyClassForm, ...initial });
  const [professionals, setProfessionals] = useState<Option[]>([]);
  const [services, setServices] = useState<Option[]>([]);
  const [rooms, setRooms] = useState<Option[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      api<Option[]>("/professionals"),
      api<Option[]>("/catalog/services"),
      api<Option[]>("/catalog/rooms"),
    ])
      .then(([pros, svcs, rms]) => {
        setProfessionals(pros);
        setServices(svcs.filter((s) => s.isGroup));
        setRooms(rms);
        setForm((prev) => {
          const next = { ...prev };
          if (!next.professionalId && pros[0]) next.professionalId = pros[0].id;
          if (!next.serviceTypeId) {
            const g = svcs.find((s) => s.isGroup);
            if (g) next.serviceTypeId = g.id;
          }
          if (!next.roomId) {
            const studio = rms.find((r) => r.name?.toLowerCase().includes("pilates"));
            if (studio) next.roomId = studio.id;
            else if (rms[0]) next.roomId = rms[0].id;
          }
          return next;
        });
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);

  function setField<K extends keyof ClassFormValues>(key: K, value: ClassFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleWeekday(day: number) {
    setForm((prev) => {
      const has = prev.weekdays.includes(day);
      return {
        ...prev,
        weekdays: has
          ? prev.weekdays.filter((d) => d !== day)
          : [...prev.weekdays, day].sort((a, b) => a - b),
      };
    });
  }

  const previewCount = useMemo(
    () =>
      allowRecurrence
        ? estimateCount(form.startsAt, form.weekdays, form.weeksCount, form.repeatUntil)
        : 1,
    [allowRecurrence, form.startsAt, form.weekdays, form.weeksCount, form.repeatUntil],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const start = new Date(form.startsAt);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + 50);
      await onSubmit({
        ...form,
        endsAt: end.toISOString(),
        weekdays: allowRecurrence ? form.weekdays : [],
        weeksCount:
          allowRecurrence && !form.repeatUntil
            ? Number(form.weeksCount) || 8
            : undefined,
        repeatUntil: allowRecurrence && form.repeatUntil ? form.repeatUntil : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return <p className="text-olive-muted">Carregando formulário...</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="eq-card space-y-3">
      <div>
        <label className="eq-label">Título *</label>
        <input
          className="eq-input"
          value={form.title}
          onChange={(e) => setField("title", e.target.value)}
          required
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="eq-label">Profissional *</label>
          <select
            className="eq-input"
            value={form.professionalId}
            onChange={(e) => setField("professionalId", e.target.value)}
            required
          >
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="eq-label">Serviço *</label>
          <select
            className="eq-input"
            value={form.serviceTypeId}
            onChange={(e) => setField("serviceTypeId", e.target.value)}
            required
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="eq-label">Sala</label>
          <select
            className="eq-input"
            value={form.roomId}
            onChange={(e) => setField("roomId", e.target.value)}
          >
            <option value="">— Sem sala —</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="eq-label">Capacidade *</label>
          <input
            className="eq-input"
            type="number"
            min={1}
            value={form.capacity}
            onChange={(e) => setField("capacity", e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <label className="eq-label">
          {allowRecurrence ? "Início da turma (data e horário) *" : "Início *"}
        </label>
        <input
          className="eq-input"
          type="datetime-local"
          value={form.startsAt}
          onChange={(e) => setField("startsAt", e.target.value)}
          required
        />
      </div>

      {allowRecurrence ? (
        <div className="space-y-3 rounded-md border border-borderEq bg-cream/40 p-3">
          <div>
            <p className="eq-label mb-2">Dias da semana da turma *</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((d) => {
                const active = form.weekdays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleWeekday(d.value)}
                    className={`min-w-12 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      active ? "bg-olive text-cream" : "bg-white text-olive border border-borderEq"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="eq-label">Repetir por (semanas)</label>
              <input
                className="eq-input"
                type="number"
                min={1}
                max={52}
                value={form.weeksCount}
                onChange={(e) => setField("weeksCount", e.target.value)}
                disabled={!!form.repeatUntil}
              />
            </div>
            <div>
              <label className="eq-label">Ou repetir até a data</label>
              <input
                className="eq-input"
                type="date"
                value={form.repeatUntil}
                onChange={(e) => setField("repeatUntil", e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-olive-muted">
            {form.weekdays.length
              ? `Serão geradas cerca de ${previewCount} aula(s) neste horário nos dias selecionados.`
              : "Sem dias marcados: cria só esta aula. Marque os dias para repetir a turma."}
          </p>
        </div>
      ) : null}

      <div>
        <label className="eq-label">Observações</label>
        <textarea
          className="eq-input min-h-20"
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
        />
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
