"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, formatMoney, getToken } from "@/lib/api";

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  priceCents?: number;
  billingType?: string;
  notes?: string | null;
  patient: { id: string; fullName: string };
  professional: { id: string; fullName: string; color: string };
  serviceType: { id: string; name: string; durationMin?: number; priceCents?: number };
  room?: { id: string; name: string } | null;
  receivables?: Array<{ id: string; amountCents: number; status: string }>;
};

type Option = {
  id: string;
  fullName?: string;
  name?: string;
  durationMin?: number;
  priceCents?: number;
  isGroup?: boolean;
  color?: string;
};

type ViewMode = "day" | "week" | "month";

const statuses = ["AGENDADO", "CONFIRMADO", "CHECK_IN", "CONCLUIDO", "CANCELADO", "FALTA"];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00–19:00
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDayTitle(d: Date) {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatMonthTitle(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function AgendaPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Option[]>([]);
  const [professionals, setProfessionals] = useState<Option[]>([]);
  const [services, setServices] = useState<Option[]>([]);
  const [rooms, setRooms] = useState<Option[]>([]);
  const [filterProfessionalId, setFilterProfessionalId] = useState("");
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [form, setForm] = useState({
    patientId: "",
    professionalId: "",
    serviceTypeId: "",
    roomId: "",
    startsAt: "",
    status: "AGENDADO",
    price: "",
    billingType: "AVULSA",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const individualServices = useMemo(() => services.filter((s) => !s.isGroup), [services]);

  function priceFromService(serviceId: string) {
    const svc = individualServices.find((s) => s.id === serviceId) || services.find((s) => s.id === serviceId);
    const cents = svc?.priceCents ?? 0;
    return cents > 0 ? (cents / 100).toFixed(2) : "";
  }

  const range = useMemo(() => {
    if (view === "day") return { from: startOfDay(cursor), to: endOfDay(cursor) };
    if (view === "week") {
      const from = startOfWeek(cursor);
      return { from, to: endOfDay(addDays(from, 6)) };
    }
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to = endOfDay(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
    // include leading/trailing days of month grid
    return { from: startOfWeek(from), to: endOfDay(addDays(startOfWeek(to), 6)) };
  }, [cursor, view]);

  const visibleItems = useMemo(() => {
    return items.filter((a) =>
      filterProfessionalId ? a.professional.id === filterProfessionalId : true,
    );
  }, [items, filterProfessionalId]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  async function loadCatalog() {
    const [pats, pros, svcs, rms] = await Promise.all([
      api<Option[]>("/patients"),
      api<Option[]>("/professionals"),
      api<Option[]>("/catalog/services"),
      api<Option[]>("/catalog/rooms"),
    ]);
    setPatients(pats);
    setProfessionals(pros);
    setServices(svcs);
    setRooms(rms);
    setForm((f) => ({
      ...f,
      patientId: f.patientId || pats[0]?.id || "",
      professionalId: f.professionalId || pros[0]?.id || "",
      serviceTypeId: f.serviceTypeId || svcs.find((s) => !s.isGroup)?.id || "",
    }));
  }

  async function loadAppointments() {
    const data = await api<Appointment[]>(
      `/appointments?from=${range.from.toISOString()}&to=${range.to.toISOString()}`,
    );
    setItems(data.filter((a) => a.status !== "CANCELADO"));
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    loadCatalog().catch((e) => setError(e.message));
  }, [router]);

  useEffect(() => {
    if (!getToken()) return;
    loadAppointments().catch((e) => setError(e.message));
  }, [range.from.getTime(), range.to.getTime()]);

  function openCreate(at: Date) {
    setSelected(null);
    setError("");
    const serviceTypeId = individualServices[0]?.id || "";
    setForm({
      patientId: patients[0]?.id || "",
      professionalId: filterProfessionalId || professionals[0]?.id || "",
      serviceTypeId,
      roomId: "",
      startsAt: toLocalInput(at),
      status: "AGENDADO",
      price: priceFromService(serviceTypeId),
      billingType: "AVULSA",
    });
    setModalOpen(true);
  }

  function openEvent(a: Appointment) {
    setSelected(a);
    setError("");
    const cents = a.priceCents ?? a.serviceType.priceCents ?? 0;
    setForm({
      patientId: a.patient.id,
      professionalId: a.professional.id,
      serviceTypeId: a.serviceType.id,
      roomId: a.room?.id || "",
      startsAt: toLocalInput(new Date(a.startsAt)),
      status: a.status,
      price: cents > 0 ? (cents / 100).toFixed(2) : "",
      billingType: a.billingType || "AVULSA",
    });
    setModalOpen(true);
  }

  function shift(dir: -1 | 1) {
    if (view === "day") setCursor((c) => addDays(c, dir));
    else if (view === "week") setCursor((c) => addDays(c, dir * 7));
    else setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const start = new Date(form.startsAt);
      const svc = individualServices.find((s) => s.id === form.serviceTypeId);
      const durationMin =
        svc?.durationMin ||
        (selected
          ? Math.max(
              15,
              Math.round(
                (new Date(selected.endsAt).getTime() - new Date(selected.startsAt).getTime()) /
                  60000,
              ),
            )
          : 50);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + durationMin);

      const payload = {
        patientId: form.patientId,
        professionalId: form.professionalId,
        serviceTypeId: form.serviceTypeId,
        roomId: form.roomId || null,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        status: form.status,
        price: Number(String(form.price).replace(",", ".")) || 0,
        billingType: form.billingType,
      };

      if (selected) {
        await api(`/appointments/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/appointments", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setModalOpen(false);
      setSelected(null);
      await loadAppointments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar agendamento");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!selected) return;
    const ok = window.confirm(
      `Excluir o agendamento de ${selected.patient.fullName}?\nEle sairá da agenda.`,
    );
    if (!ok) return;
    setDeleting(true);
    setError("");
    try {
      // Prefer DELETE; fallback PATCH CANCELADO se a API ainda não tiver a rota
      try {
        await api(`/appointments/${selected.id}`, { method: "DELETE" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (/Cannot DELETE|Not Found|404/i.test(msg)) {
          await api(`/appointments/${selected.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "CANCELADO" }),
          });
        } else {
          throw err;
        }
      }
      setModalOpen(false);
      setSelected(null);
      await loadAppointments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir agendamento");
    } finally {
      setDeleting(false);
    }
  }

  function eventsOn(day: Date) {
    return visibleItems.filter((a) => sameDay(new Date(a.startsAt), day));
  }

  function contrastText(hex: string) {
    const h = hex.replace("#", "");
    if (h.length !== 6) return "#ffffff";
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    // luminância relativa — amarelo e tons claros usam texto escuro
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luma > 0.62 ? "#1a1a1a" : "#ffffff";
  }

  function eventStyle(a: Appointment) {
    const bg = a.professional.color || "#1D4ED8";
    return {
      background: bg,
      borderColor: bg,
      color: contrastText(bg),
    };
  }

  const title =
    view === "month"
      ? formatMonthTitle(cursor)
      : view === "week"
        ? `${weekDays[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${weekDays[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`
        : formatDayTitle(cursor);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-olive">Agenda</h1>
          <p className="mt-1 text-sm text-olive-muted">
            Calendário por profissional — clique no horário ou dia para agendar
          </p>
        </div>
        <button type="button" className="eq-btn" onClick={() => openCreate(new Date())}>
          Novo agendamento
        </button>
      </div>

      <div className="eq-card mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="eq-btn-ghost px-3" onClick={() => shift(-1)}>
            ←
          </button>
          <button
            type="button"
            className="eq-btn-ghost px-3"
            onClick={() => setCursor(startOfDay(new Date()))}
          >
            Hoje
          </button>
          <button type="button" className="eq-btn-ghost px-3" onClick={() => shift(1)}>
            →
          </button>
          <p className="ml-2 font-display text-lg capitalize text-olive">{title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="eq-input w-48"
            value={filterProfessionalId}
            onChange={(e) => setFilterProfessionalId(e.target.value)}
          >
            <option value="">Todos os profissionais</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
          {(["day", "week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              className={view === v ? "eq-btn" : "eq-btn-ghost"}
              onClick={() => setView(v)}
            >
              {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </div>

      {professionals.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-3">
          {professionals.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                setFilterProfessionalId((cur) => (cur === p.id ? "" : p.id))
              }
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition ${
                filterProfessionalId === p.id
                  ? "border-olive bg-olive text-cream"
                  : "border-borderEq bg-white/80 text-olive"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: p.color || "#585E45" }}
              />
              {p.fullName}
            </button>
          ))}
        </div>
      ) : null}

      {error && !modalOpen ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}

      {view === "month" ? (
        <div className="eq-card overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-borderEq bg-cream/60 text-center text-xs font-semibold uppercase tracking-wide text-olive-muted">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-3">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthCells.map((day) => {
              const inMonth = day.getMonth() === cursor.getMonth();
              const dayEvents = eventsOn(day);
              const isToday = sameDay(day, new Date());
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    const at = new Date(day);
                    at.setHours(9, 0, 0, 0);
                    openCreate(at);
                  }}
                  className={`min-h-28 border-b border-r border-borderEq p-2 text-left transition hover:bg-cream/70 ${
                    inMonth ? "bg-white/70" : "bg-cream/30 text-olive-muted"
                  }`}
                >
                  <span
                    className={`mb-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                      isToday ? "bg-olive font-semibold text-cream" : "text-olive"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((a) => (
                      <div
                        key={a.id}
                        role="presentation"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEvent(a);
                        }}
                        className="truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                        style={eventStyle(a)}
                        title={`${formatTime(a.startsAt)} ${a.patient.fullName}`}
                      >
                        {formatTime(a.startsAt)} {a.patient.fullName}
                      </div>
                    ))}
                    {dayEvents.length > 3 ? (
                      <p className="text-[10px] text-olive-muted">+{dayEvents.length - 3} mais</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "week" ? (
        <div className="eq-card overflow-x-auto p-0">
          <div
            className="grid min-w-[900px]"
            style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}
          >
            <div className="border-b border-borderEq bg-cream/60" />
            {weekDays.map((day) => (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => {
                  setCursor(day);
                  setView("day");
                }}
                className={`border-b border-l border-borderEq bg-cream/60 px-2 py-3 text-center ${
                  sameDay(day, new Date()) ? "text-olive" : "text-olive-muted"
                }`}
              >
                <p className="text-xs uppercase tracking-wide">{WEEKDAYS[day.getDay()]}</p>
                <p className="font-display text-lg">{day.getDate()}</p>
              </button>
            ))}
            {HOURS.map((hour) => (
              <div key={hour} className="contents">
                <div className="border-b border-borderEq px-2 py-1 text-right text-[11px] text-olive-muted">
                  {String(hour).padStart(2, "0")}:00
                </div>
                {weekDays.map((day) => {
                  const slotStart = new Date(day);
                  slotStart.setHours(hour, 0, 0, 0);
                  const slotEvents = visibleItems.filter((a) => {
                    const s = new Date(a.startsAt);
                    return sameDay(s, day) && s.getHours() === hour;
                  });
                  return (
                    <button
                      key={`${day.toISOString()}-${hour}`}
                      type="button"
                      onClick={() => openCreate(slotStart)}
                      className="relative min-h-16 border-b border-l border-borderEq p-1 text-left transition hover:bg-cream/50"
                    >
                      {slotEvents.map((a) => (
                        <div
                          key={a.id}
                          role="presentation"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEvent(a);
                          }}
                          className="mb-1 rounded px-1.5 py-1 text-[11px] font-medium leading-tight text-white"
                          style={eventStyle(a)}
                        >
                          <p className="truncate">{a.patient.fullName}</p>
                          <p className="truncate opacity-90">
                            {formatTime(a.startsAt)} · {a.serviceType.name}
                          </p>
                        </div>
                      ))}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {view === "day" ? (
        <div className="eq-card overflow-hidden p-0">
          <div className="grid" style={{ gridTemplateColumns: "72px 1fr" }}>
            {HOURS.map((hour) => {
              const slotStart = new Date(cursor);
              slotStart.setHours(hour, 0, 0, 0);
              const slotEvents = visibleItems.filter((a) => {
                const s = new Date(a.startsAt);
                return sameDay(s, cursor) && s.getHours() === hour;
              });
              return (
                <div key={hour} className="contents">
                  <div className="border-b border-borderEq px-2 py-3 text-right text-xs text-olive-muted">
                    {String(hour).padStart(2, "0")}:00
                  </div>
                  <button
                    type="button"
                    onClick={() => openCreate(slotStart)}
                    className="min-h-20 border-b border-l border-borderEq p-2 text-left transition hover:bg-cream/50"
                  >
                    <div className="flex flex-wrap gap-2">
                      {slotEvents.map((a) => (
                        <div
                          key={a.id}
                          role="presentation"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEvent(a);
                          }}
                          className="min-w-[180px] flex-1 rounded-lg px-3 py-2 text-sm text-white"
                          style={eventStyle(a)}
                        >
                          <p className="font-semibold">{a.patient.fullName}</p>
                          <p className="text-xs opacity-90">
                            {formatTime(a.startsAt)}–{formatTime(a.endsAt)} · {a.serviceType.name}
                          </p>
                          <p className="text-xs opacity-90">{a.professional.fullName}</p>
                        </div>
                      ))}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-charcoal/40 p-4 backdrop-blur-sm">
          <div className="eq-card max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl text-olive">
                  {selected ? "Editar / reagendar" : "Novo agendamento"}
                </h2>
                <p className="mt-1 text-sm text-olive-muted">
                  {selected
                    ? "Altere data, horário, profissional ou status e salve"
                    : "Preencha os dados do atendimento"}
                  {" "}
                  O sistema bloqueia o mesmo paciente, profissional ou sala no mesmo horário.
                </p>
              </div>
              <button
                type="button"
                className="eq-btn-ghost px-3"
                onClick={() => {
                  setModalOpen(false);
                  setSelected(null);
                  setError("");
                }}
              >
                Fechar
              </button>
            </div>

            <form onSubmit={onSave} className="space-y-3">
              <div>
                <label className="eq-label">Paciente</label>
                <select
                  className="eq-input"
                  value={form.patientId}
                  onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
                  required
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="eq-label">Profissional</label>
                <select
                  className="eq-input"
                  value={form.professionalId}
                  onChange={(e) => setForm((f) => ({ ...f, professionalId: e.target.value }))}
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
                <label className="eq-label">Serviço / terapia</label>
                <select
                  className="eq-input"
                  value={form.serviceTypeId}
                  onChange={(e) => {
                    const serviceTypeId = e.target.value;
                    setForm((f) => ({
                      ...f,
                      serviceTypeId,
                      price: priceFromService(serviceTypeId),
                    }));
                  }}
                  required
                >
                  {individualServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.priceCents ? ` — ${formatMoney(s.priceCents)}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="eq-label">Valor da sessão (R$)</label>
                  <input
                    className="eq-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="0,00"
                    disabled={form.billingType === "CORTESIA" || form.billingType === "PACOTE"}
                  />
                </div>
                <div>
                  <label className="eq-label">Cobrança</label>
                  <select
                    className="eq-input"
                    value={form.billingType}
                    onChange={(e) => setForm((f) => ({ ...f, billingType: e.target.value }))}
                  >
                    <option value="AVULSA">Avulsa (financeiro)</option>
                    <option value="PACOTE">Pacote / crédito</option>
                    <option value="CORTESIA">Cortesia</option>
                  </select>
                </div>
              </div>
              {form.billingType === "AVULSA" ? (
                <p className="rounded-lg border border-borderEq bg-cream/60 px-3 py-2 text-xs text-olive-muted">
                  Este valor será lançado automaticamente em <strong>Contas a receber</strong>,
                  vinculado a este agendamento.
                </p>
              ) : form.billingType === "PACOTE" ? (
                <p className="rounded-lg border border-borderEq bg-cream/60 px-3 py-2 text-xs text-olive-muted">
                  Sessão via pacote — não gera cobrança avulsa no financeiro.
                </p>
              ) : (
                <p className="rounded-lg border border-borderEq bg-cream/60 px-3 py-2 text-xs text-olive-muted">
                  Cortesia — sem lançamento financeiro.
                </p>
              )}
              {selected?.receivables?.[0] ? (
                <p className="text-xs text-olive">
                  Financeiro vinculado: {formatMoney(selected.receivables[0].amountCents)} ·{" "}
                  {selected.receivables[0].status}
                </p>
              ) : null}
              <div>
                <label className="eq-label">Sala</label>
                <select
                  className="eq-input"
                  value={form.roomId}
                  onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
                >
                  <option value="">Sem sala</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="eq-label">Data e horário</label>
                <input
                  className="eq-input"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  required
                />
              </div>
              {selected ? (
                <div>
                  <label className="eq-label">Status</label>
                  <select
                    className="eq-input"
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
              <button className="eq-btn w-full" disabled={saving || deleting}>
                {saving
                  ? "Salvando..."
                  : selected
                    ? "Salvar alterações"
                    : "Confirmar agendamento"}
              </button>
              {selected ? (
                <button
                  type="button"
                  className="w-full rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
                  disabled={saving || deleting}
                  onClick={onDelete}
                >
                  {deleting ? "Excluindo..." : "Excluir agendamento"}
                </button>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
