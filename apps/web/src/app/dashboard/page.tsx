"use client";

import { useEffect, useState } from "react";
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

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<Summary>("/dashboard/summary")
      .then(setData)
      .catch((e) => setError(e.message));
  }, [router]);

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="font-display text-3xl text-olive">Painel do dia</h1>
        <p className="mt-1 text-sm text-olive-muted">
          Visão rápida da operação da clínica Equilíbrio
        </p>
      </div>
      {error ? <p className="text-red-700">{error}</p> : null}
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
                        {formatDateTime(a.startsAt)} · {a.serviceType.name} · {a.professional.fullName}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gold">
                        {a.status}
                      </p>
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
                      <p className="mt-1 text-xs text-olive">
                        {c.enrollments.length}/{c.capacity} inscritos
                      </p>
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
