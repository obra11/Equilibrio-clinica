"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, formatDateTime, getToken } from "@/lib/api";

type ClassSession = {
  id: string;
  title: string;
  capacity: number;
  startsAt: string;
  seriesGroupId?: string | null;
  weekdays?: string | number[] | null;
  professional: { fullName: string };
  room?: { name: string } | null;
  enrollments: Array<{
    id: string;
    status: string;
    patient: { id: string; fullName: string };
  }>;
};

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};

function filledCount(c: ClassSession) {
  return c.enrollments.filter((e) => e.status === "CONFIRMADO" || e.status === "PRESENTE")
    .length;
}

function weekdayText(c: ClassSession) {
  let days: number[] = [];
  if (Array.isArray(c.weekdays)) days = c.weekdays;
  else if (typeof c.weekdays === "string" && c.weekdays) {
    try {
      days = JSON.parse(c.weekdays) as number[];
    } catch {
      days = [];
    }
  }
  if (!days.length) return null;
  return days.map((d) => WEEKDAY_LABELS[d] || String(d)).join(" · ");
}

export default function PilatesPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const to = new Date();
    to.setDate(to.getDate() + 60);
    const cls = await api<ClassSession[]>(
      `/classes?from=${from.toISOString()}&to=${to.toISOString()}`,
    );
    setClasses(cls);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    load().catch((e) => setError(e.message));
  }, [router]);

  async function onDelete(c: ClassSession) {
    const ok = window.confirm(
      `Excluir a aula "${c.title}" em ${formatDateTime(c.startsAt)}?\nAs inscrições também serão removidas.`,
    );
    if (!ok) return;
    setError("");
    setDeletingId(c.id);
    try {
      await api(`/classes/${c.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-olive">Pilates em grupo</h1>
          <p className="mt-1 text-sm text-olive-muted">
            Turmas da semana e próximas — abra para editar e gerenciar inscritos
          </p>
        </div>
        <Link href="/pilates/novo" className="eq-btn">
          Nova aula
        </Link>
      </div>

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}

      {classes.length === 0 ? (
        <div className="eq-card py-12 text-center">
          <p className="text-olive-muted">Nenhuma aula no período.</p>
          <Link href="/pilates/novo" className="eq-btn mt-4 inline-flex">
            Criar primeira aula
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => {
            const filled = filledCount(c);
            const full = filled >= c.capacity;
            return (
              <article key={c.id} className="eq-card flex flex-col">
                <div className="mb-3">
                  <h2 className="font-display text-xl text-olive">{c.title}</h2>
                  <p className="mt-1 text-sm text-olive-muted">
                    {formatDateTime(c.startsAt)}
                  </p>
                  <p className="text-sm text-olive-muted">{c.professional.fullName}</p>
                  {weekdayText(c) ? (
                    <p className="mt-1 text-xs font-semibold text-gold">
                      {weekdayText(c)}
                      {c.seriesGroupId ? " · recorrente" : ""}
                    </p>
                  ) : null}
                  {c.room?.name ? (
                    <p className="text-xs text-charcoal/70">{c.room.name}</p>
                  ) : null}
                </div>
                <p
                  className={`mb-3 text-sm font-semibold ${full ? "text-red-700" : "text-gold"}`}
                >
                  {filled}/{c.capacity} vagas
                  {full ? " · lotada" : ""}
                </p>
                <ul className="mb-4 flex-1 space-y-1 text-sm text-olive-muted">
                  {c.enrollments.length === 0 ? (
                    <li>• Sem inscritos</li>
                  ) : (
                    c.enrollments.slice(0, 4).map((e) => (
                      <li key={e.id}>
                        • {e.patient.fullName}
                        <span className="ml-1 text-xs opacity-70">({e.status})</span>
                      </li>
                    ))
                  )}
                  {c.enrollments.length > 4 ? (
                    <li className="text-xs">+ {c.enrollments.length - 4} aluno(s)</li>
                  ) : null}
                </ul>
                <div className="flex gap-2 border-t border-borderEq pt-3">
                  <Link
                    href={`/pilates/${c.id}`}
                    className="eq-btn-ghost flex-1 text-center text-xs"
                  >
                    Abrir / Editar
                  </Link>
                  <button
                    type="button"
                    className="flex-1 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50"
                    disabled={deletingId === c.id}
                    onClick={() => onDelete(c)}
                  >
                    {deletingId === c.id ? "..." : "Excluir"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
