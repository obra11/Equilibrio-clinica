"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, formatDateTime, formatMoney, getToken } from "@/lib/api";

type Summary = {
  patientsCount: number;
  receberAbertoCents: number | null;
  pagarAbertoCents: number | null;
  appointmentsToday: Array<{
    id: string;
    startsAt: string;
    status: string;
    patient: { fullName: string };
    professional: { fullName: string };
    serviceType: { name: string };
  }>;
  classesToday: Array<{
    id: string;
    title: string;
    startsAt: string;
    capacity: number;
    enrollments: unknown[];
    professional: { fullName: string };
  }>;
};

type ReminderResult = {
  ok?: boolean;
  status?: string;
  detail?: string;
  waUrl?: string;
  patientName?: string;
  fullName?: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const summary = await api<Summary>("/dashboard/summary");
    setData(summary);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    load().catch((e) => setError(e.message));
  }, [router]);

  async function remindAppointment(id: string) {
    setBusyId(id);
    setError("");
    setInfo("");
    try {
      const res = await api<ReminderResult>(`/appointments/${id}/reminder`, {
        method: "POST",
      });
      setInfo(
        res.ok
          ? `Lembrete enviado para ${res.patientName || "o paciente"}.`
          : res.detail || "Lembrete não enviado automaticamente.",
      );
      if (res.waUrl && (!res.ok || res.status === "simulated" || res.status === "skipped")) {
        window.open(res.waUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar lembrete");
    } finally {
      setBusyId(null);
    }
  }

  async function remindClass(id: string) {
    setBusyId(id);
    setError("");
    setInfo("");
    try {
      const res = await api<{
        sent: number;
        total: number;
        title: string;
        results: ReminderResult[];
      }>(`/classes/${id}/reminders`, { method: "POST" });
      setInfo(`Aula "${res.title}": ${res.sent}/${res.total} lembrete(s) enviados.`);
      const firstLink = res.results?.find(
        (r) => r.waUrl && (!r.ok || r.status === "simulated" || r.status === "skipped"),
      );
      if (firstLink?.waUrl && res.sent === 0) {
        window.open(firstLink.waUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar lembretes da aula");
    } finally {
      setBusyId(null);
    }
  }

  async function remindToday(scope: "appointments" | "classes" | "all") {
    const label =
      scope === "appointments"
        ? "todos os atendimentos de hoje"
        : scope === "classes"
          ? "os alunos das aulas de hoje"
          : "atendimentos e aulas de hoje";
    if (!window.confirm(`Enviar lembretes para ${label}?`)) return;
    setBusyId(`bulk-${scope}`);
    setError("");
    setInfo("");
    try {
      const res = await api<{
        appointments: { sent: number; total: number };
        classes: { sent: number; total: number };
      }>("/dashboard/remind-today", {
        method: "POST",
        body: JSON.stringify({ scope }),
      });
      setInfo(
        `Atendimentos: ${res.appointments.sent}/${res.appointments.total} · Aulas: ${res.classes.sent} aluno(s) em ${res.classes.total} turma(s).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar lembretes");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-olive">Painel do dia</h1>
          <p className="mt-1 text-sm text-olive-muted">
            Visão rápida da operação · lembretes pelo WhatsApp +55 48 98488-2418
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="eq-btn-ghost"
            disabled={Boolean(busyId)}
            onClick={() => remindToday("appointments")}
          >
            Lembrar atendimentos
          </button>
          <button
            type="button"
            className="eq-btn-ghost"
            disabled={Boolean(busyId)}
            onClick={() => remindToday("classes")}
          >
            Lembrar aulas
          </button>
          <button
            type="button"
            className="eq-btn"
            disabled={Boolean(busyId)}
            onClick={() => remindToday("all")}
          >
            {busyId?.startsWith("bulk-") ? "Enviando..." : "Lembrar todos hoje"}
          </button>
        </div>
      </div>
      {error ? <p className="mb-3 text-red-700">{error}</p> : null}
      {info ? <p className="mb-3 text-sm text-olive">{info}</p> : null}
      {!data ? (
        <p className="text-olive-muted">Carregando...</p>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <div className="eq-card">
              <p className="eq-label">Pacientes</p>
              <p className="font-display text-3xl text-olive">{data.patientsCount}</p>
            </div>
            {data.receberAbertoCents !== null ? (
              <div className="eq-card">
                <p className="eq-label">A receber</p>
                <p className="font-display text-3xl text-olive">
                  {formatMoney(data.receberAbertoCents)}
                </p>
              </div>
            ) : null}
            {data.pagarAbertoCents !== null ? (
              <div className="eq-card">
                <p className="eq-label">A pagar</p>
                <p className="font-display text-3xl text-olive">
                  {formatMoney(data.pagarAbertoCents)}
                </p>
              </div>
            ) : null}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="eq-card">
              <h2 className="mb-4 font-display text-xl text-olive">Atendimentos de hoje</h2>
              <div className="space-y-3">
                {data.appointmentsToday.length === 0 ? (
                  <p className="text-sm text-olive-muted">Nenhum atendimento hoje.</p>
                ) : (
                  data.appointmentsToday.map((a) => (
                    <div key={a.id} className="rounded-lg border border-borderEq bg-cream/50 p-3">
                      <p className="font-medium text-charcoal">{a.patient.fullName}</p>
                      <p className="text-sm text-olive-muted">
                        {formatDateTime(a.startsAt)} · {a.serviceType.name} ·{" "}
                        {a.professional.fullName}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gold">
                          {a.status}
                        </p>
                        <button
                          type="button"
                          className="text-xs font-semibold text-olive underline"
                          disabled={Boolean(busyId)}
                          onClick={() => remindAppointment(a.id)}
                        >
                          {busyId === a.id ? "Enviando..." : "Enviar lembrete"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
            <section className="eq-card">
              <h2 className="mb-4 font-display text-xl text-olive">Aulas de Pilates hoje</h2>
              <div className="space-y-3">
                {data.classesToday.length === 0 ? (
                  <p className="text-sm text-olive-muted">Nenhuma aula hoje.</p>
                ) : (
                  data.classesToday.map((c) => (
                    <div key={c.id} className="rounded-lg border border-borderEq bg-cream/50 p-3">
                      <p className="font-medium text-charcoal">{c.title}</p>
                      <p className="text-sm text-olive-muted">
                        {formatDateTime(c.startsAt)} · {c.professional.fullName}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <p className="text-xs text-olive">
                          {c.enrollments.length}/{c.capacity} inscritos
                        </p>
                        <button
                          type="button"
                          className="text-xs font-semibold text-olive underline"
                          disabled={Boolean(busyId)}
                          onClick={() => remindClass(c.id)}
                        >
                          {busyId === c.id ? "Enviando..." : "Lembrar alunos"}
                        </button>
                        <Link
                          href={`/pilates/${c.id}`}
                          className="text-xs font-semibold text-olive underline"
                        >
                          Abrir aula
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </AppShell>
  );
}
