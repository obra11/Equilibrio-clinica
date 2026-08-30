"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ClassForm, ClassFormValues, toLocalInput } from "@/components/ClassForm";
import { api, formatDateTime, getToken } from "@/lib/api";

type ClassSession = {
  id: string;
  title: string;
  capacity: number;
  startsAt: string;
  endsAt: string;
  notes?: string | null;
  lessonPlan?: string | null;
  professionalId: string;
  serviceTypeId: string;
  roomId?: string | null;
  professional: { fullName: string };
  room?: { name: string } | null;
  enrollments: Array<{
    id: string;
    status: string;
    patient: { id: string; fullName: string };
  }>;
};

type Patient = { id: string; fullName: string };

const ENROLL_STATUSES = ["CONFIRMADO", "LISTA_ESPERA", "PRESENTE", "FALTOU", "CANCELADO"];

export default function AulaPilatesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<ClassSession | null>(null);
  const [initial, setInitial] = useState<ClassFormValues | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [enrollPatientId, setEnrollPatientId] = useState("");
  const [enrollStatus, setEnrollStatus] = useState("CONFIRMADO");
  const [lessonPlan, setLessonPlan] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function load() {
    const [cls, pats] = await Promise.all([
      api<ClassSession>(`/classes/${id}`),
      api<Patient[]>("/patients"),
    ]);
    setSession(cls);
    setLessonPlan(cls.lessonPlan || "");
    setInitial({
      title: cls.title,
      professionalId: cls.professionalId,
      serviceTypeId: cls.serviceTypeId,
      roomId: cls.roomId || "",
      capacity: String(cls.capacity),
      startsAt: toLocalInput(new Date(cls.startsAt)),
      notes: cls.notes || "",
      weekdays: [],
      weeksCount: "8",
      repeatUntil: "",
    });
    setPatients(pats);
    if (!enrollPatientId && pats[0]) setEnrollPatientId(pats[0].id);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    load().catch((e) => setError(e.message));
  }, [id, router]);

  async function enroll(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(`/classes/${id}/enroll`, {
        method: "POST",
        body: JSON.stringify({ patientId: enrollPatientId, status: enrollStatus }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao inscrever");
    }
  }

  async function changeStatus(enrollmentId: string, status: string) {
    setError("");
    try {
      await api(`/classes/enrollments/${enrollmentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  async function removeEnrollment(enrollmentId: string, name: string) {
    if (!window.confirm(`Remover "${name}" desta aula?`)) return;
    setError("");
    try {
      await api(`/classes/enrollments/${enrollmentId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  async function saveLessonPlan(e: FormEvent) {
    e.preventDefault();
    setSavingPlan(true);
    setPlanSaved(false);
    setError("");
    try {
      await api(`/classes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ lessonPlan: lessonPlan.trim() || null }),
      });
      setPlanSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar plano de aula");
    } finally {
      setSavingPlan(false);
    }
  }

  const filled =
    session?.enrollments.filter((e) => e.status === "CONFIRMADO" || e.status === "PRESENTE")
      .length ?? 0;

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-olive">
            {session?.title || "Aula"}
          </h1>
          <p className="mt-1 text-sm text-olive-muted">
            {session
              ? `${formatDateTime(session.startsAt)} · ${session.professional.fullName}`
              : "Carregando..."}
          </p>
        </div>
        <Link href="/pilates" className="eq-btn-ghost">
          Voltar às turmas
        </Link>
      </div>

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {saved ? (
        <p className="mb-4 text-sm text-olive">Dados da aula salvos.</p>
      ) : null}

      {!session || !initial ? (
        <p className="text-olive-muted">Carregando...</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <div>
              <h2 className="mb-3 font-display text-xl text-olive">Editar aula</h2>
              <ClassForm
                key={session.id}
                initial={initial}
                submitLabel="Salvar alterações"
                onCancel={() => router.push("/pilates")}
                onSubmit={async (values) => {
                  setSaved(false);
                  await api(`/classes/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      title: values.title,
                      professionalId: values.professionalId,
                      serviceTypeId: values.serviceTypeId,
                      roomId: values.roomId || null,
                      capacity: Number(values.capacity),
                      startsAt: new Date(values.startsAt).toISOString(),
                      endsAt: values.endsAt,
                      notes: values.notes || null,
                    }),
                  });
                  setSaved(true);
                  await load();
                }}
              />
            </div>

            <form onSubmit={saveLessonPlan} className="eq-card space-y-3">
              <div>
                <h2 className="font-display text-xl text-olive">Plano de aula</h2>
                <p className="mt-1 text-sm text-olive-muted">
                  Monte a sequência: aquecimento, exercícios, foco e observações da turma.
                </p>
              </div>
              <textarea
                className="eq-input min-h-40"
                value={lessonPlan}
                onChange={(e) => {
                  setLessonPlan(e.target.value);
                  setPlanSaved(false);
                }}
                placeholder={`Exemplo:
1. Aquecimento — respiração e mobilidade (5 min)
2. Centragem — hundred / bridge
3. Fortalecimento — series of 5
4. Alongamento e fechamento`}
              />
              {planSaved ? (
                <p className="text-sm text-olive">Plano de aula salvo.</p>
              ) : null}
              <button className="eq-btn" disabled={savingPlan}>
                {savingPlan ? "Salvando..." : "Salvar plano de aula"}
              </button>
            </form>
          </div>

          <div className="space-y-4">
            <div className="eq-card">
              <div className="mb-3 flex items-end justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl text-olive">Alunos inscritos</h2>
                  <p className="text-xs text-olive-muted">
                    Abra o prontuário para evolução e anamnese de cada aluno
                  </p>
                </div>
                <p className="text-sm font-semibold text-gold">
                  {filled}/{session.capacity} vagas
                </p>
              </div>

              <form onSubmit={enroll} className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <select
                  className="eq-input"
                  value={enrollPatientId}
                  onChange={(e) => setEnrollPatientId(e.target.value)}
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </select>
                <select
                  className="eq-input"
                  value={enrollStatus}
                  onChange={(e) => setEnrollStatus(e.target.value)}
                >
                  {ENROLL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button className="eq-btn whitespace-nowrap">Inscrever</button>
              </form>

              {session.enrollments.length === 0 ? (
                <p className="text-sm text-olive-muted">Nenhum aluno inscrito ainda.</p>
              ) : (
                <ul className="space-y-2">
                  {session.enrollments.map((e) => (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-borderEq/70 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-olive">{e.patient.fullName}</p>
                        <Link
                          href={`/pacientes/${e.patient.id}`}
                          className="text-xs font-semibold text-olive underline-offset-2 hover:underline"
                        >
                          Abrir prontuário →
                        </Link>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          className="eq-input py-1 text-xs"
                          value={e.status}
                          onChange={(ev) => changeStatus(e.id, ev.target.value)}
                        >
                          {ENROLL_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="text-xs text-red-700 hover:underline"
                          onClick={() => removeEnrollment(e.id, e.patient.fullName)}
                        >
                          Remover
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
