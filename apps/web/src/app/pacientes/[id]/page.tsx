"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PatientAvatar } from "@/components/PatientAvatar";
import { formatCep, formatCpf } from "@/components/PatientForm";
import { api, formatDateTime, getStoredUser, getToken } from "@/lib/api";

type Appointment = {
  id: string;
  startsAt: string;
  endsAt?: string;
  status: string;
  notes?: string | null;
  serviceType: { name: string };
  professional: { fullName: string; color?: string };
  room?: { name: string } | null;
};

type Enrollment = {
  id: string;
  status: string;
  classSession: {
    title: string;
    startsAt: string;
    endsAt?: string;
    professional: { fullName: string; color?: string };
    serviceType: { name: string };
    room?: { name: string } | null;
  };
};

type PatientDetail = {
  id: string;
  fullName: string;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  photoUrl?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  isParticular: boolean;
  insuranceName?: string | null;
  appointments: Appointment[];
  enrollments: Enrollment[];
  sessionNotes: Array<{
    id: string;
    createdAt: string;
    subjective?: string | null;
    objective?: string | null;
    assessment?: string | null;
    plan?: string | null;
    professional: { fullName: string };
  }>;
  assessments: Array<{
    id: string;
    createdAt: string;
    painVas?: number | null;
    romNotes?: string | null;
    professional: { fullName: string };
  }>;
};

type HistoryFilter = "todos" | "realizados" | "agendados" | "faltas";

type HistoryItem = {
  id: string;
  kind: "individual" | "grupo";
  startsAt: string;
  title: string;
  professional: string;
  color?: string;
  room?: string | null;
  status: string;
};

function statusTone(status: string) {
  if (status === "CONCLUIDO" || status === "PRESENTE") return "bg-olive/10 text-olive";
  if (status === "CANCELADO" || status === "FALTA") return "bg-red-50 text-red-700";
  if (status === "CONFIRMADO" || status === "CHECK_IN") return "bg-gold/20 text-olive";
  return "bg-cream text-olive-muted";
}

export default function PacienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = getStoredUser();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("todos");
  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [painVas, setPainVas] = useState("0");
  const [romNotes, setRomNotes] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await api<PatientDetail>(`/patients/${id}`);
    setPatient(data);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    load().catch((e) => setError(e.message));
  }, [id, router]);

  const history = useMemo<HistoryItem[]>(() => {
    if (!patient) return [];
    const individual: HistoryItem[] = (patient.appointments || []).map((a) => ({
      id: a.id,
      kind: "individual",
      startsAt: a.startsAt,
      title: a.serviceType.name,
      professional: a.professional.fullName,
      color: a.professional.color,
      room: a.room?.name,
      status: a.status,
    }));
    const group: HistoryItem[] = (patient.enrollments || []).map((e) => ({
      id: e.id,
      kind: "grupo",
      startsAt: e.classSession.startsAt,
      title: e.classSession.title || e.classSession.serviceType.name,
      professional: e.classSession.professional.fullName,
      color: e.classSession.professional.color,
      room: e.classSession.room?.name,
      status: e.status,
    }));
    return [...individual, ...group].sort(
      (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
  }, [patient]);

  const filteredHistory = useMemo(() => {
    return history.filter((h) => {
      if (historyFilter === "realizados") {
        return h.status === "CONCLUIDO" || h.status === "PRESENTE";
      }
      if (historyFilter === "agendados") {
        return ["AGENDADO", "CONFIRMADO", "CHECK_IN"].includes(h.status);
      }
      if (historyFilter === "faltas") {
        return h.status === "FALTA" || h.status === "CANCELADO";
      }
      return true;
    });
  }, [history, historyFilter]);

  const stats = useMemo(() => {
    const realizados = history.filter((h) => h.status === "CONCLUIDO" || h.status === "PRESENTE").length;
    const agendados = history.filter((h) =>
      ["AGENDADO", "CONFIRMADO", "CHECK_IN"].includes(h.status),
    ).length;
    const faltas = history.filter((h) => h.status === "FALTA" || h.status === "CANCELADO").length;
    return { total: history.length, realizados, agendados, faltas };
  }, [history]);

  async function saveNote(e: FormEvent) {
    e.preventDefault();
    if (!user?.professional?.id) {
      setError("Usuário sem profissional vinculado");
      return;
    }
    await api("/clinical/notes", {
      method: "POST",
      body: JSON.stringify({
        patientId: id,
        professionalId: user.professional.id,
        subjective,
        objective,
        assessment,
        plan,
      }),
    });
    setSubjective("");
    setObjective("");
    setAssessment("");
    setPlan("");
    await load();
  }

  async function saveAssessment(e: FormEvent) {
    e.preventDefault();
    if (!user?.professional?.id) {
      setError("Usuário sem profissional vinculado");
      return;
    }
    await api("/clinical/assessments", {
      method: "POST",
      body: JSON.stringify({
        patientId: id,
        professionalId: user.professional.id,
        painVas: Number(painVas),
        romNotes,
      }),
    });
    setRomNotes("");
    await load();
  }

  if (!patient) {
    return (
      <AppShell>
        <p className="text-olive-muted">{error || "Carregando..."}</p>
      </AppShell>
    );
  }

  const address = [
    patient.street,
    patient.number,
    patient.complement,
    patient.neighborhood,
    patient.city && patient.state ? `${patient.city}/${patient.state}` : patient.city,
    patient.zipCode ? formatCep(patient.zipCode) : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <PatientAvatar
            patientId={patient.id}
            fullName={patient.fullName}
            photoUrl={patient.photoUrl}
            size="lg"
            onUpdated={(photoUrl) => setPatient((prev) => (prev ? { ...prev, photoUrl } : prev))}
          />
          <div>
            <h1 className="font-display text-3xl text-olive">{patient.fullName}</h1>
            <p className="mt-1 text-sm text-olive-muted">
              Prontuário, evolução e histórico — clique na foto para alterar
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="eq-btn-ghost"
            onClick={async () => {
              try {
                const res = await api<{
                  ok: boolean;
                  status: string;
                  detail?: string;
                  to?: string;
                }>(`/patients/${id}/welcome-whatsapp`, { method: "POST" });
                if (res.status === "sent") {
                  window.alert(`WhatsApp enviado para ${res.to}`);
                } else if (res.status === "simulated") {
                  window.alert(
                    `WhatsApp simulado para ${res.to}.\nConfigure Evolution/Meta no .env para envio real.`,
                  );
                } else {
                  window.alert(res.detail || "Não foi possível enviar o WhatsApp");
                }
              } catch (e) {
                window.alert(e instanceof Error ? e.message : "Erro ao enviar WhatsApp");
              }
            }}
          >
            WhatsApp boas-vindas
          </button>
          <Link href={`/pacientes/${id}/editar`} className="eq-btn-ghost">
            Editar cadastro
          </Link>
          <Link href="/pacientes" className="eq-btn-ghost">
            Voltar à lista
          </Link>
        </div>
      </div>

      <section className="eq-card mb-6 grid gap-3 text-sm md:grid-cols-3">
        <div>
          <p className="eq-label">CPF</p>
          <p>{patient.cpf ? formatCpf(patient.cpf) : "—"}</p>
        </div>
        <div>
          <p className="eq-label">E-mail</p>
          <p>{patient.email || "—"}</p>
        </div>
        <div>
          <p className="eq-label">Contato</p>
          <p>{patient.whatsapp || patient.phone || "—"}</p>
        </div>
        <div className="md:col-span-2">
          <p className="eq-label">Endereço</p>
          <p>{address || "—"}</p>
        </div>
        <div>
          <p className="eq-label">Tipo</p>
          <p>{patient.isParticular ? "Particular" : patient.insuranceName || "Convênio"}</p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={saveNote} className="eq-card space-y-3">
          <h2 className="font-display text-xl text-olive">Evolução (SOAP)</h2>
          <textarea className="eq-input min-h-20" placeholder="Subjetivo" value={subjective} onChange={(e) => setSubjective(e.target.value)} />
          <textarea className="eq-input min-h-20" placeholder="Objetivo" value={objective} onChange={(e) => setObjective(e.target.value)} />
          <textarea className="eq-input min-h-20" placeholder="Avaliação" value={assessment} onChange={(e) => setAssessment(e.target.value)} />
          <textarea className="eq-input min-h-20" placeholder="Plano" value={plan} onChange={(e) => setPlan(e.target.value)} />
          <button className="eq-btn">Registrar evolução</button>
        </form>

        <form onSubmit={saveAssessment} className="eq-card space-y-3">
          <h2 className="font-display text-xl text-olive">Avaliação física</h2>
          <div>
            <label className="eq-label">Dor VAS (0–10)</label>
            <input className="eq-input" type="number" min={0} max={10} value={painVas} onChange={(e) => setPainVas(e.target.value)} />
          </div>
          <textarea className="eq-input min-h-24" placeholder="ADM / goniometria" value={romNotes} onChange={(e) => setRomNotes(e.target.value)} />
          <button className="eq-btn">Salvar avaliação</button>
        </form>
      </div>

      <section className="eq-card mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-olive">Histórico de atendimentos</h2>
            <p className="text-sm text-olive-muted">
              Registro completo — individuais e aulas em grupo
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-cream px-3 py-1 text-olive">Total: {stats.total}</span>
            <span className="rounded-full bg-olive/10 px-3 py-1 text-olive">
              Realizados: {stats.realizados}
            </span>
            <span className="rounded-full bg-gold/20 px-3 py-1 text-olive">
              Agendados: {stats.agendados}
            </span>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["todos", "Todos"],
              ["realizados", "Realizados"],
              ["agendados", "Agendados"],
              ["faltas", "Faltas/Cancelados"],
            ] as Array<[HistoryFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={historyFilter === key ? "eq-btn" : "eq-btn-ghost"}
              onClick={() => setHistoryFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {filteredHistory.length === 0 ? (
          <p className="py-8 text-center text-sm text-olive-muted">
            Nenhum atendimento neste filtro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-borderEq text-xs uppercase tracking-wide text-olive-muted">
                  <th className="py-2 pr-3">Data</th>
                  <th className="pr-3">Tipo</th>
                  <th className="pr-3">Serviço / Aula</th>
                  <th className="pr-3">Profissional</th>
                  <th className="pr-3">Sala</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => (
                  <tr key={`${h.kind}-${h.id}`} className="border-b border-borderEq/70">
                    <td className="py-3 pr-3 whitespace-nowrap">{formatDateTime(h.startsAt)}</td>
                    <td className="pr-3">
                      <span className="rounded-full bg-cream px-2 py-0.5 text-xs text-olive">
                        {h.kind === "individual" ? "Individual" : "Grupo"}
                      </span>
                    </td>
                    <td className="pr-3 font-medium text-charcoal">{h.title}</td>
                    <td className="pr-3">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: h.color || "#585E45" }}
                        />
                        {h.professional}
                      </span>
                    </td>
                    <td className="pr-3 text-olive-muted">{h.room || "—"}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(h.status)}`}>
                        {h.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="eq-card">
          <h2 className="mb-3 font-display text-xl text-olive">Linha do tempo clínica</h2>
          <div className="space-y-3">
            {patient.sessionNotes.length === 0 && patient.assessments.length === 0 ? (
              <p className="text-sm text-olive-muted">Sem evoluções registradas ainda.</p>
            ) : null}
            {patient.sessionNotes.map((n) => (
              <div key={n.id} className="rounded-lg border border-borderEq bg-cream/40 p-3 text-sm">
                <p className="font-semibold text-olive">
                  {formatDateTime(n.createdAt)} · {n.professional.fullName}
                </p>
                {n.subjective ? <p>S: {n.subjective}</p> : null}
                {n.objective ? <p>O: {n.objective}</p> : null}
                {n.assessment ? <p>A: {n.assessment}</p> : null}
                {n.plan ? <p>P: {n.plan}</p> : null}
              </div>
            ))}
            {patient.assessments.map((a) => (
              <div key={a.id} className="rounded-lg border border-borderEq bg-cream/40 p-3 text-sm">
                <p className="font-semibold text-olive">
                  Avaliação · {formatDateTime(a.createdAt)} · {a.professional.fullName}
                </p>
                <p>VAS: {a.painVas ?? "—"}</p>
                {a.romNotes ? <p>{a.romNotes}</p> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="eq-card">
          <h2 className="mb-3 font-display text-xl text-olive">Resumo rápido</h2>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-borderEq p-3">
              <p className="eq-label">Último atendimento</p>
              {history[0] ? (
                <>
                  <p className="font-medium">{history[0].title}</p>
                  <p className="text-olive-muted">
                    {formatDateTime(history[0].startsAt)} · {history[0].professional} · {history[0].status}
                  </p>
                </>
              ) : (
                <p className="text-olive-muted">Nenhum atendimento registrado.</p>
              )}
            </div>
            <div className="rounded-lg border border-borderEq p-3">
              <p className="eq-label">Evoluções clínicas</p>
              <p className="font-display text-2xl text-olive">{patient.sessionNotes.length}</p>
            </div>
            <div className="rounded-lg border border-borderEq p-3">
              <p className="eq-label">Avaliações físicas</p>
              <p className="font-display text-2xl text-olive">{patient.assessments.length}</p>
            </div>
          </div>
        </section>
      </div>
      {error ? <p className="mt-4 text-red-700">{error}</p> : null}
    </AppShell>
  );
}
